import type { ParsedLead, ParseResult } from "@/schemas/parsedLead";
import { isValidEmail, splitFullName } from "./normalize";

/**
 * Parser for text copied out of a Salesforce lead list view.
 *
 * The copied text is a sequence of records, each starting with a
 * "Select Item N" marker followed by one field per line. Fields are
 * classified by pattern (phone, email, amount, timestamps, boolean flags,
 * numeric source ID) rather than by fixed position, so a missing optional
 * field (amount, source ID, flags) never shifts the remaining fields.
 * Free-text lines are assigned positionally: name, business, region,
 * lead source — in that order.
 */

const RECORD_MARKER = /^\s*Select\s+(?:All\s+)?Item\s+\d+\s*$/im;
const PHONE_RE = /^\+?1?\s*\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}$/;
const AMOUNT_RE = /^\$?\s?\d{1,3}(?:,\d{3})*\.\d{2}$|^\$?\s?\d+\.\d{2}$/;
const EMAIL_LINE_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TIMESTAMP_RE =
  /^\d{1,2}\/\d{1,2}\/\d{2,4},?\s+\d{1,2}:\d{2}(?::\d{2})?\s*(?:AM|PM)?$/i;
const OPT_OUT_RE = /^(True|False)\s*Email\s*Opt\s*Out$/i;
const NEVER_SWITCHED_RE = /^(True|False)\s*Never\s*Switched\s*from\s*NEW$/i;
const SOURCE_ID_RE = /^\d{1,10}$/;

type TokenType =
  | "phone"
  | "amount"
  | "email"
  | "timestamp"
  | "optOut"
  | "neverSwitched"
  | "sourceId"
  | "text";

interface Token {
  type: TokenType;
  value: string;
}

function classifyLine(line: string): Token {
  if (PHONE_RE.test(line)) return { type: "phone", value: line };
  if (AMOUNT_RE.test(line)) return { type: "amount", value: line };
  if (EMAIL_LINE_RE.test(line)) return { type: "email", value: line };
  if (TIMESTAMP_RE.test(line)) return { type: "timestamp", value: line };
  if (OPT_OUT_RE.test(line)) return { type: "optOut", value: line };
  if (NEVER_SWITCHED_RE.test(line)) return { type: "neverSwitched", value: line };
  if (SOURCE_ID_RE.test(line)) return { type: "sourceId", value: line };
  return { type: "text", value: line };
}

/** Normalize pasted text: line endings, non-breaking spaces, tabs, stray UI text. */
export function normalizeRawText(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/ /g, " ")
    // Salesforce Lightning cells often paste as markdown links. Unwrap them:
    //   [name@x.com](mailto:name@x.com) -> name@x.com  (prefer the address)
    //   [Jessica Brown](https://…/view) -> Jessica Brown
    .replace(/\[([^\]\n]+)\]\(\s*mailto:([^)\s?]+)[^)]*\)/gi, (_m, _label, addr) => addr)
    .replace(/\[([^\]\n]+)\]\([^)\n]*\)/g, (_m, label) => label)
    // Salesforce table copies separate cells with tabs; treat each cell as a line.
    .replace(/\t+/g, "\n")
    // Common copied UI chrome that carries no data.
    .replace(/^\s*(Edit|More Actions|Show Actions|Change Owner)\s*$/gim, "")
    // Bare record-link URLs left on their own line carry no data.
    .replace(/^\s*https?:\/\/\S+\s*$/gim, "");
}

function parseBoolPrefix(value: string, re: RegExp): boolean {
  const m = value.match(re);
  return m !== null && m[1].toLowerCase() === "true";
}

function parseAmount(value: string): number | null {
  const cleaned = value.replace(/[$,\s]/g, "");
  const n = Number.parseFloat(cleaned);
  return Number.isFinite(n) ? n : null;
}

