import "server-only";
import { env } from "@/lib/env";
import { sanitizeEmailHtml } from "@/lib/sanitize/html";
import { AiNotConfiguredError } from "@/lib/ai/generateEmail";

export interface GeneratedReply {
  html: string;
}

export interface ReplyContext {
  replyText: string;
  firstName?: string;
  businessName?: string;
  brandContext?: string;
}

const SYSTEM = `You are a sales rep at a business-funding company, writing a REPLY to a prospect who just responded to your outreach.
Rules:
- Read their message and respond to what they actually said — answer questions, acknowledge concerns, match their energy.
- Warm, human, and helpful. Never pushy, never a hard sell.
- Keep it under ~90 words. Move the conversation one concrete step forward — usually a quick call or a simple next step.
- Do NOT invent specific rates, dollar amounts, or approval terms. Offer to get them exact numbers on a short call instead.
- Sign off with {{signature}} on its own line. You may use {{firstName}} for their name if natural.
- Output SIMPLE inline-friendly HTML: <p>, <a>, <strong>, <br> only. No <style>, <script>, tables, or images.
Return ONLY minified JSON: {"html":"..."} with no markdown fences.`;

/** Draft a reply to an inbound prospect message with Gemini. Throws
 * AiNotConfiguredError when no key is set. */
export async function generateReply(ctx: ReplyContext): Promise<GeneratedReply> {
  if (!env.GEMINI_API_KEY) throw new AiNotConfiguredError();

  const system = ctx.brandContext?.trim()
    ? `${SYSTEM}\n\nBRAND MEMORY — use these facts naturally where relevant (never dump them):\n${ctx.brandContext.trim()}`
    : SYSTEM;

  const parts = [
    ctx.firstName ? `Prospect first name: ${ctx.firstName}` : "",
    ctx.businessName ? `Their business: ${ctx.businessName}` : "",
    `Their reply to us:\n"""${ctx.replyText || "(no readable text — write a brief, friendly nudge to reconnect)"}"""`,
    "Write our reply.",
  ]
    .filter(Boolean)
    .join("\n");

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${env.GEMINI_MODEL}:generateContent?key=${env.GEMINI_API_KEY}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: "user", parts: [{ text: parts }] }],
      generationConfig: { temperature: 0.7, responseMimeType: "application/json" },
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

  let parsed: { html?: unknown };
  try {
    parsed = JSON.parse(text);
  } catch {
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) throw new Error("The AI returned an unexpected format. Please try again.");
    parsed = JSON.parse(m[0]);
  }

  const rawHtml = typeof parsed.html === "string" ? parsed.html : "";
  if (!rawHtml) throw new Error("The AI didn't return a reply. Please try again.");

  return { html: sanitizeEmailHtml(rawHtml) };
}
