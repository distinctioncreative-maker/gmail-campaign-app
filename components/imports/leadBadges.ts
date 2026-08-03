import type { ParsedLead } from "@/schemas/parsedLead";

export type ClassifiedLead = ParsedLead & {
  classification: string;
  lastCampaignName: string | null;
  lastCampaignAt: number | null;
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
          l.classification !== "REPLIED_BEFORE"
      )
      .map((l) => l.index)
  );
}