function parseRecord(rawRecord: string, index: number): ParsedLead {
  const warnings: string[] = [];
  const lines = rawRecord
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const tokens = lines.map(classifyLine);
  const byType = (t: TokenType) => tokens.filter((tok) => tok.type === t);

  const textLines = byType("text").map((t) => t.value);
  const phones = byType("phone");
  const amounts = byType("amount");
  const emails = byType("email");
  const timestamps = byType("timestamp");
  const optOuts = byType("optOut");
  const neverSwitchedTokens = byType("neverSwitched");
  const sourceIds = byType("sourceId");

  let confidence = 1;
  const penalize = (amount: number, warning: string) => {
    confidence -= amount;
    warnings.push(warning);
  };

  // Positional free-text assignment: name, business, region, lead source.
  const fullName = textLines[0] ?? "";
  const businessName = textLines[1] ?? "";
  const region = textLines[2] ?? null;
  const leadSource = textLines[3] ?? null;

  if (!fullName) penalize(0.4, "Missing contact name");
  if (!businessName) penalize(0.15, "Missing business name");
  if (!region) penalize(0.05, "Missing region");
  if (!leadSource) penalize(0.05, "Missing lead source");
  if (textLines.length > 4) {
    penalize(
      0.15,
      `Unexpected extra line(s): ${textLines.slice(4).join(" | ")} — please review field placement`
    );
  }

  const emailRaw = emails[0]?.value ?? null;
  const emailValid = emailRaw !== null && isValidEmail(emailRaw);
  if (!emailRaw) penalize(0.35, "Missing email address");
  else if (!emailValid) penalize(0.3, `Email looks invalid: ${emailRaw}`);
  if (emails.length > 1) penalize(0.1, "Multiple email addresses found; using the first");

  if (phones.length === 0) penalize(0.05, "Missing phone number");
  if (amounts.length === 0) warnings.push("No requested amount found");
  if (optOuts.length === 0) penalize(0.1, "Email Opt Out flag not found");
  if (timestamps.length === 0) penalize(0.1, "No timestamps found");
  else if (timestamps.length === 1) warnings.push("Only one timestamp found; treating it as created date");
  if (timestamps.length > 2) penalize(0.05, "More than two timestamps found; using the first two");
  if (sourceIds.length === 0) warnings.push("No source record ID found");
  if (sourceIds.length > 1) penalize(0.05, "Multiple numeric IDs found; using the first");

  const { firstName, lastName } = splitFullName(fullName);

  return {
    index,
    fullName,
    firstName,
    lastName,
    businessName,
    phone: phones[0]?.value ?? null,
    region,
    requestedAmount: amounts[0] ? parseAmount(amounts[0].value) : null,
    email: emailRaw,
    emailValid,
    emailOptOut: optOuts[0] ? parseBoolPrefix(optOuts[0].value, OPT_OUT_RE) : null,
    neverSwitchedFromNew: neverSwitchedTokens[0]
      ? parseBoolPrefix(neverSwitchedTokens[0].value, NEVER_SWITCHED_RE)
      : null,
    leadSource,
    sourceCreatedAt: timestamps[0]?.value ?? null,
    sourceUpdatedAt: timestamps[1]?.value ?? null,
    sourceRecordId: sourceIds[0]?.value ?? null,
    rawText: rawRecord.trim(),
    warnings,
    confidence: Math.max(0, Math.round(confidence * 100) / 100),
  };
}

/* ------------------------------------------------------------------ *
 * Email-anchored fallback
 *
 * Salesforce Lightning collapses empty cells when a list view is copied, so
 * column positions drift row-to-row and strict grid parsing misaligns. This
 * fallback ignores position entirely: it splits the paste into one block per
 * email address, then classifies each line by TYPE (email, phone, amount,
 * date, timezone, status) and drops values that repeat across most rows
 * (owner, lead source, status — the shared column constants). What's left is
 * the person's name and business. Records with no email are skipped, since
 * they can't be emailed anyway.
 * ------------------------------------------------------------------ */

