/**
 * What the AI needs to know about a business, as fields instead of an essay.
 *
 * Brand memory used to be one 4,000-character box under the label "Offer, key
 * benefits, and tone", with a worked example of the sentence you were meant to
 * compose. That is a writing assignment disguised as a form. Two things go
 * wrong with it, and they compound:
 *
 * Most people write two lines and stop, because a blank box gives no hint of
 * when you are done. The model then has less to work with than the person
 * assumed, and the drafts come out generic in a way that reads as the AI being
 * weak rather than the input being thin.
 *
 * The ones who do write a lot write prose, and prose buries the parts the model
 * most needs to treat differently. "Never mention our old company name" has to
 * be a prohibition, not a sentence in a paragraph of facts. Flattened into one
 * blob it competes with everything else for attention.
 *
 * So the shape here separates what the model should *say* from who it is saying
 * it *to*, from what it must *never* say. Each field is a short answer to a
 * plain question, which is a thing people finish. The tone is a fixed set rather
 * than free text, because "friendly but professional but not too casual" is what
 * free text collects and it does not survive contact with a prompt.
 *
 * The legacy blob is not migrated or discarded. See `compileBrandVoice`.
 */

export const BRAND_TONES = [
  "Warm",
  "Direct",
  "Confident",
  "Consultative",
  "Playful",
  "Formal",
  "Understated",
] as const;

export type BrandTone = (typeof BRAND_TONES)[number];

export interface BrandVoice {
  /** What the business sells or offers. */
  offer: string;
  /** Who it is for. */
  audience: string;
  /** Why anyone should believe it: numbers, names, guarantees. */
  proof: string;
  /** How it should sound. A small closed set, not a sentence. */
  tones: BrandTone[];
  /** Words, claims, and topics that must never appear. */
  avoid: string;
}

export const EMPTY_BRAND_VOICE: BrandVoice = {
  offer: "",
  audience: "",
  proof: "",
  tones: [],
  avoid: "",
};

/**
 * The questions, in the order they are asked.
 *
 * Held as data so the form, the autofill prompt, and the completeness meter all
 * read from one list. When they were written separately the form asked for a
 * field the prompt never filled, and nothing failed: the box was simply always
 * empty, which looks like the AI ignoring you.
 */
export const BRAND_VOICE_FIELDS = [
  {
    key: "offer" as const,
    question: "What do you sell?",
    hint: "One or two lines. What it is, and what it does for someone.",
    placeholder: "Working capital from $10k to $500k, funded in 24 to 48 hours, no collateral.",
    /** Weight in the completeness meter. Without an offer nothing else helps. */
    essential: true,
  },
  {
    key: "audience" as const,
    question: "Who are you writing to?",
    hint: "The role and the kind of business, not a market-research paragraph.",
    placeholder: "Owners of trade and construction firms, 5 to 50 staff, in the US.",
    essential: true,
  },
  {
    key: "proof" as const,
    question: "Why should they believe you?",
    hint: "Anything concrete. Numbers, named customers, a guarantee, a credential.",
    placeholder: "Funded 2,400 businesses since 2019. A+ BBB. No fee if you don't draw.",
    essential: false,
  },
  {
    key: "avoid" as const,
    question: "Anything the AI must never say?",
    hint: "Claims you cannot make, words you hate, topics that are off limits.",
    placeholder: "Never say guaranteed approval. Never mention rates. Never say cheap.",
    essential: false,
  },
] as const;

/**
 * Turn the structured voice into the text the model actually receives.
 *
 * This exists so the AI seam never changed. Every generator already took a
 * single `brandContext` string and wove it into a system prompt, and rewriting
 * six of them to accept an object would have been a much larger and riskier
 * change than the one this feature needed. They still take a string; this
 * produces a better one.
 *
 * Better in a specific way: the blob a person typed gave the model a pile of
 * facts with no indication of how to treat any of them. This labels the parts,
 * so an instruction to never say something arrives as a prohibition rather than
 * as one more fact competing for attention.
 *
 * The `legacy` argument is the old free-text content. It is appended rather than
 * migrated, and never parsed: guessing which sentence of someone's paragraph was
 * meant to be the offer would silently mangle real customer data, and a wrong
 * guess is worse than no guess because nobody would know it happened. A profile
 * saved before this change keeps working exactly as it did, and filling in the
 * fields later adds to it instead of replacing it.
 */
export function compileBrandVoice(voice: BrandVoice, legacy = ""): string {
  const parts: string[] = [];

  if (voice.offer.trim()) parts.push(`WHAT THEY SELL: ${voice.offer.trim()}`);
  if (voice.audience.trim()) parts.push(`WHO THEY ARE WRITING TO: ${voice.audience.trim()}`);
  if (voice.proof.trim()) parts.push(`PROOF THEY CAN CITE: ${voice.proof.trim()}`);
  if (voice.tones.length > 0) {
    parts.push(`TONE: ${voice.tones.join(", ").toLowerCase()}.`);
  }
  if (voice.avoid.trim()) {
    // Phrased as an absolute because it is one, and placed last so it is the
    // final thing in the model's context rather than buried mid-paragraph.
    parts.push(`NEVER SAY, under any circumstances: ${voice.avoid.trim()}`);
  }

  const structured = parts.join("\n");
  const extra = legacy.trim();
  if (structured && extra) return `${structured}\n\nADDITIONAL NOTES: ${extra}`;
  return structured || extra;
}

/** Whether a voice has enough in it to improve a draft at all. */
export function isVoiceUsable(voice: BrandVoice): boolean {
  return voice.offer.trim().length > 0 || voice.audience.trim().length > 0;
}

/**
 * How complete the voice is, as a fraction, for the progress meter.
 *
 * Essential fields are worth double. A profile with only a tone selected is not
 * halfway done however many boxes it has ticked, and a meter that says it is
 * teaches people to stop early.
 */
export function brandVoiceCompleteness(voice: BrandVoice): number {
  let earned = 0;
  let total = 0;
  for (const field of BRAND_VOICE_FIELDS) {
    const weight = field.essential ? 2 : 1;
    total += weight;
    if (voice[field.key].trim()) earned += weight;
  }
  total += 1;
  if (voice.tones.length > 0) earned += 1;
  return total === 0 ? 0 : earned / total;
}
