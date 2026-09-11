import "server-only";
import { callModel } from "@/lib/ai/callModel";

import { env } from "@/lib/env";
import { sanitizeEmailHtml } from "@/lib/sanitize/html";
import { AiNotConfiguredError } from "@/lib/ai/generateEmail";

export interface GeneratedStep {
  waitDays: number;
  subject: string;
  html: string;
}

const SYSTEM = `You write a short outreach FOLLOW-UP sequence for the organization and audience described by the user and brand memory.
Each step is sent only if the recipient has not replied.
Rules:
- Never assume an industry, product, or sales use case that was not supplied.
- Produce 2 or 3 steps that escalate gently: a light nudge, then a useful value-add, then a respectful final check-in. Never pushy or guilt-trippy.
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
    ? `${SYSTEM}\n\nBRAND MEMORY: weave in naturally, fresh each step:\n${input.brandContext.trim()}`
    : SYSTEM;

  const text = await callModel({
    system: system,
    user: input.prompt,
    temperature: 0.8,
    label: "The AI writer",
  });
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