const FALLBACK_PHONE_RE = /^\+?1?[\s.-]?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}$/;
const FALLBACK_DATE_RE = /^\d{1,2}\/\d{1,2}\/\d{2,4}(,?\s+\d{1,2}:\d{2}.*)?$/;
const FALLBACK_MONEY_RE = /^[$]?\s?\d{1,3}(?:,\d{3})+(?:\.\d{2})?$|^[$]\s?\d+(?:\.\d{2})?$|^\d+\.\d{2}$/;
const FALLBACK_TZ_RE =
  /^(?:\(gmt[^)]*\)\s*)?(pacific|eastern|central|mountain|alaska|hawaii|arizona|atlantic|unknown)(?:\s*(?:time|standard time|daylight time))?$/i;
const FALLBACK_STATUS_RE = /^(active|inactive|open|closed|new|won|lost|prospecting)$/i;
const FALLBACK_COMPANY_RE =
  /\b(llc|l\.l\.c\.|inc|inc\.|incorporated|corp|corporation|co\.|company|services|service|group|enterprises?|industries|solutions|construction|trucking|transport(?:ation)?|holdings|partners|associates|consulting|studios?|salon|clinic|medical|dental|restaurant|cafe|catering|market|deli|foods?|design|builders?|contracting|roofing|painting|insurance|realty|properties|logistics|global|corp)\b|&|,\s*(?:inc|llc)/i;
const FALLBACK_NOISE = new Set([
  "-", "—", "--", "feature not included", "not included", "active", "0.00", "$0.00", "0",
]);

function isStructuralLine(l: string): boolean {
  const low = l.toLowerCase();
  return (
    EMAIL_LINE_RE.test(l) ||
    FALLBACK_PHONE_RE.test(l) ||
    FALLBACK_DATE_RE.test(l) ||
    FALLBACK_MONEY_RE.test(l) ||
    FALLBACK_TZ_RE.test(l) ||
    FALLBACK_STATUS_RE.test(l) ||
    BARE_INT_RE.test(l) ||
    FALLBACK_NOISE.has(low)
  );
}

