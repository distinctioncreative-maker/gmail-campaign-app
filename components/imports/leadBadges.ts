import type { ParsedLead } from "@/schemas/parsedLead";
import type { VerificationResult } from "@/lib/leads/verify";

export type ClassifiedLead = ParsedLead & {
  classification: string;
  lastCampaignName: string | null;
  lastCampaignAt: number | null;
  /** Attached by the preview routes. Optional so an older cached response
   * cannot break the table. */
  verification?: VerificationResult;
};

/** How a verification verdict reads in the preview. Undeliverable addresses
 * cannot be selected: importing an address with no mail server behind it is
 * buying a bounce, and the bounce brake will eventually stop the campaign
 * that sends to it.
 *
 * "Checked" rather than "Verified", which was the wrong word. Nothing short of
 * sending confirms a mailbox exists, and the checks that ran are about syntax,
 * the domain, and the mailbox name. Overstating that made the honest tier next to
 * it look like a downgrade rather than the truth. */
export const VERDICT_BADGES: Record<
  string,
  { label: string; className: string; selectable: boolean }
> = {
  DELIVERABLE: { label: "Checked", className: "bg-success-soft text-success", selectable: true },
  // Neutral, not a warning. Most business domains behind a forwarding service
  // land here, and colouring it amber would tell customers their good list is
  // full of problems.
  UNCONFIRMABLE: { label: "Cannot confirm", className: "bg-surface-2 text-muted", selectable: true },
  RISKY: { label: "Risky", className: "bg-warning-soft text-warning", selectable: true },
  UNDELIVERABLE: { label: "Undeliverable", className: "bg-danger-soft text-danger", selectable: false },
};

export const BADGES: Record<string, { label: string; className: string; selectable: boolean }> = {
  NEW: { label: "Ready", className: "bg-success-soft text-success", selectable: true },
  EXISTING_NOT_CONTACTED: { label: "Ready", className: "bg-success-soft text-success", selectable: true },
  CONTACTED_BEFORE: { label: "Used before", className: "bg-info-soft text-info", selectable: true },
  REPLIED_BEFORE: { label: "Replied before", className: "bg-info-soft text-info", selectable: true },
  INVALID: { label: "Missing email", className: "bg-danger-soft text-danger", selectable: false },
  EMAIL_OPT_OUT: { label: "Opted out", className: "bg-warning-soft text-warning", selectable: false },
  UNSUBSCRIBED: { label: "Unsubscribed", className: "bg-warning-soft text-warning", selectable: false },
  BOUNCED: { label: "Bounced before", className: "bg-warning-soft text-warning", selectable: false },
  SUPPRESSED: { label: "Excluded for safety", className: "bg-warning-soft text-warning", selectable: false },
  TEAM_COLLISION: { label: "Teammate contacted", className: "bg-warning-soft text-warning", selectable: false },
};

export function badgeFor(classification: string) {
  return (
    BADGES[classification] ?? {
      label: classification,
      className: "bg-surface-2 text-muted",
      selectable: false,
    }
  );
}

/** Safe leads are pre-selected; previously contacted require explicit opt-in. */
export function defaultSelection(leads: ClassifiedLead[]): Set<number> {
  return new Set(
    leads
      .filter(
        (l) =>
          badgeFor(l.classification).selectable &&
          l.classification !== "CONTACTED_BEFORE" &&
          l.classification !== "REPLIED_BEFORE" &&
          // Risky addresses stay selectable but come unticked: a role inbox
          // is a judgement call the customer should make deliberately.
          l.verification?.verdict !== "RISKY" &&
          l.verification?.verdict !== "UNDELIVERABLE"
      )
      .map((l) => l.index)
  );
}

/** True when this row may be imported at all. */
export function isSelectable(lead: ClassifiedLead): boolean {
  if (lead.verification?.verdict === "UNDELIVERABLE") return false;
  return badgeFor(lead.classification).selectable;
}
