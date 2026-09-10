import "server-only";
import { env } from "@/lib/env";
import { reportError } from "@/lib/observability/report";

/**
 * One place that knows how to reach Gemini.
 *
 * The URL and the error handling were written out longhand at ten call sites.
 * That is fine until the day the model in `GEMINI_MODEL` stops being served,
 * which is a thing Google does on a schedule: the request then fails with a
 * 404 whose body explains precisely what to do instead, and every one of those
 * ten copies truncated the body at 140 characters, cutting the sentence off at
 * "Please update your" and leaving the reader with nothing actionable.
 *
 * A model going away is configuration, not a bug, and the error should say so
 * plainly enough that the person reading it can fix it without asking anyone.
 */

/** The endpoint for the configured model. */
export function geminiEndpoint(): string {
  return `https://generativelanguage.googleapis.com/v1beta/models/${env.GEMINI_MODEL}:generateContent?key=${env.GEMINI_API_KEY}`;
}

/** Where to look up which models a key may actually use. */
export const GEMINI_MODELS_DOC =
  "https://generativelanguage.googleapis.com/v1beta/models?key=YOUR_KEY";

/**
 * Pull the quota name and limit out of a 429 body when Google supplies them,
 * because "generate_content_free_tier_requests, limit 0" answers the question
 * in a way the raw JSON does not.
 */
function quotaDetail(body: string): string {
  try {
    const parsed = JSON.parse(body) as {
      error?: {
        message?: string;
        details?: Array<{ violations?: Array<{ quotaMetric?: string; quotaId?: string; quotaValue?: string }> }>;
      };
    };
    const violations = (parsed.error?.details ?? []).flatMap((d) => d.violations ?? []);
    const named = violations
      .map((v) => [v.quotaId ?? v.quotaMetric, v.quotaValue].filter(Boolean).join(", limit "))
      .filter(Boolean);
    const message = parsed.error?.message?.trim() ?? "";
    return [message, ...named].filter(Boolean).join(" | ").slice(0, 400);
  } catch {
    return "";
  }
}

/**
 * Turn a failed Gemini response into an error worth showing someone.
 *
 * @param label what the user was trying to do, e.g. "The AI writer".
 */
export function geminiFailure(status: number, body: string, label = "The AI"): Error {
  const error = buildGeminiError(status, body, label);
  /**
   * Also to the server log, always. What a user sees is a toast they will
   * describe to you in their own words a day later; what you need is the
   * status, the model, and Google's own sentence, in a place you can query.
   * `reportError` redacts secrets and truncates before it writes.
   */
  reportError(error, { scope: "gemini", kind: `http_${status}` });
  return error;
}

function buildGeminiError(status: number, body: string, label: string): Error {
  /**
   * A 404 here is never "not found" in the way a 404 usually is: the endpoint
   * exists, the key works, and the model named in the environment is not one
   * this key can serve. Retrying cannot help, so the message says what to
   * change instead of suggesting another go.
   */
  if (status === 404) {
    return new Error(
      `The configured AI model (${env.GEMINI_MODEL}) is not available to this API key. ` +
        `Set GEMINI_MODEL to one this key can serve; list them with ${GEMINI_MODELS_DOC}. ` +
        `Google said: ${body.trim().slice(0, 400) || "no detail given"}`
    );
  }
  /**
   * 429 is a quota, and there are two very different ones behind it: a
   * per-minute burst you should wait out, and a per-day or per-model
   * allowance that waiting will not fix because the model has no free tier at
   * all. Google's body says which, by name.
   *
   * The first version of this branch replaced that body with friendly advice,
   * which is the same mistake as the 140-character truncation it was written
   * to fix: the sentence that tells you what to do was thrown away in favour
   * of a sentence that sounds reassuring. The advice stays, and so does the
   * evidence.
   */
  if (status === 429) {
    const detail = quotaDetail(body);
    return new Error(
      `${label} was refused by Google for quota. ` +
        `A per-minute limit clears in about a minute; a per-day or per-model ` +
        `one needs billing enabled on the key, or a different GEMINI_MODEL. ` +
        `Google said: ${detail || body.trim().slice(0, 400) || "no detail given"}`
    );
  }
  return new Error(
    `${label} had a problem (${status}). ${body.trim().slice(0, 300) || "Please try again."}`
  );
}