function looksLikePersonName(l: string): boolean {
  if (FALLBACK_COMPANY_RE.test(l)) return false;
  const words = l.split(/\s+/);
  if (words.length < 1 || words.length > 4) return false;
  return /^[A-Za-z][A-Za-z'.\- ]+$/.test(l);
}

export function parseSalesforceByEmail(normalized: string): ParseResult | null {
  let lines = normalized
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  // Drop a leading header preamble: everything before the first row-number "1"
  // (this also removes duplicated header blocks that Lightning sometimes copies).
  const firstOne = lines.findIndex((l) => l === "1");
  if (firstOne > 0) lines = lines.slice(firstOne);

  if (!lines.some((l) => EMAIL_LINE_RE.test(l))) return null;

  // Prefer explicit row-number markers (1, 2, 3, …) as record boundaries —
  // they bound each record cleanly so trailing fields stay put. Fall back to
  // one-block-per-email when a paste has no row numbers.
  const rowMarkerIdxs: number[] = [];
  let expected = 1;
  lines.forEach((l, i) => {
    if (l === String(expected)) {
      rowMarkerIdxs.push(i);
      expected += 1;
    }
  });

  const blocks: string[][] = [];
  if (rowMarkerIdxs.length >= 2) {
    for (let k = 0; k < rowMarkerIdxs.length; k++) {
      const s = rowMarkerIdxs[k] + 1;
      const e = k + 1 < rowMarkerIdxs.length ? rowMarkerIdxs[k + 1] : lines.length;
      blocks.push(lines.slice(s, e));
    }
  } else {
    let start = 0;
    lines.forEach((l, i) => {
      if (EMAIL_LINE_RE.test(l)) {
        blocks.push(lines.slice(start, i + 1));
        start = i + 1;
      }
    });
  }

  // Frequency of non-structural values across blocks → shared column values
  // (owner, lead source, timezone) that should not be read as a name/business.
  const freq = new Map<string, number>();
  for (const b of blocks) {
    const seen = new Set<string>();
    for (const l of b) {
      if (isStructuralLine(l)) continue;
      const key = l.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        freq.set(key, (freq.get(key) ?? 0) + 1);
      }
    }
  }
  const noiseThreshold = Math.max(2, Math.ceil(blocks.length * 0.2));
  const isSharedValue = (l: string) => (freq.get(l.toLowerCase()) ?? 0) >= noiseThreshold;

  const leads: ParsedLead[] = [];
  blocks.forEach((b, index) => {
    const email = b.find((l) => EMAIL_LINE_RE.test(l)) ?? null;
    if (!email) return; // no email → can't be emailed → skip
    const phone = b.find((l) => FALLBACK_PHONE_RE.test(l)) ?? null;
    const amountLine = b.find((l) => FALLBACK_MONEY_RE.test(l) && !FALLBACK_NOISE.has(l.toLowerCase()));

    const candidates = b.filter((l) => !isStructuralLine(l) && !isSharedValue(l));
    const businessName = candidates.find((c) => FALLBACK_COMPANY_RE.test(c)) ?? "";
    const persons = candidates.filter((c) => c !== businessName && looksLikePersonName(c));
    // Join a First / Last split across two single-word lines; otherwise take
    // the first person-like candidate (or any leftover text).
    let nameCandidate: string;
    if (persons.length >= 2 && !persons[0].includes(" ") && !persons[1].includes(" ")) {
      nameCandidate = `${persons[0]} ${persons[1]}`;
    } else {
      nameCandidate = persons[0] ?? candidates.find((c) => c !== businessName) ?? "";
    }

    const { firstName, lastName } = splitFullName(nameCandidate);
    const emailValid = isValidEmail(email);
    const warnings: string[] = [];
    if (!nameCandidate) warnings.push("No contact name detected — please add one");
    if (!businessName) warnings.push("No business name detected");
    if (!emailValid) warnings.push(`Email looks invalid: ${email}`);

    leads.push({
      index,
      fullName: nameCandidate,
      firstName,
      lastName,
      businessName,
      phone,
      region: null,
      requestedAmount: amountLine ? parseAmount(amountLine) : null,
      email,
      emailValid,
      emailOptOut: null,
      neverSwitchedFromNew: null,
      leadSource: null,
      sourceCreatedAt: null,
      sourceUpdatedAt: null,
      sourceRecordId: null,
      rawText: b.join(" | "),
      warnings,
      confidence: emailValid ? (nameCandidate ? 0.7 : 0.5) : 0.3,
    });
  });

  if (leads.length === 0) return null;
  return {
    leads,
    totalRecords: leads.length,
    globalWarnings: [
      `Matched ${leads.length} lead${leads.length === 1 ? "" : "s"} by email. ` +
        "Names and businesses were detected automatically — please skim the preview and fix any that look off. " +
        "For perfect columns, export from Salesforce as CSV and use “Upload CSV”.",
    ],
  };
}

export function parseSalesforceText(text: string): ParseResult {
  const globalWarnings: string[] = [];
  const normalized = normalizeRawText(text);

  const markerSplit = normalized.split(new RegExp(RECORD_MARKER.source, "gim"));

  const preamble = markerSplit[0]?.trim();
  const records = markerSplit.slice(1);

  if (records.length === 0) {
    // No "Select Item N" markers. Try the strict column/grid format, then the
    // resilient email-anchored fallback — prefer whichever yields more leads
    // with a valid email (the grid parser misaligns when cells collapse).
    const columnResult = parseSalesforceColumns(normalized);
    const emailResult = parseSalesforceByEmail(normalized);
    const colValid = columnResult?.leads.filter((l) => l.emailValid).length ?? 0;
    const emailValid = emailResult?.leads.filter((l) => l.emailValid).length ?? 0;

    // Keep the richer grid result on ties; only fall back to email-anchoring
    // when it recovers strictly more valid-email leads (collapsed-cell case).
    if (emailResult && emailValid > 0 && emailValid > colValid) return emailResult;
    if (columnResult) return columnResult;
    if (emailResult) return emailResult;

    return {
      leads: [],
      totalRecords: 0,
      globalWarnings: [
        "No leads found. Paste your Salesforce list two ways: either with each " +
          'record starting on a "Select Item N" line, or copied straight from the ' +
          "column list view (a header row like First Name, Last Name, Email… " +
          "followed by numbered rows). Tip: exporting as CSV and using “Upload CSV” is the most reliable.",
      ],
    };
  }

  if (preamble) {
    globalWarnings.push("Ignored text before the first record (likely copied column headers)");
  }

  const leads = records.map((record, i) => parseRecord(record, i));
  return { leads, totalRecords: leads.length, globalWarnings };
}

