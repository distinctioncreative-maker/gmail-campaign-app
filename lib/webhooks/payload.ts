import type { WebhookDeliveryEvent } from "@/schemas/integration";

/**
 * What a webhook delivery actually says.
 *
 * Pure, and deliberately the only place an event body is constructed. Every
 * emission site goes through one of the builders below rather than assembling
 * an object inline, because a webhook payload is a published interface: a
 * customer writes code against these field names, and a site that invented its
 * own shape would break that contract without anything failing on our side.
 *
 * Two rules govern what may appear here.
 *
 * **The envelope is fixed.** `id`, `event`, `createdAt`, `workspaceId`, `data`.
 * A receiver reads the envelope to route and deduplicate, and reads `data` for
 * the event itself. New fields go inside `data`, never beside it.
 *
 * **Only facts the receiver can act on.** A webhook target is an address on
 * someone else's infrastructure, so the payload is the one part of this feature
 * that leaves our control entirely. Identifiers, the address, the outcome, and
 * timestamps go. The body of a lead's reply does not, beyond the same short
 * preview already shown in the Replies inbox: a CRM needs to know a reply
 * arrived and who sent it, and does not need a transcript posted to a third
 * party to do its job.
 */

/** How much inbound reply text travels. Matches `lastReplySnippet`. */
const PREVIEW_LIMIT = 280;

export interface EventEnvelope {
  id: string;
  event: WebhookDeliveryEvent;
  createdAt: number;
  workspaceId: string;
  data: Record<string, unknown>;
}

export function buildEnvelope(input: {
  deliveryId: string;
  event: WebhookDeliveryEvent;
  organizationId: string;
  occurredAt: number;
  data: Record<string, unknown>;
}): EventEnvelope {
  return {
    id: input.deliveryId,
    event: input.event,
    createdAt: input.occurredAt,
    workspaceId: input.organizationId,
    data: input.data,
  };
}

/** The bytes signed and sent. One place, so the signature basis is unambiguous. */
export function serializeEnvelope(envelope: EventEnvelope): string {
  return JSON.stringify(envelope);
}

function preview(text: string): string {
  const flat = String(text ?? "")
    .replace(/\s+/g, " ")
    .trim();
  return flat.length > PREVIEW_LIMIT ? `${flat.slice(0, PREVIEW_LIMIT)}…` : flat;
}

interface CampaignRef {
  campaignId: string;
  campaignName: string;
  recipientId: string;
  email: string;
}

function campaignFields(ref: CampaignRef): Record<string, unknown> {
  return {
    campaignId: ref.campaignId,
    campaignName: ref.campaignName,
    recipientId: ref.recipientId,
    email: ref.email,
  };
}

export function replyReceivedData(
  input: CampaignRef & {
    /** How the reply read, from triage. Not what the rep did about it. */
    replyIntent: "INTERESTED" | "REPLIED" | "NOT_INTERESTED" | null;
    snippet: string;
    repliedAt: number;
  }
): Record<string, unknown> {
  return {
    ...campaignFields(input),
    replyIntent: input.replyIntent,
    preview: preview(input.snippet),
    repliedAt: input.repliedAt,
  };
}

export function emailBouncedData(
  input: CampaignRef & {
    /** HARD means the address was also added to the do-not-email list, which a
     * receiving system usually wants to mirror. UNKNOWN travels as itself: a
     * bounce we could not read is not a soft bounce, and saying otherwise would
     * have a receiver act on our guess. */
    bounceType: "HARD" | "SOFT" | "UNKNOWN";
    bouncedAt: number;
  }
): Record<string, unknown> {
  return {
    ...campaignFields(input),
    bounceType: input.bounceType,
    suppressed: input.bounceType === "HARD",
    bouncedAt: input.bouncedAt,
  };
}

export function contactUnsubscribedData(
  input: Partial<CampaignRef> & {
    email: string;
    /** Where the opt-out came from. A one-click header unsubscribe and a reply
     * saying "remove me" are the same outcome by different routes, and a
     * receiver auditing consent needs to tell them apart. */
    source: "UNSUBSCRIBE_LINK" | "REPLY_MONITOR";
    unsubscribedAt: number;
  }
): Record<string, unknown> {
  return {
    campaignId: input.campaignId ?? null,
    campaignName: input.campaignName ?? null,
    recipientId: input.recipientId ?? null,
    email: input.email,
    source: input.source,
    unsubscribedAt: input.unsubscribedAt,
  };
}

export function dealUpdatedData(
  input: CampaignRef & {
    /** Null means the rep cleared the outcome. A receiver that created a record
     * on the first event needs to hear about the undo. */
    dealStatus: "MEETING_BOOKED" | "WON" | "LOST" | null;
    dealValueCents: number | null;
    dealNote: string;
    updatedAt: number;
  }
): Record<string, unknown> {
  return {
    ...campaignFields(input),
    dealStatus: input.dealStatus,
    dealValueCents: input.dealValueCents,
    dealNote: preview(input.dealNote),
    updatedAt: input.updatedAt,
  };
}

/** The test ping, which has to be recognisable as a test on the receiving end
 * so a customer wiring up verification cannot mistake it for a real reply and
 * create a record from it. */
export function testPingData(input: { triggeredByUserId: string }): Record<string, unknown> {
  return {
    test: true,
    message: "This is a test delivery from Cadence. No real event occurred.",
    triggeredByUserId: input.triggeredByUserId,
  };
}
