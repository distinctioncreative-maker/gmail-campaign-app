/**
 * Lead sourcing, behind an interface.
 *
 * The single most common reason an activated account goes quiet is running out
 * of list, and until now import was the only way a lead entered the product.
 *
 * **We do not build a data provider.** Compiling and maintaining contact data is
 * a business, not a feature, and doing it badly is worse than not doing it. So
 * this is an interface with one adapter behind it, which keeps three things true:
 * the vendor is swappable when their pricing or coverage changes, the cost stays
 * pass-through rather than absorbed, and nothing in the app above this line knows
 * which vendor is in use.
 *
 * Everything in this file is pure. The adapter that talks to a vendor lives
 * separately and is the only part that needs a key.
 */

export interface SourcingCriteria {
  /** Free text matched against company name or description. */
  keywords: string;
  /** Job titles, any of. The single highest-signal filter in cold outreach. */
  titles: string[];
  /** Locations, any of. City, state, or country as the vendor understands them. */
  locations: string[];
  /** Industries, any of. */
  industries: string[];
  /** Employee-count band, inclusive. Null on either side means unbounded. */
  minEmployees: number | null;
  maxEmployees: number | null;
}

export const EMPTY_CRITERIA: SourcingCriteria = {
  keywords: "",
  titles: [],
  locations: [],
  industries: [],
  minEmployees: null,
  maxEmployees: null,
};

/** One person as a vendor returned them, before normalization. */
export interface SourcedPerson {
  /** The vendor's own id, kept so a re-import can be recognised as the same
   * record rather than looking like a new lead. */
  providerId: string;
  firstName: string;
  lastName: string;
  title: string;
  companyName: string;
  /** Null when the vendor has a person but will not release an address without a
   * separate paid call. That case is common enough that hiding it would make the
   * result count a lie. */
  email: string | null;
  /** True when the vendor flagged the address as a guess rather than verified. */
  emailIsGuess: boolean;
  location: string;
  industry: string;
  employeeCount: number | null;
  linkedinUrl: string;
}

export interface SourcingPage {
  people: SourcedPerson[];
  /** Total the vendor claims to have, for "showing 25 of about 4,000". */
  totalAvailable: number;
  page: number;
  /** How many credits this call consumed. Vendors bill per row released, so this
   * is the number that matters, not the number of rows displayed. */
  creditsUsed: number;
}

export interface SourcingProvider {
  /** Shown in the interface, so a customer knows whose data they are buying. */
  readonly name: string;
  search(criteria: SourcingCriteria, page: number, perPage: number): Promise<SourcingPage>;
}

/**
 * Whether a set of criteria is specific enough to be worth a paid call.
 *
 * An empty search returns the vendor's entire database one page at a time, and
 * every page costs money. Requiring one real narrowing filter is not a
 * convenience: it is the difference between a tool and a way to spend a
 * customer's credits by holding down a button.
 */
export function isSearchable(criteria: SourcingCriteria): boolean {
  return (
    criteria.keywords.trim().length >= 2 ||
    criteria.titles.length > 0 ||
    criteria.industries.length > 0 ||
    (criteria.locations.length > 0 &&
      (criteria.minEmployees !== null || criteria.maxEmployees !== null))
  );
}

export function describeCriteria(criteria: SourcingCriteria): string {
  const parts: string[] = [];
  if (criteria.titles.length > 0) parts.push(criteria.titles.join(" or "));
  if (criteria.industries.length > 0) parts.push(`in ${criteria.industries.join(" or ")}`);
  if (criteria.locations.length > 0) parts.push(`near ${criteria.locations.join(" or ")}`);
  if (criteria.minEmployees !== null || criteria.maxEmployees !== null) {
    const low = criteria.minEmployees ?? 1;
    const high = criteria.maxEmployees === null ? "or more" : `to ${criteria.maxEmployees}`;
    parts.push(`${low} ${high} staff`);
  }
  if (criteria.keywords.trim() !== "") parts.push(`matching "${criteria.keywords.trim()}"`);
  return parts.length === 0 ? "Everyone" : parts.join(", ");
}
