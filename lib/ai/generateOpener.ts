import "server-only";
import { env } from "@/lib/env";
import { sanitizeEmailHtml } from "@/lib/sanitize/html";

const SYSTEM = `You write ONE short, natural opening line for a personalized outreach email.
Rules:
- One sentence, under 22 words. Warm and specific to the available recipient or organization details: never generic flattery or invented facts.
- No greeting ("Hi ..."), no sign-off, no placeholders. Just the line itself.
- Plain text only. It will be inserted as the email's first line.
Return ONLY minified JSON: {"line":"..."} with no markdown fences.`;

/**
 * The extra rules that apply once a real description of the prospect's business
 * is available.
 *
 * Separated from the base prompt because they are only sound when there is a
 * source to be faithful to. Told to be specific about a company with nothing
 * factual in hand, a model invents: it will confidently congratulate someone on
 * an expansion that never happened. With a summary present the instruction
 * inverts from "be specific" to "be specific about *this*, and nothing else",
 * which is the version that is safe to send.
 */
const GROUNDED = `

You have been given a factual description of the recipient's business, taken from their own website.
- Reference something specific from it. That specificity is the whole point of the line.
- Use ONLY what the description states. Never add detail it does not contain, however plausible.
- Never mention that you read their website, and never quote it.
- If the description is too thin to say anything specific, write a warm general line instead. A safe general line is far better than a confident wrong one about a real company.`;

/**
 * Generate a single personalized opening line for one lead. Never throws for
 * a bad response: returns "" so a launch can continue gracefully. The caller
 * is responsible for capping volume and concurrency (rate limits/cost).
 */
export async function generateOpener(input: {
  firstName?: string;
  businessName?: string;
  brandContext?: string;
  /** What the prospect's own website says they do, when it could be read. */
  businessSummary?: string;
}): Promise<string> {
  if (!env.GEMINI_API_KEY) return "";

  const grounded = Boolean(input.businessSummary?.trim());
  const base = grounded ? `${SYSTEM}${GROUNDED}` : SYSTEM;
  const system = input.brandContext?.trim()
    ? `${base}\n\nCONTEXT about us (do not quote, just stay on-brand):\n${input.brandContext.trim().slice(0, 600)}`
    : base;
  const who = [
    input.businessName ? `Business: ${input.businessName}` : "",
    input.firstName ? `Owner first name: ${input.firstName}` : "",
    grounded ? `About their business, from their website: ${input.businessSummary!.trim()}` : "",
  ]
    .filter(Boolean)
    .join("\n") || "A recipient with no additional details; keep it universal and warm.";

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${env.GEMINI_MODEL}:generateContent?key=${env.GEMINI_API_KEY}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: "user", parts: [{ text: who }] }],
        // Lower when grounded: with real facts in hand the job is to use them
        // faithfully, and the drift a high temperature buys is drift away from
        // the only thing keeping the line true.
        generationConfig: {
          temperature: grounded ? 0.5 : 0.85,
          responseMimeType: "application/json",
        },
      }),
    });
    if (!res.ok) return "";
    const data = (await res.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    let parsed: { line?: unknown };
    try {
      parsed = JSON.parse(text);
    } catch {
      const m = text.match(/\{[\s\S]*\}/);
      if (!m) return "";
      parsed = JSON.parse(m[0]);
    }
    const line = typeof parsed.line === "string" ? parsed.line.trim() : "";
    // Sanitize (strip any stray HTML) and cap length defensively.
    return sanitizeEmailHtml(line).replace(/<[^>]+>/g, "").slice(0, 220);
  } catch {
    return "";
  }
}
