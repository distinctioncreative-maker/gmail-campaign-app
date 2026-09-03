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
 * launch: the classification is never trusted from an earlier stage.
 *
 * `ignoreFileOptOut` exists because an opt-out column in an uploaded file and
 * a person asking you to stop are not the same fact, and only one of them is
 * a promise you made.
 *
 * A column reading "Opt Out" in someone's CRM export usually means opted out
 * of a newsletter, or out of a product the exporting company sold, or a field
 * a rep ticked years ago for a reason nobody recorded. It is a third party's
 * claim about a different system. A person who unsubscribed from YOUR email,
 * hard-bounced, or filed a complaint is a different thing entirely, and this
 * flag can never reach any of them: they carry the reasons UNSUBSCRIBED,
 * HARD_BOUNCE and COMPLAINT, and MANUAL means someone here made a deliberate
 * decision. Only EMAIL_OPT_OUT is in scope, and EMAIL_OPT_OUT is written in
 * exactly one place in this codebase, from exactly one source: a column in a
 * file the user uploaded.
 */
export async function classifyLead(
  ctx: Scope,
  lead: { email: string | null; emailValid: boolean; emailOptOut: boolean | null },
  options: { ignoreFileOptOut?: boolean } = {}
): Promise<ClassifiedLeadInfo> {
  const ignoreFileOptOut = options.ignoreFileOptOut === true;

  if (!lead.email || !lead.emailValid) {
    return { classification: "INVALID", lastCampaignName: null, lastCampaignAt: null };
  }
  if (lead.emailOptOut === true && !ignoreFileOptOut) {
    return { classification: "EMAIL_OPT_OUT", lastCampaignName: null, lastCampaignAt: null };
  }

  const normalizedEmail = normalizeEmail(lead.email);
  const [suppression, existing] = await Promise.all([
    isSuppressed(ctx, normalizedEmail),
    findByNormalizedEmail(ctx, normalizedEmail),
  ]);

  // An EMAIL_OPT_OUT suppression from an EARLIER import of the same file is in
  // scope too, and missing this is what would have made the override useless
  // in practice: import once respecting the column, decide the column was
  // wrong, re-import, and the suppression written the first time would come
  // back as SUPPRESSED and block it again. Same fact, same provenance, so the
  // same decision applies to it.
  const overridable = ignoreFileOptOut && suppression?.reason === "EMAIL_OPT_OUT";

  if (suppression && !overridable) {
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
