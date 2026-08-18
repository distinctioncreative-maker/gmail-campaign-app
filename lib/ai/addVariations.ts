import "server-only";
import { env } from "@/lib/env";
import { AiNotConfiguredError } from "@/lib/ai/generateEmail";
import { sanitizeEmailHtml } from "@/lib/sanitize/html";
import { analyzeSpintax } from "@/lib/personalization/spintax";
import { listPlaceholders } from "@/lib/personalization/render";

/**
 * Write the spin groups for an email that does not have any.
 *
 * Spintax is one of the few deliverability levers that costs nothing: five
 * hundred byte-identical bodies is a fingerprint, and providers cluster on
 * message similarity. The engine for it has been in the product for a while and
 * the editor already tells writers it exists. What nobody does is use it,
 * because `{Hi|Hello|Hey}` is a syntax you have to learn and then apply by hand
 * to every sentence of an email you already finished writing.
 *
 * The interesting part of this module is not the prompt, it is what happens to
 * the result. A model asked to insert braces into HTML containing
 * `{{first_name}}` will sometimes produce `{{first|name}}`, or drop a closing
 * brace, or helpfully "improve" the copy while it is in there. Each of those
 * ships a broken email to real people, and the last one is the worst because it
 * looks fine. So nothing this returns is trusted: every candidate is parsed with
 * the same parser the send path uses, and checked to confirm the placeholder set
 * is byte-for-byte what went in. A candidate that fails is discarded rather than
 * repaired, because a repaired guess is a guess.
 */

const SYSTEM = `You add spintax variations to an existing marketing email. Spintax is {option one|option two|option three}: at send time one option is chosen per recipient, so no two recipients get a byte-identical email.

WHAT TO DO:
- Wrap short interchangeable phrases in {a|b} or {a|b|c}. Greetings, connectives, and soft verbs are ideal.
- Aim for 4 to 8 spin groups spread through the email, not clustered in one paragraph.
- Every option inside a group must mean the same thing and fit the same sentence grammatically.

ABSOLUTE RULES, in order of importance:
1. NEVER modify anything inside double braces. {{first_name}}, {{business_name}}, {{signature}}, {{physical_address}}, {{unsubscribe_text}} and any other {{...}} must come back exactly as they went in, character for character. Never put a | inside double braces. Never wrap a {{...}} in a spin group.
2. NEVER change the meaning, the offer, the claims, or the call to action. You are varying wording only.
3. NEVER nest one spin group inside another.
4. Keep every HTML tag and attribute exactly as it was. Do not add, remove, or reorder tags.
5. Do not add new sentences, new paragraphs, or new links.
6. Every { you write must have a matching }.

Return ONLY minified JSON: {"subject":"...","html":"..."} with no markdown fences. Both fields are the ORIGINAL text with spin groups added.`;

export interface VariationResult {
  subject: string;
  html: string;
  /** Distinct bodies the result can now produce. */
  variants: number;
  /** Spin groups added. */
  groups: number;
}

export class VariationRejected extends Error {}

/**
 * Verify a candidate against the original, or explain why it cannot be used.
 *
 * Exported for testing: these are the rules the feature actually rests on, and
 * they are worth exercising directly rather than only through a network call.
 */
export function verifyVariation(
  original: { subject: string; html: string },
  candidate: { subject: string; html: string }
): { ok: true; variants: number; groups: number } | { ok: false; reason: string } {
  const before = `${original.subject} ${original.html}`;
  const after = `${candidate.subject} ${candidate.html}`;

  /**
   * Placeholders first, because this is the failure that reaches a recipient
   * looking like a bug in the product rather than a bad draft. Compared as
   * sorted sets: a model that turned {{first_name}} into {{first|name}} changes
   * the set, and one that dropped {{signature}} shrinks it.
   */
  const originalPlaceholders = [...listPlaceholders(before)].sort();
  const candidatePlaceholders = [...listPlaceholders(after)].sort();
  if (originalPlaceholders.join("") !== candidatePlaceholders.join("")) {
    return {
      ok: false,
      reason: "The variations changed the personalization fields, so they were discarded.",
    };
  }

  // Parsed with the same parser the send path uses, so "it parsed here" and "it
  // will parse at send time" are the same statement rather than two hopes.
  const analysis = analyzeSpintax(after);
  if (analysis.issues.length > 0) {
    return { ok: false, reason: "The variations came back with broken syntax." };
  }
  if (analysis.groups === 0) {
    return { ok: false, reason: "No variations were added. Try again." };
  }

  /**
   * A crude but effective check that the model varied the wording instead of
   * rewriting the email. Stripping the spin syntax should leave text close in
   * length to the original; a rewrite moves it a lot. This does not catch a
   * subtle meaning change, and it is not claimed to: it catches the common
   * failure, which is the model deciding to be helpful.
   */
  const strippedLength = after.replace(/\{[^{}]*\}/g, (group) => {
    const first = group.slice(1, -1).split("|")[0];
    return first;
  }).length;
  const ratio = strippedLength / Math.max(1, before.length);
  if (ratio < 0.6 || ratio > 1.6) {
    return {
      ok: false,
      reason: "The variations rewrote too much of the email, so they were discarded.",
    };
  }

  return { ok: true, variants: analysis.variants, groups: analysis.groups };
}

export async function addVariations(
  subject: string,
  html: string,
  brandContext = ""
): Promise<VariationResult> {
  if (!env.GEMINI_API_KEY) throw new AiNotConfiguredError();

  const system = brandContext.trim()
    ? `${SYSTEM}\n\nBRAND VOICE: every option you write must fit this voice.\n${brandContext.trim()}`
    : SYSTEM;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${env.GEMINI_MODEL}:generateContent?key=${env.GEMINI_API_KEY}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [
        {
          role: "user",
          parts: [{ text: JSON.stringify({ subject, html }) }],
        },
      ],
      // Some creativity is the point here (the options should not all be the
      // same word), but not enough to start rewriting the email.
      generationConfig: { temperature: 0.6, responseMimeType: "application/json" },
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(
      `The AI had a problem (${res.status}). ${detail.slice(0, 140) || "Please try again."}`
    );
  }

  const data = (await res.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";

  let parsed: { subject?: unknown; html?: unknown };
  try {
    parsed = JSON.parse(text);
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("The AI returned an unexpected format. Please try again.");
    parsed = JSON.parse(match[0]);
  }

  const candidate = {
    subject: typeof parsed.subject === "string" ? parsed.subject.trim() : "",
    // Sanitized before verification, not after. Sanitizing could itself remove a
    // tag and change the text, and verifying the pre-sanitized string would then
    // be verifying something other than what ships.
    html: typeof parsed.html === "string" ? sanitizeEmailHtml(parsed.html) : "",
  };
  if (!candidate.subject || !candidate.html) {
    throw new Error("The AI didn't return a full email. Please try again.");
  }

  const verdict = verifyVariation({ subject, html }, candidate);
  if (!verdict.ok) throw new VariationRejected(verdict.reason);

  return {
    subject: candidate.subject,
    html: candidate.html,
    variants: verdict.variants,
    groups: verdict.groups,
  };
}
