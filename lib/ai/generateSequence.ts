import "server-only";
import { env } from "@/lib/env";
import { sanitizeEmailHtml } from "@/lib/sanitize/html";
import { AiNotConfiguredError } from "@/lib/ai/generateEmail";

export interface GeneratedStep {
  waitDays: number;
  subject: string;
  html: string;
}

const SYSTEM = `You write a short cold-outreach FOLLOW-UP sequence for a business-funding company.
Each step is a follow-up email sent only if the prospect hasn't replied yet.
Rules:
- Produce 2 or 3 steps that escalate gently — a light nudge, then a value-add, then a final "should I close your file?" style check-in. Never pushy or guilt-trippy.
- Each email under ~80 words. Warm, human, one clear ask.
- Use placeholders where natural: {{first_name}}, {{business_name}}, {{signature}}. End each body with {{signature}} on its own line.
- waitDays = business days to wait after the PREVIOUS email (first step ~3, later steps ~4-5).
- Simple inline HTML only: <p>, <a>, <strong>, <br>. No <style>, <script>, tables, or images.
Return ONLY minified JSON: {"steps":[{"waitDays":3,"subject":"...","html":"..."}]} with no markdown fences.`;

/** Generate a 2-3 step follow-up sequence from one plain-language prompt. */
export async function generateSequence(input: {
  prompt: string;
  brandContext?: string;
}): Promise<{ steps: GeneratedStep[] }> {
  if (!env.GEMINI_API_KEY) throw new AiNotConfiguredError();

  const system = input.brandContext?.trim()
    ? `${SYSTEM}\n\nBRAND MEMORY — weave in naturally, fresh each step:\n${input.brandContext.trim()}`
    : SYSTEM;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${env.GEMINI_MODEL}:generateContent?key=${env.GEMINI_API_KEY}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: "user", parts: [{ text: input.prompt }] }],
      generationConfig: { temperature: 0.8, responseMimeType: "application/json" },
    }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`The AI writer had a problem (${res.status}). ${detail.slice(0, 140) || "Please try again."}`);
  }

  const data = (await res.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  let parsed: { steps?: unknown };
  try {
    parsed = JSON.parse(text);
  } catch {
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) throw new Error("The AI returned an unexpected format. Please try again.");
    parsed = JSON.parse(m[0]);
  }

  const raw = Array.isArray(parsed.steps) ? parsed.steps : [];
  const steps: GeneratedStep[] = raw
    .map((s) => s as Record<string, unknown>)
    .filter((s) => typeof s.subject === "string" && typeof s.html === "string")
    .slice(0, 5)
    .map((s) => ({
      waitDays: Math.min(30, Math.max(1, Math.round(Number(s.waitDays) || 3))),
      subject: String(s.subject).trim(),
      html: sanitizeEmailHtml(String(s.html)),
    }));

  if (steps.length === 0) throw new Error("The AI didn't return any steps. Please try again.");
  return { steps };
}
