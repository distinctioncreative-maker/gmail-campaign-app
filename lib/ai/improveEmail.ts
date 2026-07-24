import "server-only";
import { env } from "@/lib/env";
import { sanitizeEmailHtml } from "@/lib/sanitize/html";
import { AiNotConfiguredError } from "@/lib/ai/generateEmail";

/** Low-level Gemini JSON call shared by the editor's AI tools. */
async function callGeminiJson(system: string, user: string): Promise<Record<string, unknown>> {
  if (!env.GEMINI_API_KEY) throw new AiNotConfiguredError();
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${env.GEMINI_MODEL}:generateContent?key=${env.GEMINI_API_KEY}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: "user", parts: [{ text: user }] }],
      generationConfig: { temperature: 0.75, responseMimeType: "application/json" },
    }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`The AI writer had a problem (${res.status}). ${detail.slice(0, 140) || "Please try again."}`);
  }
  const data = (await res.json()) as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  try {
    return JSON.parse(text);
  } catch {
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) throw new Error("The AI returned an unexpected format. Please try again.");
    return JSON.parse(m[0]);
  }
}

const IMPROVE_SYSTEM = `You edit an existing B2B cold outreach email for a business-funding company.
- Apply the user's instruction while KEEPING every placeholder exactly as-is: {{first_name}}, {{business_name}}, {{signature}}, and any other {{...}} tokens. Never remove, rename, or invent placeholders.
- Keep it human and non-spammy. Simple inline HTML only (<p>, <a>, <strong>, <br>). No <style>, <script>, tables, or images.
- Return the FULL rewritten email, not a diff.
Return ONLY minified JSON: {"subject":"...","html":"..."} with no markdown fences.`;

/** Rewrite an email according to a plain instruction (shorter, warmer, fix
 * spammy words, etc.). Preserves placeholders. */
export async function improveEmail(input: {
  subject: string;
  html: string;
  instruction: string;
  brandContext?: string;
}): Promise<{ subject: string; html: string }> {
  const system = input.brandContext?.trim()
    ? `${IMPROVE_SYSTEM}\n\nBRAND MEMORY (keep the email consistent with this):\n${input.brandContext.trim()}`
    : IMPROVE_SYSTEM;
  const user = `Instruction: ${input.instruction}\n\nCurrent subject: ${input.subject}\n\nCurrent HTML:\n${input.html}`;
  const parsed = await callGeminiJson(system, user);
  const subject = typeof parsed.subject === "string" ? parsed.subject.trim() : input.subject;
  const rawHtml = typeof parsed.html === "string" ? parsed.html : "";
  if (!rawHtml) throw new Error("The AI didn't return a full email. Please try again.");
  return { subject, html: sanitizeEmailHtml(rawHtml) };
}

const SUBJECTS_SYSTEM = `You write alternative subject lines for a B2B cold outreach email.
- Give 3 distinct options: short (under ~50 chars), specific, curiosity-driven, no spammy words, no ALL CAPS, no emojis.
- They must fit the email body provided.
Return ONLY minified JSON: {"subjects":["...","...","..."]} with no markdown fences.`;

/** Generate 3 alternative subject lines for the current email. */
export async function generateSubjects(input: {
  subject: string;
  html: string;
  brandContext?: string;
}): Promise<{ subjects: string[] }> {
  const system = input.brandContext?.trim()
    ? `${SUBJECTS_SYSTEM}\n\nBRAND MEMORY:\n${input.brandContext.trim()}`
    : SUBJECTS_SYSTEM;
  const bodyText = input.html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 800);
  const user = `Current subject: ${input.subject}\n\nEmail body:\n${bodyText}`;
  const parsed = await callGeminiJson(system, user);
  const subjects = Array.isArray(parsed.subjects)
    ? parsed.subjects.filter((s): s is string => typeof s === "string" && s.trim().length > 0).slice(0, 3)
    : [];
  if (subjects.length === 0) throw new Error("The AI didn't return subject ideas. Please try again.");
  return { subjects: subjects.map((s) => s.trim()) };
}
