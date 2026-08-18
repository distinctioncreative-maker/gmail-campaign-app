/**
 * Why this workspace is allowed to email a given person.
 *
 * This is deliberately not `leadSource`. That field already exists and records
 * where a row came from: "Salesforce", "Webinar", whatever a CSV column held.
 * It is descriptive and free-form, and it cannot answer the only question that
 * matters when a complaint arrives: on what basis was this message sent?
 *
 * The distinction is the whole point. Google's Workspace acceptable-use policy
 * prohibits "unsolicited" mass email, and GDPR Article 6 and PECR require a
 * lawful basis before a marketing message goes out at all. Both are questions
 * about the *relationship*, not the spreadsheet. A workspace that can name the
 * basis for every list it imported can answer them; one holding ten thousand
 * rows tagged "API" cannot.
 *
 * Three design choices are load-bearing:
 *
 * **It is an enum, not a string.** A free-text consent note is a field people
 * fill with "yes" and it proves nothing. A closed set can be reported on,
 * filtered, and checked before launch.
 *
 * **It is captured per import, not per lead.** A list has one provenance: you
 * got it from one place, for one reason. Asking once per import is a single
 * click on a screen someone is already looking at. Asking per lead would be a
 * field nobody maintains, which is worse than not asking, because it manufactures
 * a record that looks like diligence and isn't.
 *
 * **UNKNOWN is not selectable.** It exists only for rows that predate this
 * field. Offering it at import would make it the path of least resistance and
 * defeat the exercise.
 */

export const CONSENT_BASES = [
  "LEGITIMATE_INTEREST",
  "CONSENT",
  "EXISTING_RELATIONSHIP",
  "UNKNOWN",
] as const;

export type ConsentBasis = (typeof CONSENT_BASES)[number];

/** The bases a person may actually choose when importing. */
export const SELECTABLE_CONSENT_BASES = CONSENT_BASES.filter(
  (basis): basis is Exclude<ConsentBasis, "UNKNOWN"> => basis !== "UNKNOWN"
);

export const DEFAULT_CONSENT_BASIS: ConsentBasis = "LEGITIMATE_INTEREST";

export interface ConsentBasisCopy {
  /** Short label, used in tables and filters. */
  label: string;
  /** What picking this actually asserts, in the second person. */
  meaning: string;
  /** The concrete case this covers, so nobody has to guess which one they are. */
  example: string;
}

/**
 * Written in plain language on purpose. The person importing a list is a
 * salesperson, not a privacy officer, and a dropdown reading "Art. 6(1)(f)"
 * gets picked at random. Each option below says what you are claiming and gives
 * the situation it describes, so the honest answer is the obvious one.
 */
export const CONSENT_BASIS_COPY: Record<ConsentBasis, ConsentBasisCopy> = {
  LEGITIMATE_INTEREST: {
    label: "Business research",
    meaning:
      "You identified these people through business research as a relevant fit, and you are contacting them in their professional capacity about something useful to their job.",
    example: "Company websites, LinkedIn, an industry directory, a conference attendee list.",
  },
  CONSENT: {
    label: "They opted in",
    meaning:
      "These people gave you their address and agreed to hear from you. You can point to when and where if asked.",
    example: "A signup form, a content download, a checkbox at an event.",
  },
  EXISTING_RELATIONSHIP: {
    label: "Existing relationship",
    meaning:
      "These are current or former customers, or people already in a live conversation with your business.",
    example: "Past buyers, trial users, open opportunities in your CRM.",
  },
  UNKNOWN: {
    label: "Not recorded",
    meaning:
      "These leads were imported before this workspace started recording where lists come from.",
    example: "",
  },
};

/**
 * Whether a basis is strong enough to send against without a warning.
 *
 * All three selectable bases qualify. This is not a ranking of how good they
 * are. Legitimate interest is entirely lawful for B2B prospecting and is the
 * common case for this product. The line is only between "recorded" and "not".
 */
export function isBasisRecorded(basis: ConsentBasis): boolean {
  return basis !== "UNKNOWN";
}
