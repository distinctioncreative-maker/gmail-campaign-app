import "server-only";
import { env } from "@/lib/env";

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
 * Turn a failed Gemini response into an error worth showing someone.
 *
 * @param label what the user was trying to do, e.g. "The AI writer".
 */
export function geminiFailure(status: number, body: string, label = "The AI"): Error {
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
   * 429 is the free tier's quota, which is the other failure a new deployment
   * meets, and "please try again" is the correct advice for it rather than a
   * shrug.
   */
  if (status === 429) {
    return new Error(
      `${label} has hit its rate limit for now. Wait a moment and try again; ` +
        `if it keeps happening, the API key's quota is exhausted.`
    );
  }
  return new Error(
    `${label} had a problem (${status}). ${body.trim().slice(0, 300) || "Please try again."}`
  );
}
