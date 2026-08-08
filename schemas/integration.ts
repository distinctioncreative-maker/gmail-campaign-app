import { z } from "zod";
import { EpochMillis } from "./common";

/** Scopes must match lib/apiKeys/token.ts; duplicated here to keep the schema
 * file free of a server-only import. The test asserts they agree. */
export const ApiScopeSchema = z.enum([
  "leads:read",
  "leads:write",
  "campaigns:read",
  "campaigns:write",
  "reports:read",
]);

export const ApiKeySchema = z.object({
  keyId: z.string().min(1),
  organizationId: z.string().min(1),
  createdByUserId: z.string().min(1),
  /** Whose data this key reads and writes.
   *
   * Leads, campaigns, and templates are all stored under users/{userId}, so a
   * key needs a real owner: scoping by organizationId alone would address a
   * document that does not exist and quietly write to a subtree the app never
   * reads. Defaults to the creator and is stored separately from them, so a
   * workspace can hand the integration to someone else when that person leaves
   * without reissuing the key. */
  ownerUserId: z.string().min(1),
  name: z.string().trim().min(1).max(60),
  /** SHA-256 of the secret. The secret itself is never stored: see
   * lib/apiKeys/token.ts for why, and for what that costs the UI. */
  hash: z.string().min(64).max(64),
  /** Safe to show. Identifies a key in a list without revealing it. */
  display: z.string().min(1).max(40),
  environment: z.enum(["live", "test"]),
  scopes: z.array(ApiScopeSchema).default([]),
  lastUsedAt: EpochMillis.nullable().default(null),
  /** Revoked rather than deleted, so an audit question about a key that was
   * used last month still has an answer. */
  revokedAt: EpochMillis.nullable().default(null),
  createdAt: EpochMillis,
  updatedAt: EpochMillis,
});
export type ApiKey = z.infer<typeof ApiKeySchema>;

/** Shape safe to return to the browser. Excludes the hash, which is not a
 * credential but is also not something a client has any use for. */
export const ApiKeyPublicSchema = ApiKeySchema.omit({ hash: true });
export type ApiKeyPublic = z.infer<typeof ApiKeyPublicSchema>;

export const WEBHOOK_EVENTS = [
  "reply.received",
  "email.bounced",
  "contact.unsubscribed",
  "deal.updated",
] as const;
export const WebhookEventSchema = z.enum(WEBHOOK_EVENTS);
export type WebhookEvent = z.infer<typeof WebhookEventSchema>;

export const WebhookEndpointSchema = z.object({
  endpointId: z.string().min(1),
  organizationId: z.string().min(1),
  createdByUserId: z.string().min(1),
  /** Validated by lib/webhooks/target.ts before it is ever stored. */
  url: z.string().url(),
  description: z.string().trim().max(120).default(""),
  events: z.array(WebhookEventSchema).min(1),
  /** Shown once on creation, like an API key, and needed by the receiver to
   * verify signatures. Stored in the clear because verification requires the
   * same secret on both sides: it is a shared secret, not a password. */
  signingSecret: z.string().min(1),
  enabled: z.boolean().default(true),
  /** Set when deliveries are turned off automatically, e.g. a 410 Gone. */
  disabledReason: z.string().max(200).default(""),
  lastDeliveryAt: EpochMillis.nullable().default(null),
  lastStatus: z.number().int().nullable().default(null),
  consecutiveFailures: z.number().int().nonnegative().default(0),
  createdAt: EpochMillis,
  updatedAt: EpochMillis,
});
export type WebhookEndpoint = z.infer<typeof WebhookEndpointSchema>;

export const WebhookEndpointPublicSchema = WebhookEndpointSchema.omit({ signingSecret: true });
export type WebhookEndpointPublic = z.infer<typeof WebhookEndpointPublicSchema>;

/** The event a "send a test" button produces.
 *
 * Kept out of WEBHOOK_EVENTS on purpose: it is not something a customer can
 * subscribe to, it is something they can trigger. Listing it as a subscribable
 * event would put a checkbox in the interface for an event that never fires on
 * its own. */
export const WEBHOOK_TEST_EVENT = "test.ping";

/** What a delivery can carry: any subscribable event, plus the test ping. */
export const WebhookDeliveryEventSchema = z.union([
  WebhookEventSchema,
  z.literal(WEBHOOK_TEST_EVENT),
]);
export type WebhookDeliveryEvent = z.infer<typeof WebhookDeliveryEventSchema>;

export const WebhookDeliverySchema = z.object({
  deliveryId: z.string().min(1),
  organizationId: z.string().min(1),
  endpointId: z.string().min(1),
  /** Snapshotted from the endpoint, so the deliveries list still says where a
   * delivery went after the subscription was edited or removed. */
  url: z.string().url(),
  event: WebhookDeliveryEventSchema,
  /** The exact bytes that were signed, stored rather than rebuilt.
   *
   * A retry has to present the identical body: the signature is over
   * `timestamp.body`, so re-serializing and getting so much as a different key
   * order would produce a payload the receiver's replay cache no longer
   * recognises as the same event. */
  body: z.string(),
  attempt: z.number().int().nonnegative().default(0),
  status: z.enum(["PENDING", "DELIVERED", "RETRYING", "FAILED"]),
  /** HTTP status of the most recent attempt, or null when there was no
   * response at all. The response *body* is deliberately never stored: see
   * lib/webhooks/deliver.ts. */
  lastStatus: z.number().int().nullable().default(null),
  /** One readable line per attempt, oldest first, capped at write time. */
  history: z.array(z.string()).default([]),
  nextAttemptAt: EpochMillis.nullable().default(null),
  createdAt: EpochMillis,
  updatedAt: EpochMillis,
});
export type WebhookDelivery = z.infer<typeof WebhookDeliverySchema>;
