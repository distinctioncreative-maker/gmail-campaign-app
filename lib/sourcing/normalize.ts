import type { ParsedLead } from "@/schemas/parsedLead";
import type { SourcedPerson } from "./provider";

/**
 * Turning a vendor's rows into the shape the rest of the product already imports.
 *
 * `ParsedLead` is the currency every import path already speaks, which means a
 * sourced lead goes through the same address verification, the same suppression
 * checks, the same preview table, and the same import route as a pasted CSV. That
 * reuse is the point: a second import path with its own rules is a second place
 * for a suppressed address to slip through.
 *
 * Pure, so what happens to a half-complete vendor row is testable without a key.
 */

/** Rows with no address are dropped rather than imported as blanks.
 *
 * A vendor will happily return a person whose email it has not released, and
 * importing those produces contacts that can never be emailed, sitting in the
 * list looking like leads and quietly making every rate in reporting wrong. */
export function usablePeople(people: readonly SourcedPerson[]): SourcedPerson[] {
  const seen = new Set<string>();
  const out: SourcedPerson[] = [];
  for (const person of people) {
    const email = String(person.email ?? "").trim().toLowerCase();
    if (email === "" || !email.includes("@")) continue;
    // One address once, even when a vendor returns a person twice across pages.
    if (seen.has(email)) continue;
    seen.add(email);
    out.push(person);
  }
  return out;
}

export function toParsedLead(person: SourcedPerson, index: number): ParsedLead {
  const first = String(person.firstName ?? "").trim();
  const last = String(person.lastName ?? "").trim();
  const email = String(person.email ?? "").trim();
  const warnings: string[] = [];

  // Surfaced rather than silently accepted. A guessed address is the single
  // biggest bounce risk in sourced data, and the preview is where someone can
  // still decide not to import it.
  if (person.emailIsGuess) {
    warnings.push("The provider flagged this address as a guess rather than a verified one.");
  }
  if (first === "" && last === "") {
    warnings.push("No name from the provider, so personalization will fall back to the greeting.");
  }
  if (String(person.companyName ?? "").trim() === "") {
    warnings.push("No company name from the provider.");
  }

  return {
    index,
    fullName: [first, last].filter(Boolean).join(" "),
    firstName: first,
    lastName: last,
    businessName: String(person.companyName ?? "").trim(),
    phone: null,
    region: String(person.location ?? "").trim() || null,
    requestedAmount: null,
    email: email === "" ? null : email,
    emailValid: email.includes("@"),
    // A vendor does not know about anyone's opt-out preferences, and asserting
    // false here would be claiming knowledge we do not have. Null means unknown,
    // and the suppression list is what actually decides at send time.
    emailOptOut: null,
    neverSwitchedFromNew: null,
    leadSource: "SOURCING",
    sourceCreatedAt: null,
    sourceUpdatedAt: null,
    /** The vendor's id, so re-running the same search recognises the same person
     * instead of creating a duplicate. */
    sourceRecordId: String(person.providerId ?? "").trim() || null,
    // Deliberately not the raw vendor payload. `rawText` is shown in the preview
    // and exported, and a vendor response carries fields nobody agreed to store.
    rawText: [person.title, person.companyName, person.location].filter(Boolean).join(" · "),
    warnings,
    // Sourced rows arrive as structured fields rather than being guessed out of
    // pasted text, so there is no parsing uncertainty to express. A guessed
    // address is a data-quality warning, not a parse-confidence problem.
    confidence: 1,
  };
}

export function toParsedLeads(people: readonly SourcedPerson[]): ParsedLead[] {
  return usablePeople(people).map((person, index) => toParsedLead(person, index));
}

/** How many of the vendor's rows were unusable, for the honest count in the UI. */
export function withheldCount(people: readonly SourcedPerson[]): number {
  return people.length - usablePeople(people).length;
}
