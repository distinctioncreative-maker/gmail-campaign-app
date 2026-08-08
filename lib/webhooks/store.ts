import "server-only";
import crypto from "node:crypto";
import { firestore } from "@/lib/firebase/admin";
import {
  WebhookDeliverySchema,
  WebhookEndpointSchema,
  type WebhookDelivery,
  type WebhookDeliveryEvent,
  type WebhookEndpoint,
  type WebhookEndpointPublic,
  type WebhookEvent,
} from "@/schemas/integration";
import { generateSigningSecret } from "./signature";

/**
 * Where subscriptions and deliveries live.
 *
 * Both are subcollections of the organization document rather than a top-level
 * collection keyed by org. That is the opposite of the choice
 * lib/apiKeys/store.ts makes, and for a reason worth stating: a key is looked
 * up *by the credential* with no idea which workspace it belongs to, so it has
 * to be findable without one. A webhook is only ever looked up in the context of
 * a workspace we already identified, so nesting costs nothing and buys the thing
 * deletion cares about: `recursiveDelete` on the organization document removes
 * every subscription and every queued delivery with it, without deletion having
 * to know this feature exists.
 *
 * The endpoint list is cached briefly. Emission happens inside the reply and
 * bounce sweeps, which loop over recipients, and the overwhelming majority of
 * workspaces have no webhooks at all: without a cache every reply in every
 * workspace would pay a query to discover that nothing is subscribed.
 */

/** Ceiling per workspace. Each subscription multiplies every event into another
 * outbound request, so this bounds fan-out as well as clutter. */
export const MAX_ENDPOINTS_PER_ORG = 5;

/** How many attempt lines one delivery keeps. Six attempts plus room for the
 * terminal line; a delivery is not an audit log. */
const MAX_HISTORY = 8;

const ENDPOINT_CACHE_TTL_MS = 30_000;

const endpointsRef = (organizationId: string) =>
  firestore().collection("organizations").doc(organizationId).collection("webhookEndpoints");

const deliveriesRef = (organizationId: string) =>
  firestore().collection("organizations").doc(organizationId).collection("webhookDeliveries");

/** Public shapes only: the signing secret is read fresh at delivery time and is
 * never held in a module-level map. */
const endpointCache = new Map<string, { at: number; rows: WebhookEndpointPublic[] }>();

export function invalidateWebhookEndpoints(organizationId: string): void {
  endpointCache.delete(organizationId);
}

function toPublic(endpoint: WebhookEndpoint): WebhookEndpointPublic {
  const { signingSecret: _omit, ...safe } = endpoint;
  return safe;
}

export async function listWebhookEndpoints(
  organizationId: string
): Promise<WebhookEndpointPublic[]> {
  const cached = endpointCache.get(organizationId);
  if (cached && Date.now() - cached.at < ENDPOINT_CACHE_TTL_MS) return cached.rows;

  const snap = await endpointsRef(organizationId).limit(MAX_ENDPOINTS_PER_ORG * 4).get();
  const rows = snap.docs
    .map((doc) => toPublic(WebhookEndpointSchema.parse(doc.data())))
    .sort((a, b) => b.createdAt - a.createdAt);
  endpointCache.set(organizationId, { at: Date.now(), rows });
  return rows;
}

/**
 * Which subscriptions want this event.
 *
 * A disabled endpoint is skipped here rather than at delivery time, so a dead
 * endpoint stops creating delivery documents and queue entries the moment it is
 * turned off.
 */
export async function subscribersFor(
  organizationId: string,
  event: WebhookEvent
): Promise<WebhookEndpointPublic[]> {
  const all = await listWebhookEndpoints(organizationId);
  return all.filter((row) => row.enabled && row.events.includes(event));
}

/** The full record, secret included. Delivery only, and always read fresh so a
 * rotated secret takes effect on the next attempt. */
export async function getWebhookEndpoint(
  organizationId: string,
  endpointId: string
): Promise<WebhookEndpoint | null> {
  const snap = await endpointsRef(organizationId).doc(endpointId).get();
  return snap.exists ? WebhookEndpointSchema.parse(snap.data()) : null;
}

export async function createWebhookEndpoint(input: {
  organizationId: string;
  createdByUserId: string;
  /** Must already have passed validateWebhookTarget. */
  url: string;
  description: string;
  events: WebhookEvent[];
}): Promise<{ endpoint: WebhookEndpointPublic; signingSecret: string } | { error: string }> {
  const existing = await listWebhookEndpoints(input.organizationId);
  if (existing.length >= MAX_ENDPOINTS_PER_ORG) {
    return {
      error: `A workspace can have ${MAX_ENDPOINTS_PER_ORG} webhook endpoints. Remove one you are not using first.`,
    };
  }
  // Two subscriptions to the same URL would double every delivery, which reads
  // as duplicate events on the receiving end rather than as a configuration
  // mistake here.
  if (existing.some((row) => row.url === input.url)) {
    return { error: "That URL is already subscribed. Edit the existing subscription instead." };
  }

  const now = Date.now();
  const endpointId = crypto.randomUUID();
  const record: WebhookEndpoint = WebhookEndpointSchema.parse({
    endpointId,
    organizationId: input.organizationId,
    createdByUserId: input.createdByUserId,
    url: input.url,
    description: input.description,
    events: input.events,
    signingSecret: generateSigningSecret(),
    enabled: true,
    disabledReason: "",
    lastDeliveryAt: null,
    lastStatus: null,
    consecutiveFailures: 0,
    createdAt: now,
    updatedAt: now,
  });
  await endpointsRef(input.organizationId).doc(endpointId).set(record);
  invalidateWebhookEndpoints(input.organizationId);
  return { endpoint: toPublic(record), signingSecret: record.signingSecret };
}

