import "server-only";
import { firestore } from "@/lib/firebase/admin";
import { env } from "@/lib/env";
import { fetchPageText } from "@/lib/net/fetchPage";
import { splitEmail, isDisposableDomain } from "@/lib/leads/verify";
import { isConsumerDomain } from "@/lib/leads/domainProfile";

/**
 * What does this lead's business actually do?
 *
 * The per-lead opener has always had two facts to work with: a first name and a
 * business name. That is not enough to write anything specific, so it produces
 * the sort of line everyone has learned to skip. Reading the prospect's own
 * website is the difference between "I hope business is going well" and a
 * sentence that could only have been written to them.
 *
 * This runs during campaign launch, once per lead, across hundreds of leads, so
 * the constraints are about not being a liability at that scale:
 *
 * **Cached by domain, not by lead.** Fifty contacts at one company share one
 * website. Without the cache a launch fetches the same page fifty times, which
 * is slow, wasteful, and looks like a crawl to the site being read.
 *
 * **Failure is always silent and always cheap.** Every path returns null rather
 * than throwing. A prospect whose site is down, JavaScript-only, or blocking
 * bots must produce an ordinary generic opener, never a failed launch. The
 * entire feature is an enhancement, and an enhancement that can break sending is
 * a bug with a nice name.
 *
 * **A negative result is cached too.** Otherwise every launch retries the same
 * dead domain forever, and the sites most likely to fail are the ones most
 * likely to be retried.
 *
 * **Consumer and disposable domains are never fetched.** Reading gmail.com to
 * learn about a lead is pure waste, and those checks already exist for lead
 * verification.
 */

/** Long enough that a business description is still true, short enough to refresh. */
const TTL_MS = 90 * 24 * 60 * 60 * 1000;
/** A negative is retried sooner: sites come back. */
const NEGATIVE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export interface BusinessSummary {
  domain: string;
  /** Two or three sentences of what they do, extracted from their own site. */
  summary: string;
  fetchedAt: number;
}

interface CacheDoc {
  domain: string;
  summary: string;
  fetchedAt: number;
  /** Set when the lookup failed, so failures expire faster than successes. */
  failed: boolean;
}

function cacheRef(domain: string) {
  // Keyed by domain at the root rather than per user: a company's public website
  // is the same page whoever is looking at it, and scoping it per workspace
  // would multiply both the fetches and the storage by the customer count.
  return firestore().collection("businessLookups").doc(domain);
}

/**
 * The domain worth reading for a lead, or null when there is not one.
 *
 * Exported for testing: the rules about which domains to skip are the part that
 * decides whether this feature is cheap or expensive.
 */
export function lookupDomainFor(email: string): string | null {
  const parts = splitEmail(email);
  if (!parts) return null;
  const domain = parts.domain.toLowerCase();
  if (!domain || !domain.includes(".")) return null;
  // A personal mailbox tells us nothing about a business, and a throwaway was
  // never a real prospect.
  if (isConsumerDomain(domain) || isDisposableDomain(domain)) return null;
  return domain;
}

const SYSTEM = `You read a company's website and write a short factual description of what they do, for a salesperson about to contact them.

Rules:
- Two or three sentences maximum.
- Only state what the page actually says. Never infer, embellish, or guess.
- Include what they sell, who they serve, and where they operate, if the page says.
- Plain factual statements. No marketing language, no adjectives they did not use about themselves.
- If the page does not say enough to describe the business, return an empty string.

Return ONLY minified JSON: {"summary":"..."} with no markdown fences.`;

async function summarizeSite(domain: string): Promise<string> {
  const page = await fetchPageText(`https://${domain}`);
  if (!page.ok) return "";

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${env.GEMINI_MODEL}:generateContent?key=${env.GEMINI_API_KEY}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM }] },
      contents: [{ role: "user", parts: [{ text: page.text }] }],
      // Extraction, not writing. A creative setting here invents details about a
      // real company that then get quoted back to them.
      generationConfig: { temperature: 0.1, responseMimeType: "application/json" },
    }),
  });
  if (!res.ok) return "";

  const data = (await res.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  let parsed: { summary?: unknown };
  try {
    parsed = JSON.parse(text);
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return "";
    parsed = JSON.parse(match[0]);
  }
  const summary = typeof parsed.summary === "string" ? parsed.summary.trim() : "";
  return summary.slice(0, 700);
}

/**
 * Look up what a business does from its domain, using the cache.
 *
 * Returns null whenever anything at all goes wrong, and callers are expected to
 * carry on without it.
 *
 * Domain-first rather than email-first because that is the real unit: a company
 * has one website however many contacts share it, and the launch path resolves
 * distinct domains before it writes any openers. The email-shaped wrapper below
 * exists for callers that hold a lead rather than a domain.
 */
export async function lookupBusinessByDomain(domain: string): Promise<BusinessSummary | null> {
  if (!env.GEMINI_API_KEY) return null;
  if (!domain || !domain.includes(".")) return null;

  try {
    const snap = await cacheRef(domain).get();
    if (snap.exists) {
      const cached = snap.data() as CacheDoc;
      const age = Date.now() - (cached.fetchedAt ?? 0);
      const ttl = cached.failed ? NEGATIVE_TTL_MS : TTL_MS;
      if (age < ttl) {
        return cached.failed || !cached.summary
          ? null
          : { domain, summary: cached.summary, fetchedAt: cached.fetchedAt };
      }
    }

    const summary = await summarizeSite(domain);
    const now = Date.now();

    // Written whether or not it worked. Caching the failure is what stops every
    // future launch retrying the same unreachable site.
    await cacheRef(domain)
      .set({ domain, summary, fetchedAt: now, failed: summary === "" } satisfies CacheDoc)
      .catch(() => {});

    return summary ? { domain, summary, fetchedAt: now } : null;
  } catch {
    // Including a Firestore outage. This feature never gets to break a send.
    return null;
  }
}

/** The same lookup for a caller holding a lead's email address. */
export async function lookupBusiness(email: string): Promise<BusinessSummary | null> {
  const domain = lookupDomainFor(email);
  return domain ? lookupBusinessByDomain(domain) : null;
}