/* ------------------------------------------------------------------ *
 * Column / grid list-view format
 *
 * Salesforce list views copy as a header row of column names followed by
 * one row per lead. Each data row begins with a bare row-number line, then
 * one cell per column (in header order). Empty cells copy as "-". Example
 * (after tabs are turned into line breaks):
 *
 *   Time Zone
 *   Create Date
 *   First Name
 *   … (rest of the column names)
 *   Email Opt Out
 *   1
 *   (GMT-05:00) Eastern
 *   7/1/2026, 9:00 AM
 *   Jason
 *   … (rest of row 1's cells)
 *   feature not included
 *   2
 *   …
 * ------------------------------------------------------------------ */

type GridField =
  | "firstName"
  | "lastName"
  | "fullName"
  | "businessName"
  | "email"
  | "phone"
  | "region"
  | "requestedAmount"
  | "leadSource"
  | "sourceCreatedAt"
  | "sourceUpdatedAt"
  | "sourceRecordId"
  | "emailOptOut"
  | "skip";

const GRID_HEADER_PATTERNS: Array<[RegExp, GridField]> = [
  [/^first ?name$/i, "firstName"],
  [/^last ?name$/i, "lastName"],
  [/^(full ?name|name|contact(?: full)? name)$/i, "fullName"],
  [/^(business|company|company ?\/? ?account|account(?: name)?|business ?name|company ?name)$/i, "businessName"],
  [/^(e-?mail|email address)$/i, "email"],
  [/^(phone|phone ?number|mobile|telephone)$/i, "phone"],
  [/^(region|time ?zone|territory)$/i, "region"],
  [/^(amount ?requested|requested ?amount|amount|funding ?amount|loan ?amount)$/i, "requestedAmount"],
  [/^(lead ?source|source)$/i, "leadSource"],
  [/^(create(?:d)? ?date|created(?: at)?)$/i, "sourceCreatedAt"],
  [/^(last ?modified|modified|updated(?: date| at)?)$/i, "sourceUpdatedAt"],
  [/^(record ?id|source ?id|lead ?id|id)$/i, "sourceRecordId"],
  [/^(email ?opt ?out|opt ?out|opted ?out|do ?not ?email)$/i, "emailOptOut"],
];

function matchGridHeader(line: string): GridField | null {
  const trimmed = line.trim();
  const match = GRID_HEADER_PATTERNS.find(([re]) => re.test(trimmed));
  return match ? match[1] : null;
}

const BARE_INT_RE = /^\d{1,7}$/;

/** A copied cell is empty when Salesforce shows a dash. */
function cleanCell(value: string): string {
  const v = value.trim();
  return v === "-" || v === "—" || v === "--" ? "" : v;
}

function parseGridOptOut(value: string): boolean | null {
  const v = cleanCell(value).toLowerCase();
  if (!v) return null;
  // "feature not included" appears when the org hasn't enabled the opt-out
  // feature — nobody is opted out, so treat it as false.
  if (v.includes("feature not included") || v.includes("not included")) return false;
  if (["true", "yes", "y", "1", "checked", "✓"].includes(v)) return true;
  if (["false", "no", "n", "0", "unchecked"].includes(v)) return false;
  return null;
}

