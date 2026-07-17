import "server-only";
import type { Scope } from "@/lib/repositories/scope";
import type { LeadClassification } from "@/schemas/contact";
import { normalizeEmail } from "@/lib/parser/normalize";
import { findByNormalizedEmail } from "@/lib/repositories/contacts";
import { isSuppressed } from "@/lib/repositories/suppressions";

export interface ClassifiedLeadInfo {
  classification: LeadClassification;
  lastCampaignName: string | null;
  lastCampaignAt: number | null;
}

/**
 * Classify one prospective lead against the CURRENT USER's history and
 * suppressions. Used at import preview, campaign review, and again at
 * launch — the classification is never trusted from an earlier stage.
 */
export async function classifyLead(
  ctx: Scope,
  lead: { email: string | null; emailValid: boolean; emailOptOut: boolean | null }
): Promise<ClassifiedLeadInfo> {
  if (!lead.email || !lead.emailValid) {
    return { classification: "INVALID", lastCampaignName: null, lastCampaignAt: null };
  }
  if (lead.emailOptOut === true) {
    return { classification: "EMAIL_OPT_OUT", lastCampaignName: null, lastCampaignAt: null };
  }

  const normalizedEmail = normalizeEmail(lead.email);
  const [suppression, existing] = await Promise.all([
    isSuppressed(ctx, normalizedEmail),
    findByNormalizedEmail(ctx, normalizedEmail),
  ]);

  if (suppression) {
    const classification: LeadClassification =
      suppression.reason === "UNSUBSCRIBED"
        ? "UNSUBSCRIBED"
        : suppression.reason === "HARD_BOUNCE"
          ? "BOUNCED"
          : "SUPPRESSED";
    return {
      classification,
      lastCampaignName: existing?.lastCampaignName ?? null,
      lastCampaignAt: existing?.lastCampaignAt ?? null,
    };
  }

  if (existing) {
    return {
      classification: existing.repliedAt
        ? "REPLIED_BEFORE"
        : existing.campaignCount > 0
          ? "CONTACTED_BEFORE"
          : "EXISTING_NOT_CONTACTED",
      lastCampaignName: existing.lastCampaignName,
      lastCampaignAt: existing.lastCampaignAt,
    };
  }

  return { classification: "NEW", lastCampaignName: null, lastCampaignAt: null };
}
