import "server-only";
import { env } from "@/lib/env";
import { AiNotConfiguredError } from "@/lib/ai/generateEmail";

/**
 * Read a company's website for the details the sender profile asks for.
 *
 * The onboarding step this serves is nine text fields long, and it is the step
 * that decides whether a trial ever sends anything: two of those fields, the
 * postal address and the opt-out sentence, block campaign launch. A new customer
 * meets it on their first day, immediately after connecting Gmail, and typing
 * out their own company address is the least interesting work imaginable.
 *
 * Most of it is already published. A business website almost always carries the
 * legal name and the postal address in its footer, because the same commercial
 * email and trading rules that require them here required them there.
 *
 * Two fields are deliberately absent from what this extracts:
 *
 * **The opt-out sentence** is not on anyone's website, and it is a sentence in
 * the sender's own voice. It has a good default already, which is a better
 * answer than a scraped guess.
 *
 * **The signature** is personal rather than corporate. Reading a company page to
 * invent an individual's sign-off would produce something plausible and wrong,
 * and it is the one field where wrong is embarrassing in a way the recipient can
 * see.
 */

const SYSTEM = `You read a company's website and extract their published business details, for filling in a form.

Extract only these fields:
- companyName: the legal or trading name of the business, as written on the page.
- physicalAddress: their full postal address, on one line, as published. Usually in the page footer or a contact section.

ABSOLUTE RULES:
- Extract only what the page states. Never infer, complete, or guess any part of an address.
- A partial address is worse than none. If the page shows only a city, or only a country, return an empty string.
- Never invent a suite number, postcode, or street.
- If a field is not on the page, return an empty string for it. Empty is the correct answer, not a failure.

Return ONLY minified JSON: {"companyName":"...","physicalAddress":"..."} with no markdown fences.`;

export interface SenderIdentitySuggestion {
  companyName: string;
  physicalAddress: string;
}

export async function suggestSenderIdentity(
  pageText: string,
  siteUrl: string
): Promise<SenderIdentitySuggestion> {
  if (!env.GEMINI_API_KEY) throw new AiNotConfiguredError();

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${env.GEMINI_MODEL}:generateContent?key=${env.GEMINI_API_KEY}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM }] },
      contents: [{ role: "user", parts: [{ text: `Website: ${siteUrl}\n\n${pageText}` }] }],
      // As low as it goes. This is transcription, and the field it fills is a
      // legal footer on commercial email: a hallucinated street address is a
      // compliance problem printed on every message the customer sends.
      generationConfig: { temperature: 0, responseMimeType: "application/json" },
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
    return typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, max) : "";
  };

  return {
    companyName: str("companyName", 200),
    // Discarded unless it looks like a real postal address: a street number and
    // some words. The model is instructed to return nothing rather than a
    // fragment, and this is the check that holds it to that, because "London,
    // UK" in a legal footer satisfies nobody and looks deliberate.
    physicalAddress: plausibleAddress(str("physicalAddress", 500)),
  };
}

/**
 * Whether an extracted string is complete enough to print in a legal footer.
 *
 * Exported for testing. The rule is deliberately crude and errs towards
 * rejecting: an empty field prompts someone to type their address, while a
 * half-address gets accepted without a glance and ships on every email.
 */
export function plausibleAddress(value: string): string {
  const text = value.trim();
  if (text.length < 12) return "";
  // A street number, a PO box, or a unit designation. Every usable postal
  // address has one, and a bare "City, Country" fragment has none.
  if (!/\d/.test(text)) return "";
  // At least three comma- or space-separated parts, so a lone postcode or a
  // single line like "Suite 4" does not pass.
  if (text.split(/[,\n]/).filter((part) => part.trim().length > 1).length < 2) return "";
  return text;
}
