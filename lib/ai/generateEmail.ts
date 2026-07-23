import "server-only";
import { env } from "@/lib/env";
import { sanitizeEmailHtml } from "@/lib/sanitize/html";

export interface GeneratedEmail {
  subject: string;
  html: string;
}

export class AiNotConfiguredError extends Error {
  constructor() {
    super("AI writing isn't set up yet. Add a GEMINI_API_KEY to enable it.");
  }
}

const SYSTEM = `You write short, high-converting B2B cold outreach emails for a business-funding company.
Rules:
- Keep it under ~120 words. Warm, human, confident — never spammy or hypey.
- Use these placeholders where natural: {{firstName}}, {{businessName}}, {{signature}}.
- Always end the body with {{signature}} on its own line.
- One clear call to action (a reply or a quick call).
- No fake urgency, no ALL CAPS, no "Dear Sir/Madam", no emojis unless asked.
- Output SIMPLE inline-friendly HTML: <p>, <a>, <strong>, <br> only. No <style>, <script>, <head>, tables, or images.
Return ONLY minified JSON: {"subject":"...","html":"..."} with no markdown fences.`;

/** Generate a subject + HTML body with Gemini (Google AI Studio). Throws
 * AiNotConfiguredError when no key is set. */
export async function generateEmail(prompt: string): Promise<GeneratedEmail> {
  if (!env.GEMINI_API_KEY) throw new AiNotConfiguredError();

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${env.GEMINI_MODEL}:generateContent?key=${env.GEMINI_API_KEY}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM }] },
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.8, responseMimeType: "application/json" },
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(
      `The AI writer had a problem (${res.status}). ${detail.slice(0, 140) || "Please try again."}`
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
    // Fall back: try to pull a JSON object out of the text.
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) throw new Error("The AI returned an unexpected format. Please try again.");
    parsed = JSON.parse(m[0]);
  }

  const subject = typeof parsed.subject === "string" ? parsed.subject.trim() : "";
  const rawHtml = typeof parsed.html === "string" ? parsed.html : "";
  if (!subject || !rawHtml) throw new Error("The AI didn't return a full email. Please try again.");

  return { subject, html: sanitizeEmailHtml(rawHtml) };
}
