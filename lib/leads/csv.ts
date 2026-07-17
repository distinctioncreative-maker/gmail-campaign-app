import Papa from "papaparse";
import type { ParsedLead } from "@/schemas/parsedLead";
import { isValidEmail, splitFullName } from "@/lib/parser/normalize";

/** Logical lead fields a CSV column can map to. */
export const CSV_FIELDS = [
  "firstName",
  "lastName",
  "fullName",
  "businessName",
  "email",
  "phone",
  "region",
  "requestedAmount",
  "leadSource",
  "sourceCreatedAt",
  "sourceUpdatedAt",
  "sourceRecordId",
  "emailOptOut",
  "ignore",
] as const;
export type CsvField = (typeof CSV_FIELDS)[number];

export type CsvMapping = Record<string, CsvField>;

const HEADER_PATTERNS: Array<[RegExp, CsvField]> = [
  [/^(e-?mail|email address)$/i, "email"],
  [/^first ?name$/i, "firstName"],
  [/^last ?name$/i, "lastName"],
  [/^(full ?name|name|contact name)$/i, "fullName"],
  [/^(business|company|business ?name|company ?name|account|account ?name)$/i, "businessName"],
  [/^(phone|phone ?number|mobile|telephone)$/i, "phone"],
  [/^region$/i, "region"],
  [/^(amount|requested ?amount|funding ?amount|loan ?amount)$/i, "requestedAmount"],
  [/^(lead ?source|source)$/i, "leadSource"],
  [/^(created|created ?date|create ?date|created ?at)$/i, "sourceCreatedAt"],
  [/^(updated|updated ?date|modified|last ?modified|updated ?at)$/i, "sourceUpdatedAt"],
  [/^(id|record ?id|source ?id|lead ?id)$/i, "sourceRecordId"],
  [/^(email ?opt ?out|opt ?out|opted ?out|do ?not ?email)$/i, "emailOptOut"],
];

export function detectMapping(headers: string[]): CsvMapping {
  const mapping: CsvMapping = {};
  const taken = new Set<CsvField>();
  for (const header of headers) {
    const trimmed = header.trim();
    const match = HEADER_PATTERNS.find(
      ([re, field]) => re.test(trimmed) && !taken.has(field)
    );
    const field = match?.[1] ?? "ignore";
    mapping[header] = field;
    if (field !== "ignore") taken.add(field);
  }
  return mapping;
}

export interface CsvParseOutput {
  headers: string[];
  mapping: CsvMapping;
  leads: ParsedLead[];
  globalWarnings: string[];
}

function parseBool(value: string): boolean | null {
  const v = value.trim().toLowerCase();
  if (["true", "yes", "y", "1", "checked"].includes(v)) return true;
  if (["false", "no", "n", "0", "", "unchecked"].includes(v)) return false;
  return null;
}

function parseAmount(value: string): number | null {
  const cleaned = value.replace(/[$,\s]/g, "");
  if (!cleaned) return null;
  const n = Number.parseFloat(cleaned);
  return Number.isFinite(n) ? n : null;
}

/** Parse CSV text into leads using the given (or auto-detected) mapping. */
export function parseCsvLeads(csvText: string, mapping?: CsvMapping): CsvParseOutput {
  const globalWarnings: string[] = [];
  const result = Papa.parse<Record<string, string>>(csvText.trim(), {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (h) => h.trim(),
  });

  for (const err of result.errors.slice(0, 3)) {
    globalWarnings.push(`Row ${err.row ?? "?"}: ${err.message}`);
  }

  const headers = result.meta.fields ?? [];
  if (headers.length === 0) {
    return {
      headers: [],
      mapping: {},
      leads: [],
      globalWarnings: ["Could not find a header row in this file."],
    };
  }

  const effectiveMapping = mapping ?? detectMapping(headers);
  const fieldToHeader = new Map<CsvField, string>();
  for (const [header, field] of Object.entries(effectiveMapping)) {
    if (field !== "ignore" && !fieldToHeader.has(field)) fieldToHeader.set(field, header);
  }

  if (!fieldToHeader.has("email")) {
    globalWarnings.push(
      'No column is mapped to "Email" — map one before importing.'
    );
  }

  const get = (row: Record<string, string>, field: CsvField): string => {
    const header = fieldToHeader.get(field);
    return header ? (row[header] ?? "").trim() : "";
  };

  const leads: ParsedLead[] = result.data.map((row, index) => {
    const warnings: string[] = [];
    let confidence = 1;

    const email = get(row, "email") || null;
    const emailValid = email !== null && isValidEmail(email);
    if (!email) {
      warnings.push("Missing email address");
      confidence -= 0.35;
    } else if (!emailValid) {
      warnings.push(`Email looks invalid: ${email}`);
      confidence -= 0.3;
    }

    let firstName = get(row, "firstName");
    let lastName = get(row, "lastName");
    let fullName = get(row, "fullName");
    if (!fullName && (firstName || lastName)) {
      fullName = [firstName, lastName].filter(Boolean).join(" ");
    } else if (fullName && !firstName && !lastName) {
      ({ firstName, lastName } = splitFullName(fullName));
    }
    if (!fullName) {
      warnings.push("Missing contact name");
      confidence -= 0.2;
    }

    const optOutRaw = get(row, "emailOptOut");
    const emailOptOut = fieldToHeader.has("emailOptOut") ? parseBool(optOutRaw) : null;
    if (fieldToHeader.has("emailOptOut") && emailOptOut === null && optOutRaw) {
      warnings.push(`Could not read opt-out value "${optOutRaw}"`);
      confidence -= 0.05;
    }

    return {
      index,
      fullName,
      firstName,
      lastName,
      businessName: get(row, "businessName"),
      phone: get(row, "phone") || null,
      region: get(row, "region") || null,
      requestedAmount: parseAmount(get(row, "requestedAmount")),
      email,
      emailValid,
      emailOptOut,
      neverSwitchedFromNew: null,
      leadSource: get(row, "leadSource") || null,
      sourceCreatedAt: get(row, "sourceCreatedAt") || null,
      sourceUpdatedAt: get(row, "sourceUpdatedAt") || null,
      sourceRecordId: get(row, "sourceRecordId") || null,
      rawText: Object.values(row).join(", "),
      warnings,
      confidence: Math.max(0, Math.round(confidence * 100) / 100),
    };
  });

  return { headers, mapping: effectiveMapping, leads, globalWarnings };
}
