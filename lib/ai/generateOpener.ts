import "server-only";
import { env } from "@/lib/env";
import { sanitizeEmailHtml } from "@/lib/sanitize/html";

const SYSTEM = `You write ONE short, natural opening line for a cold outreach email to a small-business owner.
Rules:
- One sentence, under 22 words. Warm and specific to their business type/name — never generic flattery, never fake facts.
- No greeting ("Hi ..."), no sign-off, no placeholders. Just the line itself.
- Plain text only. It will be inserted as the email's first line.
Return ONLY minified JSON: {"line":"..."} with no markdown fences.`;

/**
 * Generate a single personalized opening line for one lead. Never throws for
 * a bad response — returns "" so a launch can continue gracefully. The caller
 * is responsible for capping volume and concurrency (rate limits/cost).
 */
export async function generateOpener(input: {
  firstName?: string;
  businessName?: string;
  brandContext?: string;
}): Promise<string> {
  if (!env.GEMINI_API_KEY) return "";

  const system = input.brandContext?.trim()
    ? `${SYSTEM}\n\nCONTEXT about us (do not quote, just stay on-brand):\n${input.brandContext.trim().slice(0, 600)}`
    : SYSTEM;
  const who = [
    input.businessName ? `Business: ${input.businessName}` : "",
    input.firstName ? `Owner first name: ${input.firstName}` : "",
  ]
    .filter(Boolean)
    .join("\n") || "A small business (no details given — keep it universal and warm).";

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${env.GEMINI_MODEL}:generateContent?key=${env.GEMINI_API_KEY}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: "user", parts: [{ text: who }] }],
        generationConfig: { temperature: 0.85, responseMimeType: "application/json" },
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
