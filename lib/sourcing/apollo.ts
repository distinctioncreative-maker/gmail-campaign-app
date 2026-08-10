import "server-only";
import { env } from "@/lib/env";
import type {
  SourcedPerson,
  SourcingCriteria,
  SourcingPage,
  SourcingProvider,
} from "./provider";

/**
 * The Apollo adapter.
 *
 * One vendor behind the interface in provider.ts, written so replacing it is a
 * new file rather than a refactor. Nothing above this line references Apollo.
 *
 * **Unverified against the live API.** There is no key in this environment, so
 * every line here is written from Apollo's documented request and response shape
 * and none of it has made a real call. That is the same status the Stripe
 * integration shipped in, and it is stated here rather than discovered later: the
 * first person with a key should expect to correct a field name.
 *
 * Two things this adapter is careful about because they are ours to get wrong
 * rather than the vendor's:
 *
 * **The key never leaves the server.** It goes in a header, never a query string,
 * because query strings end up in logs and proxies.
 *
 * **A vendor error never becomes our error message.** Their response body can
 * echo the request, which includes the search a customer typed and occasionally
 * the key itself. Only the status code informs what a customer is told.
 */

const ENDPOINT = "https://api.apollo.io/api/v1/mixed_people/search";
/** Their API is not fast, and a search is a person waiting on a screen. */
const TIMEOUT_MS = 20_000;

interface ApolloPerson {
  id?: string;
  first_name?: string;
  last_name?: string;
  title?: string;
  email?: string | null;
  email_status?: string | null;
  linkedin_url?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  organization?: {
    name?: string | null;
    industry?: string | null;
    estimated_num_employees?: number | null;
  } | null;
}

interface ApolloResponse {
  people?: ApolloPerson[];
  pagination?: { total_entries?: number; page?: number };
}

export function apolloConfigured(): boolean {
  return env.APOLLO_API_KEY.trim() !== "";
}

/**
 * Apollo marks an address it has not confirmed. Anything other than a verified
 * status is treated as a guess, including statuses we do not recognise: a new
 * status value we have never seen should not default to "trust it".
 */
function isGuess(status: string | null | undefined): boolean {
  return String(status ?? "").toLowerCase() !== "verified";
}

/**
 * Apollo returns a placeholder string rather than null when it holds an address
 * it will not release on this plan. Importing that literal would create a contact
 * whose email is the words "email not unlocked".
 */
function realEmail(email: string | null | undefined): string | null {
  const value = String(email ?? "").trim();
  if (value === "") return null;
  if (!value.includes("@")) return null;
  if (/not_?unlocked|email_?not_?unlocked|locked/i.test(value)) return null;
  return value.toLowerCase();
}

function toSourcedPerson(person: ApolloPerson): SourcedPerson {
  const location = [person.city, person.state, person.country]
    .map((part) => String(part ?? "").trim())
    .filter(Boolean)
    .join(", ");
  return {
    providerId: String(person.id ?? "").trim(),
    firstName: String(person.first_name ?? "").trim(),
    lastName: String(person.last_name ?? "").trim(),
    title: String(person.title ?? "").trim(),
    companyName: String(person.organization?.name ?? "").trim(),
    email: realEmail(person.email),
    emailIsGuess: isGuess(person.email_status),
    location,
    industry: String(person.organization?.industry ?? "").trim(),
    employeeCount:
      typeof person.organization?.estimated_num_employees === "number"
        ? person.organization.estimated_num_employees
        : null,
    linkedinUrl: String(person.linkedin_url ?? "").trim(),
  };
}

export class ApolloSourcingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ApolloSourcingError";
  }
}

export const apolloProvider: SourcingProvider = {
  name: "Apollo",

  async search(
    criteria: SourcingCriteria,
    page: number,
    perPage: number
  ): Promise<SourcingPage> {
    const body: Record<string, unknown> = {
      page: Math.max(1, Math.floor(page)),
      per_page: Math.max(1, Math.floor(perPage)),
    };
    if (criteria.titles.length > 0) body.person_titles = criteria.titles;
    if (criteria.locations.length > 0) body.person_locations = criteria.locations;
    if (criteria.industries.length > 0) body.q_organization_keyword_tags = criteria.industries;
    if (criteria.keywords.trim() !== "") body.q_keywords = criteria.keywords.trim();
    if (criteria.minEmployees !== null || criteria.maxEmployees !== null) {
      const low = criteria.minEmployees ?? 1;
      const high = criteria.maxEmployees ?? 1_000_000;
      body.organization_num_employees_ranges = [`${low},${high}`];
    }

    let res: Response;
    try {
      res = await fetch(ENDPOINT, {
        method: "POST",
        signal: AbortSignal.timeout(TIMEOUT_MS),
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          // Header, never a query parameter: query strings are logged.
          "X-Api-Key": env.APOLLO_API_KEY.trim(),
        },
        body: JSON.stringify(body),
      });
    } catch {
      throw new ApolloSourcingError(
        "The lead provider did not respond. Try the search again in a moment."
      );
    }

    if (!res.ok) {
      // Mapped from the status alone. Their body can echo the request, which
      // includes the key.
      if (res.status === 401 || res.status === 403) {
        throw new ApolloSourcingError(
          "The lead provider rejected our credentials. An administrator needs to check the sourcing configuration."
        );
      }
      if (res.status === 422) {
        throw new ApolloSourcingError(
          "The lead provider could not use those filters. Try a broader search."
        );
      }
      if (res.status === 429) {
        throw new ApolloSourcingError(
          "The lead provider is rate limiting us. Wait a minute and search again."
        );
      }
      throw new ApolloSourcingError(
        "The lead provider returned an error. Try again, and contact support if it continues."
      );
    }

    const json = (await res.json().catch(() => null)) as ApolloResponse | null;
    const people = Array.isArray(json?.people) ? json.people.map(toSourcedPerson) : [];

    return {
      people,
      totalAvailable: Number(json?.pagination?.total_entries) || people.length,
      page: Number(json?.pagination?.page) || Math.max(1, Math.floor(page)),
      // Billed per row returned, including the ones whose address is withheld:
      // the vendor charged for the search either way, and undercounting here
      // would let a search that returns nothing usable run free.
      creditsUsed: people.length,
    };
  },
};
