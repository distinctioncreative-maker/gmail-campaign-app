/**
 * CSV serialization for data export.
 *
 * Pure, because the escaping is the part that has to be right and the part
 * that is easiest to get subtly wrong.
 *
 * Two separate concerns share this file and are often confused:
 *
 * 1. **RFC 4180 quoting**, so a comma, quote, or newline inside a value does
 *    not shift every subsequent column. This is a correctness problem.
 * 2. **Formula injection**, so a value beginning with =, +, -, or @ is not
 *    executed when the customer opens the file. This is a security problem,
 *    and quoting does not solve it: Excel and Sheets evaluate a leading = even
 *    inside quotes. A lead whose company name is `=HYPERLINK("http://evil",
 *    "Click")` was typed by whoever filled in the form, travelled through
 *    import untouched, and runs on the machine of the person who exported it.
 */

/** Characters a spreadsheet treats as the start of a formula. */
const FORMULA_START = /^[=+\-@\t\r]/;

/**
 * Neutralise a value that a spreadsheet would evaluate.
 *
 * A leading apostrophe is the conventional fix and is what the major
 * spreadsheet applications strip on display, so the exported value still reads
 * correctly to a human while no longer being executable. Prefixing beats
 * stripping: silently deleting a leading minus would turn -50 into 50, which
 * corrupts real data in the name of safety.
 */
export function neutralizeFormula(value: string): string {
  return FORMULA_START.test(value) ? `'${value}` : value;
}

/** One CSV field: formula-guarded, then RFC 4180 quoted if it needs it. */
export function csvField(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "boolean") return value ? "true" : "false";
  const raw = typeof value === "number" ? String(value) : String(value);
  // Numbers are safe from both concerns and must not gain a stray apostrophe,
  // which would turn a number into text in the customer's spreadsheet.
  const guarded = typeof value === "number" ? raw : neutralizeFormula(raw);
  return /[",\n\r]/.test(guarded) ? `"${guarded.replace(/"/g, '""')}"` : guarded;
}

export function csvRow(values: readonly unknown[]): string {
  return values.map(csvField).join(",");
}

/**
 * An epoch-millis timestamp as ISO 8601, or empty.
 *
 * ISO rather than a locale string: an export is read by other software as
 * often as by a person, and "3/4/2026" is a different day depending on who
 * opens it.
 */
export function csvTimestamp(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "";
  return new Date(value).toISOString();
}

export const EXPORT_DATASETS = [
  "leads",
  "campaigns",
  "recipients",
  "suppressions",
  "templates",
  "sequences",
] as const;

export type ExportDataset = (typeof EXPORT_DATASETS)[number];

interface DatasetInfo {
  label: string;
  /** What is in it, in the words of someone deciding whether they need it. */
  description: string;
  headers: readonly string[];
}

export const DATASET_INFO: Record<ExportDataset, DatasetInfo> = {
  leads: {
    label: "Leads",
    description: "Every contact, with engagement history and opt-out state.",
    headers: [
      "email",
      "firstName",
      "lastName",
      "fullName",
      "businessName",
      "phone",
      "region",
      "leadSource",
      "emailOptOut",
      "campaignCount",
      "lastCampaignName",
      "lastCampaignAt",
      "lastOutcome",
      "firstSeenAt",
      "lastSeenAt",
    ],
  },
  campaigns: {
    label: "Campaigns",
    description: "Every campaign with its settings and its totals.",
    headers: [
      "campaignId",
      "name",
      "status",
      "totalRecipients",
      "sentCount",
      "followupSentCount",
      "replyCount",
      "bounceCount",
      "unsubscribeCount",
      "meetingCount",
      "wonCount",
      "lostCount",
      "wonValueCents",
      "createdAt",
      "startedAt",
      "completedAt",
    ],
  },
  recipients: {
    label: "Sending history",
    description: "One row per person per campaign: what was sent and what came back.",
    headers: [
      "campaignId",
      "email",
      "fullName",
      "businessName",
      "status",
      "included",
      "exclusionReason",
      "currentStep",
      "initialSentAt",
      "lastSentAt",
      "repliedAt",
      "replyIntent",
      "bouncedAt",
      "unsubscribedAt",
      "dealStatus",
      "dealValueCents",
    ],
  },
  suppressions: {
    label: "Do not email",
    description: "Addresses suppressed from sending, and why.",
    headers: ["email", "reason", "source", "createdAt"],
  },
  templates: {
    label: "Templates",
    description: "Subject lines and bodies, as written.",
    headers: ["templateId", "name", "subject", "body", "createdAt", "updatedAt"],
  },
  sequences: {
    label: "Follow-ups",
    description: "Sequences and their steps.",
    headers: ["sequenceId", "name", "stepCount", "createdAt", "updatedAt"],
  },
};

/** A stable, sortable filename that says what it is and when it was taken. */
export function exportFilename(dataset: ExportDataset, at: number): string {
  const day = new Date(at).toISOString().slice(0, 10);
  return `cadence-${dataset}-${day}.csv`;
}
