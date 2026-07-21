import { z } from "zod";

/**
 * Pure engagement math for leads — no Firestore access, fully unit-testable.
 * The recipient records on campaigns are the source of truth; these helpers
 * roll them up into the per-contact engagement fields shown on the Leads
 * pages (emails sent, replies back, last outcome).
 */

/** Fields a rep may edit from the lead page. Email is intentionally not
 * editable: it is the dedup key and is snapshotted into campaigns. */
export const ContactPatchSchema = z.object({
  fullName: z.string().trim().max(200).optional(),
  businessName: z.string().trim().max(200).optional(),
  phone: z.string().trim().max(50).optional(),
  region: z.string().trim().max(100).optional(),
  requestedAmount: z.number().nonnegative().nullable().optional(),
  leadSource: z.string().trim().max(100).optional(),
  notes: z.string().max(5000).optional(),
  emailOptOut: z.boolean().optional(),
});
export type ContactPatch = z.infer<typeof ContactPatchSchema>;

/** Split an edited full name into first/last so template variables like
 * {{firstName}} keep working after a rename. */
export function splitFullName(fullName: string): { firstName: string; lastName: string } {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: "", lastName: "" };
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
}

export interface RecipientEngagementRow {
  contactId: string;
  initialSentAt: number | null;
  lastSentAt: number | null;
  currentStep: number;
  repliedAt: number | null;
  bouncedAt: number | null;
  unsubscribedAt: number | null;
  bounceType?: string | null;
}

export interface ContactEngagement {
  emailsSentCount: number;
  replyCount: number;
  repliedAt: number | null; // first reply ever
  lastRepliedAt: number | null; // most recent reply
  bouncedAt: number | null;
  unsubscribedAt: number | null;
  lastOutcome: string | null;
  hardBounced: boolean;
}

/** Roll recipient records up into per-contact engagement totals. */
export function engagementFromRecipients(
  rows: RecipientEngagementRow[]
): Map<string, ContactEngagement> {
  const out = new Map<string, ContactEngagement>();
  for (const r of rows) {
    const e =
      out.get(r.contactId) ??
      ({
        emailsSentCount: 0,
        replyCount: 0,
        repliedAt: null,
        lastRepliedAt: null,
        bouncedAt: null,
        unsubscribedAt: null,
        lastOutcome: null,
        hardBounced: false,
      } satisfies ContactEngagement);

    // One initial send + one email per completed follow-up step.
    if (r.initialSentAt !== null) e.emailsSentCount += r.currentStep + 1;
    if (r.repliedAt !== null) {
      e.replyCount += 1;
      e.repliedAt = e.repliedAt === null ? r.repliedAt : Math.min(e.repliedAt, r.repliedAt);
      e.lastRepliedAt = Math.max(e.lastRepliedAt ?? 0, r.repliedAt);
    }
    if (r.bouncedAt !== null) {
      e.bouncedAt = Math.max(e.bouncedAt ?? 0, r.bouncedAt);
      if (r.bounceType === "HARD") e.hardBounced = true;
    }
    if (r.unsubscribedAt !== null) e.unsubscribedAt = Math.max(e.unsubscribedAt ?? 0, r.unsubscribedAt);

    out.set(r.contactId, e);
  }

  // Most recent event wins as the human-readable "last outcome".
  for (const e of out.values()) e.lastOutcome = latestOutcome(e);
  return out;
}

function latestOutcome(e: ContactEngagement): string | null {
  const events: Array<[number | null, string]> = [
    [e.emailsSentCount > 0 ? 0 : null, "EMAILED"], // baseline when anything sent
    [e.lastRepliedAt, "REPLIED"],
    [e.bouncedAt, "BOUNCED"],
    [e.unsubscribedAt, "UNSUBSCRIBED"],
  ];
  let best: string | null = null;
  let bestAt = -1;
  for (const [at, label] of events) {
    if (at !== null && at >= bestAt) {
      bestAt = at;
      best = label;
    }
  }
  return best;
}