export async function setWebhookEndpointEnabled(
  organizationId: string,
  endpointId: string,
  enabled: boolean
): Promise<boolean> {
  const ref = endpointsRef(organizationId).doc(endpointId);
  const snap = await ref.get();
  if (!snap.exists) return false;
  await ref.update({
    enabled,
    // Re-enabling clears both the reason and the failure count, otherwise a
    // subscription fixed after an outage would disable itself again on its next
    // single failure.
    disabledReason: "",
    consecutiveFailures: enabled ? 0 : snap.data()?.consecutiveFailures ?? 0,
    updatedAt: Date.now(),
  });
  invalidateWebhookEndpoints(organizationId);
  return true;
}

/** Turned off by the delivery worker rather than by a person. */
export async function disableWebhookEndpoint(
  organizationId: string,
  endpointId: string,
  reason: string
): Promise<void> {
  await endpointsRef(organizationId)
    .doc(endpointId)
    .update({ enabled: false, disabledReason: reason.slice(0, 200), updatedAt: Date.now() })
    .catch(() => {
      /* The subscription may have been deleted mid-delivery. */
    });
  invalidateWebhookEndpoints(organizationId);
}

export async function deleteWebhookEndpoint(
  organizationId: string,
  endpointId: string
): Promise<boolean> {
  const ref = endpointsRef(organizationId).doc(endpointId);
  const snap = await ref.get();
  if (!snap.exists) return false;
  await ref.delete();
  invalidateWebhookEndpoints(organizationId);
  return true;
}

/** Record the result of one attempt against the subscription itself, so the
 * card can show health without reading the deliveries list. */
export async function recordEndpointAttempt(
  organizationId: string,
  endpointId: string,
  input: { status: number | null; delivered: boolean }
): Promise<number> {
  const ref = endpointsRef(organizationId).doc(endpointId);
  const consecutive = await firestore().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return 0;
    const prior = WebhookEndpointSchema.parse(snap.data());
    const next = input.delivered ? 0 : prior.consecutiveFailures + 1;
    tx.update(ref, {
      lastDeliveryAt: Date.now(),
      lastStatus: input.status,
      consecutiveFailures: next,
      updatedAt: Date.now(),
    });
    return next;
  });
  invalidateWebhookEndpoints(organizationId);
  return consecutive;
}

/** A delivery id, minted by the caller.
 *
 * The id is inside the signed body as the event id, so it has to exist before
 * the body does. Generating it here rather than at the write keeps that ordering
 * from turning into a second write to patch the body afterwards. */
export function newDeliveryId(): string {
  return crypto.randomUUID();
}

export async function createDelivery(input: {
  deliveryId: string;
  organizationId: string;
  endpointId: string;
  url: string;
  event: WebhookDeliveryEvent;
  body: string;
}): Promise<WebhookDelivery> {
  const now = Date.now();
  const record: WebhookDelivery = WebhookDeliverySchema.parse({
    deliveryId: input.deliveryId,
    organizationId: input.organizationId,
    endpointId: input.endpointId,
    url: input.url,
    event: input.event,
    body: input.body,
    attempt: 0,
    status: "PENDING",
    lastStatus: null,
    history: [],
    nextAttemptAt: now,
    createdAt: now,
    updatedAt: now,
  });
  await deliveriesRef(input.organizationId).doc(record.deliveryId).set(record);
  return record;
}

export async function getDelivery(
  organizationId: string,
  deliveryId: string
): Promise<WebhookDelivery | null> {
  const snap = await deliveriesRef(organizationId).doc(deliveryId).get();
  return snap.exists ? WebhookDeliverySchema.parse(snap.data()) : null;
}

export async function updateDelivery(
  organizationId: string,
  deliveryId: string,
  patch: {
    attempt: number;
    status: WebhookDelivery["status"];
    lastStatus: number | null;
    historyLine: string;
    nextAttemptAt: number | null;
    priorHistory: string[];
  }
): Promise<void> {
  await deliveriesRef(organizationId)
    .doc(deliveryId)
    .update({
      attempt: patch.attempt,
      status: patch.status,
      lastStatus: patch.lastStatus,
      // Trimmed from the front: the terminal line is the one worth keeping.
      history: [...patch.priorHistory, patch.historyLine].slice(-MAX_HISTORY),
      nextAttemptAt: patch.nextAttemptAt,
      updatedAt: Date.now(),
    });
}

export async function listRecentDeliveries(
  organizationId: string,
  limit = 20
): Promise<WebhookDelivery[]> {
  const snap = await deliveriesRef(organizationId)
    .orderBy("createdAt", "desc")
    .limit(limit)
    .get();
  return snap.docs.map((doc) => WebhookDeliverySchema.parse(doc.data()));
}