/**
 * Parse the column / grid list-view format. Returns null when the text
 * doesn't look like that format so the caller can report a helpful error.
 */
export function parseSalesforceColumns(normalized: string): ParseResult | null {
  const lines = normalized
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  // The header row is everything before the first bare row-number line.
  const firstRowIdx = lines.findIndex((l) => BARE_INT_RE.test(l));
  if (firstRowIdx < 2) return null; // need at least a couple of header cells

  const headerLines = lines.slice(0, firstRowIdx);
  const columns = headerLines.map(matchGridHeader);
  const recognized = columns.filter((c) => c !== null) as GridField[];

  // Confidence gate: must recognize a few columns, and enough to identify a
  // person (email and/or a name). Otherwise this isn't the grid format.
  const hasEmail = recognized.includes("email");
  const hasName =
    recognized.includes("firstName") ||
    recognized.includes("lastName") ||
    recognized.includes("fullName");
  if (recognized.length < 3 || !(hasEmail || hasName)) return null;

  const numColumns = columns.length;
  const globalWarnings: string[] = [];

  // Data rows: [rowNumber][cell × numColumns] repeated.
  const records: string[][] = [];
  let i = firstRowIdx;
  while (i < lines.length) {
    if (!BARE_INT_RE.test(lines[i])) {
      // Alignment slipped — skip the stray line and resync on the next number.
      i += 1;
      continue;
    }
    i += 1; // consume the row-number marker
    const cells = lines.slice(i, i + numColumns);
    i += numColumns;
    if (cells.some((c) => c.length > 0)) records.push(cells);
  }

  if (records.length === 0) return null;

  const leads = records.map((cells, index) => buildGridLead(cells, columns, index));
  return { leads, totalRecords: leads.length, globalWarnings };
}

function buildGridLead(
  cells: string[],
  columns: (GridField | null)[],
  index: number
): ParsedLead {
  const warnings: string[] = [];
  let confidence = 1;

  const raw = new Map<GridField, string>();
  columns.forEach((field, col) => {
    if (!field || field === "skip") return;
    const value = cleanCell(cells[col] ?? "");
    if (value && !raw.has(field)) raw.set(field, value);
  });
  const get = (f: GridField): string => raw.get(f) ?? "";

  let firstName = get("firstName");
  let lastName = get("lastName");
  let fullName = get("fullName");
  if (!fullName && (firstName || lastName)) {
    fullName = [firstName, lastName].filter(Boolean).join(" ");
  } else if (fullName && !firstName && !lastName) {
    ({ firstName, lastName } = splitFullName(fullName));
  }
  if (!fullName) {
    warnings.push("Missing contact name");
    confidence -= 0.3;
  }

  const email = get("email") || null;
  const emailValid = email !== null && isValidEmail(email);
  if (!email) {
    warnings.push("Missing email address");
    confidence -= 0.35;
  } else if (!emailValid) {
    warnings.push(`Email looks invalid: ${email}`);
    confidence -= 0.3;
  }

  const businessName = get("businessName");
  if (!businessName) {
    warnings.push("Missing business name");
    confidence -= 0.1;
  }

  const emailOptOut = parseGridOptOut(get("emailOptOut"));

  return {
    index,
    fullName,
    firstName,
    lastName,
    businessName,
    phone: get("phone") || null,
    region: get("region") || null,
    requestedAmount: parseAmount(get("requestedAmount")),
    email,
    emailValid,
    emailOptOut,
    neverSwitchedFromNew: null,
    leadSource: get("leadSource") || null,
    sourceCreatedAt: get("sourceCreatedAt") || null,
    sourceUpdatedAt: get("sourceUpdatedAt") || null,
    sourceRecordId: get("sourceRecordId") || null,
    rawText: cells.join(" | "),
    warnings,
    confidence: Math.max(0, Math.round(confidence * 100) / 100),
  };
}
