import type { ParsedLead } from "@/schemas/parsedLead";

export type ClassifiedLead = ParsedLead & {
  classification: string;
  lastCampaignName: string | null;
  lastCampaignAt: number | null;
};

export const BADGES: Record<string, { label: string; className: string; selectable: boolean }> = {
  NEW: { label: "Ready", className: "bg-green-100 text-green-700", selectable: true },
  EXISTING_NOT_CONTACTED: { label: "Ready", className: "bg-green-100 text-green-700", selectable: true },
  CONTACTED_BEFORE: { label: "Used before", className: "bg-blue-100 text-blue-700", selectable: true },
  REPLIED_BEFORE: { label: "Replied before", className: "bg-blue-100 text-blue-700", selectable: true },
  INVALID: { label: "Missing email", className: "bg-red-100 text-red-700", selectable: false },
  EMAIL_OPT_OUT: { label: "Opted out", className: "bg-amber-100 text-amber-700", selectable: false },
  UNSUBSCRIBED: { label: "Unsubscribed", className: "bg-amber-100 text-amber-700", selectable: false },
  BOUNCED: { label: "Bounced before", className: "bg-amber-100 text-amber-700", selectable: false },
  SUPPRESSED: { label: "Excluded for safety", className: "bg-amber-100 text-amber-700", selectable: false },
  TEAM_COLLISION: { label: "Teammate contacted", className: "bg-amber-100 text-amber-700", selectable: false },
};

export function badgeFor(classification: string) {
  return (
    BADGES[classification] ?? {
      label: classification,
      className: "bg-slate-100 text-slate-600",
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
