import "server-only";
import { normalizeHost, rejectPublicHost } from "@/lib/net/publicHost";

/**
 * Fetch a customer-supplied web page and return its readable text.
 *
 * Every constraint here is load-bearing, so they are listed with what goes wrong
 * without them rather than left as bare numbers.
 *
 * **Host rules, shared with webhook targets.** This is a request our server
 * makes to an address the customer chooses, which is server-side request
 * forgery unless something stops it. `169.254.169.254` from inside Cloud Run
 * returns service-account tokens, so the shared validator rejects IP literals in
 * every notation along with internal-looking names.
 *
 * **Redirects are followed manually, one hop at a time, revalidating each.**
 * This is the part that is easy to get wrong and it defeats the check above when
 * missed: `https://evil.example/` returning a 302 to `http://169.254.169.254/`
 * sails straight through a validator that only ever saw the first URL. `fetch`
 * follows redirects by default, so the default is the vulnerable behaviour.
 *
 * **A byte cap enforced while streaming, not after.** `Content-Length` is a
 * claim by the server being fetched, and checking it is checking whether an
 * attacker admits to the attack. Reading until the cap and abandoning the rest
 * is what actually bounds memory.
 *
 * **A timeout.** A server that accepts the connection and never responds would
 * otherwise hold a Cloud Run request until the platform kills it.
 *
 * **HTML only.** Handing a PDF or a video to a text extractor wastes the
 * budget and produces nothing.
 */

export interface PageFetchResult {
  ok: boolean;
  /** Extracted visible text, capped. Empty when not ok. */
  text: string;
  /** The final URL after redirects, for display. */
  url: string;
  /** Reader-facing explanation when not ok. */
  reason: string;
}

const MAX_BYTES = 600_000;
const MAX_REDIRECTS = 3;
const TIMEOUT_MS = 8_000;
/** Enough for a model to characterise a business; far less than a whole site. */
const MAX_TEXT = 12_000;

function refuse(reason: string): PageFetchResult {
  return { ok: false, text: "", url: "", reason };
}

/**
 * Normalize what someone actually types. People paste "acme.com", and rejecting
 * that as invalid would be technically correct and useless.
 */
export function normalizeSiteUrl(raw: string): string {
  const value = String(raw ?? "").trim();
  if (!value) return "";
  if (/^https?:\/\//i.test(value)) return value;
  return `https://${value.replace(/^\/+/, "")}`;
}

function validate(raw: string): { ok: true; url: URL } | { ok: false; reason: string } {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return { ok: false, reason: "That does not look like a web address." };
  }
  // http is allowed on the initial hop because plenty of small business sites
  // still redirect from it, and unlike a webhook there is no secret in the
  // request to protect. The host rules are what matter here.
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    return { ok: false, reason: "Only http and https addresses can be read." };
  }
  if (parsed.username || parsed.password) {
    return { ok: false, reason: "Remove the username and password from the address." };
  }
  const rejection = rejectPublicHost(normalizeHost(parsed.hostname));
  if (rejection) {
    return {
      ok: false,
      reason:
        rejection === "NO_DOT" || rejection === "EMPTY"
          ? "Enter a full website address, such as yourcompany.com."
          : rejection === "NON_ASCII"
            ? "Use the punycode (xn--) form of that domain."
            : "That address cannot be reached. Use your public website.",
    };
  }
  return { ok: true, url: parsed };
}

/** Read the body up to a hard cap, abandoning the rest. */
async function readCapped(res: Response): Promise<string> {
  const reader = res.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      chunks.push(value);
      total += value.byteLength;
      if (total >= MAX_BYTES) break;
    }
  } finally {
    // Releasing matters on the early-exit path: without it the connection is
    // held until GC, and this runs once per lead in the enrichment path.
    await reader.cancel().catch(() => {});
  }
  const joined = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    const room = Math.min(chunk.byteLength, total - offset);
    if (room <= 0) break;
    joined.set(chunk.subarray(0, room), offset);
    offset += room;
  }
  return new TextDecoder("utf-8", { fatal: false }).decode(joined);
}

/**
 * Strip markup down to the words a reader would see.
 *
 * Script and style contents are removed first and by name. Tag-stripping alone
 * would leave minified JavaScript in the output, which is both useless to a
 * model and the bulk of a modern page's bytes.
 */
export function extractText(html: string): string {
  return html
    .replace(/<(script|style|noscript|svg|template)\b[\s\S]*?<\/\1\s*>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    // Block-level tags become breaks so sentences do not fuse across elements.
    .replace(/<\/(p|div|h[1-6]|li|section|article|tr)\s*>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/[ \t ]+/g, " ")
    .replace(/\n\s*\n\s*\n+/g, "\n\n")
    .trim()
    .slice(0, MAX_TEXT);
}

export async function fetchPageText(rawUrl: string): Promise<PageFetchResult> {
  const first = validate(normalizeSiteUrl(rawUrl));
  if (!first.ok) return refuse(first.reason);

  let target = first.url;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      let res: Response;
      try {
        res = await fetch(target.toString(), {
          // Manual, so each hop is revalidated. See the module comment: this is
          // the difference between a real guard and a decorative one.
          redirect: "manual",
          signal: controller.signal,
          headers: {
            // Identifying the fetcher is the courteous thing and lets a site
            // block it if they would rather not be read.
            "User-Agent": "CadenceBot/1.0 (+https://cadence.email/bot)",
            Accept: "text/html,application/xhtml+xml",
          },
        });
      } catch (err) {
        return refuse(
          err instanceof Error && err.name === "AbortError"
            ? "That site took too long to respond."
            : "That site could not be reached."
        );
      }

      if (res.status >= 300 && res.status < 400) {
        const location = res.headers.get("location");
        if (!location) return refuse("That site redirected without saying where.");
        if (hop === MAX_REDIRECTS) return refuse("That site redirected too many times.");
        const next = validate(new URL(location, target).toString());
        if (!next.ok) return refuse(next.reason);
        target = next.url;
        continue;
      }

      if (!res.ok) {
        return refuse(
          res.status === 404
            ? "That page was not found."
            : `That site returned an error (${res.status}).`
        );
      }

      const type = res.headers.get("content-type") ?? "";
      if (!/text\/html|application\/xhtml/i.test(type)) {
        return refuse("That address is not a web page.");
      }

      const text = extractText(await readCapped(res));
      if (text.length < 80) {
        // Almost always a site that renders entirely on the client. Saying so is
        // more useful than reporting success with nothing in it.
        return refuse("There was not enough readable text on that page.");
      }
      return { ok: true, text, url: target.toString(), reason: "" };
    }
    return refuse("That site redirected too many times.");
  } finally {
    clearTimeout(timer);
  }
}
