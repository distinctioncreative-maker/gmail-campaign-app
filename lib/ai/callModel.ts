import "server-only";
import { env } from "@/lib/env";
import { AiUnavailableError, geminiEndpoint, geminiFailure } from "@/lib/ai/gemini";

/**
 * One call, two providers.
 *
 * Every AI feature in the product asks the same thing of a model: here is a
 * system instruction, here is the user's text, give me JSON back at this
 * temperature. No tools, no grounding, no safety overrides, nothing
 * provider-shaped. That is what makes the provider swappable at all, and it is
 * worth keeping true.
 *
 * Why bother: Google's free tier may use free-tier inputs and outputs to
 * improve their models, and this app's prompts carry customers' lead names,
 * business names and email copy. Groq does not train on inputs or outputs on
 * any plan and offers zero data retention. So the free option with the better
 * data terms is not the Google one, and a product handling other people's
 * lists should be able to move.
 *
 * Groq speaks OpenAI's chat-completions shape, which Cerebras, OpenRouter,
 * Mistral and Together also speak, so this one adapter is really four.
 */

export interface ModelRequest {
  /** The system instruction. */
  system: string;
  /** The user turn. */
  user: string;
  /** 0 for extraction, up to ~0.85 for writing. */
  temperature: number;
  /** What the user was doing, for the error message. */
  label?: string;
}

/** Which provider the deployment is pointed at. */
export function activeProvider(): "gemini" | "groq" {
  return env.AI_PROVIDER === "groq" ? "groq" : "gemini";
}

/** The model id in play, for error messages and logs. */
export function activeModel(): string {
  return activeProvider() === "groq" ? env.GROQ_MODEL : env.GEMINI_MODEL;
}

const GROQ_ENDPOINT = "https://api.groq.com/openai/v1/chat/completions";

/**
 * Ask the configured model for JSON and return its raw text.
 *
 * Parsing stays with the caller: each feature knows the shape it asked for and
 * already validates it, and several of them repair a response rather than
 * giving up on it.
 */
export async function callModel({
  system,
  user,
  temperature,
  label = "The AI",
}: ModelRequest): Promise<string> {
  if (activeProvider() === "groq") return callGroq(system, user, temperature, label);
  return callGemini(system, user, temperature, label);
}

/**
 * The Gemini path, byte-identical to what the ten call sites built by hand
 * before this existed. A test pins that, because the default provider changing
 * behaviour on a deploy nobody asked for is exactly the failure this refactor
 * could introduce.
 */
async function callGemini(
  system: string,
  user: string,
  temperature: number,
  label: string
): Promise<string> {
  if (!env.GEMINI_API_KEY) {
    throw new AiUnavailableError(
      "GEMINI_API_KEY is empty.",
      "AI writing isn't set up yet."
    );
  }
  const res = await fetch(geminiEndpoint(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: "user", parts: [{ text: user }] }],
      generationConfig: { temperature, responseMimeType: "application/json" },
    }),
  });
  if (!res.ok) throw geminiFailure(res.status, await res.text().catch(() => ""), label);
  const data = (await res.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  return data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
}

/** OpenAI-compatible chat completions. */
async function callGroq(
  system: string,
  user: string,
  temperature: number,
  label: string
): Promise<string> {
  if (!env.GROQ_API_KEY) {
    throw new AiUnavailableError(
      "AI_PROVIDER is groq but GROQ_API_KEY is empty.",
      "AI writing isn't set up yet."
    );
  }
  const res = await fetch(GROQ_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.GROQ_API_KEY}`,
    },
    body: JSON.stringify({
      model: env.GROQ_MODEL,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      temperature,
      // The OpenAI-compatible spelling of Gemini's responseMimeType. Every
      // prompt in this app already states the JSON shape it wants in the
      // system instruction, which is what this mode requires.
      response_format: { type: "json_object" },
    }),
  });
  if (!res.ok) throw geminiFailure(res.status, await res.text().catch(() => ""), label);
  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  return data.choices?.[0]?.message?.content ?? "";
}
