import "server-only";
import { env } from "@/lib/env";
import { AiNotConfiguredError } from "@/lib/ai/generateEmail";
import { BRAND_TONES, EMPTY_BRAND_VOICE, type BrandTone, type BrandVoice } from "@/lib/ai/brandVoice";

/**
 * Read a company's own website and fill in its brand voice.
 *
 * This is the feature, not a convenience on top of it. The structured fields are
 * an improvement over one big box, but five short-answer questions is still five
 * things to write, and the honest description of the old flow was "do some
 * homework before the product works". Pasting your own domain and getting the
 * answers back is the difference between a setup step and a setup screen.
 *
 * Three rules shape the prompt, and each exists because the obvious version of
 * this feature gets it wrong:
 *
 * **Extract, never invent.** A model asked to describe a business from a thin
 * page will happily produce plausible-sounding proof points, and proof points
 * are exactly the thing that must be real: they end up quoted in an email to a
 * stranger. Fields with no support on the page come back empty, and empty is a
 * success, not a failure to be retried.
 *
 * **Never fill `avoid`.** The prohibitions are the one field a website cannot
 * answer. A company's site does not say which claims its compliance team
 * forbids, and a guess there is worse than a blank: it would read as
 * authoritative and quietly narrow or widen what the AI is willing to say.
 *
 * **Tones come from the closed set.** Asking for free-text tone would return
 * "professional yet approachable", which is not a tone, and would then need
 * mapping back onto the chips anyway.
 */

const SYSTEM = `You read a company's website and extract facts about how they describe themselves.

You are filling in a form with these fields:
- offer: what the company sells or provides, and what it does for the customer. Two lines at most.
- audience: who they sell to. Role and type of business, if the page says.
- proof: concrete credibility the page actually states. Numbers, years in business, named customers, certifications, guarantees.
- tones: how their own writing sounds, chosen ONLY from this list: ${BRAND_TONES.join(", ")}. Pick one to three.

ABSOLUTE RULES:
- Extract only what the page supports. Never infer, embellish, or invent.
- If the page does not support a field, return an empty string for it. An empty field is the correct answer, not a failure.
- NEVER invent numbers, customer names, awards, or guarantees. These get quoted in real emails to real people.
- Write in plain third-person statements of fact, not marketing copy.
- Do not include the company's own slogans verbatim.

Return ONLY minified JSON: {"offer":"...","audience":"...","proof":"...","tones":["..."]} with no markdown fences.`;

export interface BrandVoiceSuggestion {
  voice: BrandVoice;
  /** Fields the page could not answer, so the form can say so rather than look broken. */
  unfilled: Array<keyof BrandVoice>;
}

export async function suggestBrandVoice(
  pageText: string,
  siteUrl: string
): Promise<BrandVoiceSuggestion> {
  if (!env.GEMINI_API_KEY) throw new AiNotConfiguredError();

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${env.GEMINI_MODEL}:generateContent?key=${env.GEMINI_API_KEY}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM }] },
      contents: [
        {
          role: "user",
          parts: [{ text: `Website: ${siteUrl}\n\nPage text:\n${pageText}` }],
        },
      ],
      // Low temperature on purpose. This is an extraction task, and the failure
      // mode of a creative setting here is a confident fabrication in a field
      // that ends up quoted to a stranger.
      generationConfig: { temperature: 0.2, responseMimeType: "application/json" },
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(
      `Could not read that site (${res.status}). ${detail.slice(0, 140) || "Please try again."}`
    );
  }

  const data = (await res.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(text);
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("The AI returned an unexpected format. Please try again.");
    parsed = JSON.parse(match[0]);
  }

  const str = (key: string, max: number): string => {
    const value = parsed[key];
    return typeof value === "string" ? value.trim().slice(0, max) : "";
  };

  const allowed = new Set<string>(BRAND_TONES);
  const tones = Array.isArray(parsed.tones)
    ? [
        ...new Set(
          parsed.tones.filter((t): t is BrandTone => typeof t === "string" && allowed.has(t))
        ),
      ].slice(0, 3)
    : [];

  const voice: BrandVoice = {
    ...EMPTY_BRAND_VOICE,
    offer: str("offer", 600),
    audience: str("audience", 400),
    proof: str("proof", 600),
    tones,
    // Never suggested. See the module comment: a website cannot know which
    // claims a company forbids, and a confident guess here would silently
    // change what the AI is willing to write.
    avoid: "",
  };

  const unfilled = (["offer", "audience", "proof"] as const).filter(
    (key) => !voice[key].trim()
  );
  if (voice.tones.length === 0) unfilled.push("tones" as never);

  return { voice, unfilled };
}
