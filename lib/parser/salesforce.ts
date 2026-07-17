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
    // Salesforce table copies separate cells with tabs; treat each cell as a line.
    .replace(/\t+/g, "\n")
    // Common copied UI chrome that carries no data.
    .replace(/^\s*(Edit|More Actions|Show Actions|Change Owner)\s*$/gim, "");
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

export function parseSalesforceText(text: string): ParseResult {
  const globalWarnings: string[] = [];
  const normalized = normalizeRawText(text);

  const markerSplit = normalized.split(new RegExp(RECORD_MARKER.source, "gim"));

  const preamble = markerSplit[0]?.trim();
  const records = markerSplit.slice(1);

  if (records.length === 0) {
    return {
      leads: [],
      totalRecords: 0,
      globalWarnings: [
        'No records found. Expected each lead to start with a "Select Item N" line — paste the list exactly as copied from Salesforce.',
      ],
    };
  }

  if (preamble) {
    globalWarnings.push("Ignored text before the first record (likely copied column headers)");
  }

  const leads = records.map((record, i) => parseRecord(record, i));
  return { leads, totalRecords: leads.length, globalWarnings };
}
