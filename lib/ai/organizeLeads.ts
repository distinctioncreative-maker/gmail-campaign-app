import "server-only";
import { env } from "@/lib/env";
import { AiNotConfiguredError } from "@/lib/ai/generateEmail";
import { normalizeTagName, MAX_CONTACT_TAG_LENGTH } from "@/lib/leads/tags";

/**
 * Propose a way to group a pile of leads.
 *
 * A list of two thousand imported contacts is not a segment, and the tools for
 * turning it into one are tags and lead lists that somebody has to invent and
 * then apply by hand. Almost nobody does, so campaigns go out to "everyone",
 * which is both the worst-performing choice and the one that most looks like
 * spam to a provider.
 *
 * The model's job here is narrow on purpose. It is not deciding who to email or
 * mutating anything; it reads the business names and what their websites said,
 * and proposes named groups with the leads that belong to each. A person accepts
 * or discards the whole proposal.
 *
 * Two properties do the real work:
 *
 * **Every lead is referenced by index, never by name.** Asking a model to return
 * the leads in a group as text invites it to lightly reword a company name, and
 * a reworded name matches nothing when the result is applied. Indices either
 * resolve or they do not, and one that does not is dropped rather than guessed
 * at.
 *
 * **A proposal is never applied here.** This returns groups for review. Tagging
 * two thousand contacts is a large, tedious-to-undo action, and it should not be
 * the invisible half of pressing a button labelled "organize".
 */

export interface LeadForOrganizing {
  /** Position in the caller's array. The only identifier the model ever sees. */
  index: number;
  businessName: string;
  /** What their website said, when it was already in the lookup cache. */
  summary?: string;
}

export interface ProposedGroup {
  /** A tag name, already normalized to what the tag system accepts. */
  name: string;
  /** Why these belong together, in the model's words, for the reviewer. */
  reason: string;
  /** Indices into the input array. Always valid: invalid ones are dropped. */
  indices: number[];
}

const SYSTEM = `You group business leads for a salesperson, so they can send relevant campaigns instead of one email to everyone.

You are given a numbered list of businesses. Propose 3 to 6 groups.

Rules for the groups:
- Group by what the business actually is or does: industry, what they sell, who they serve, or size if it is evident.
- Never group by anything you cannot see in the data. Do not invent revenue, headcount, or location that is not stated.
- Every group must be useful to write a different email to. "Other" and "Miscellaneous" are not groups.
- A lead may appear in at most one group. Leave a lead out entirely if it fits nowhere.
- Group names: 1 to 3 words, lowercase, no punctuation. Examples: "roofing", "auto repair", "dental practices".
- Give each group a one-sentence reason a person can check against the list.

Return ONLY minified JSON: {"groups":[{"name":"...","reason":"...","indices":[0,3,7]}]} with no markdown fences.`;

/** The most leads worth sending in one pass. Beyond this the prompt gets long
 * and the groups get vague, which is worse than not offering the feature. */
export const MAX_LEADS_PER_PASS = 200;

/**
 * Keep only the groups and indices that are actually usable.
 *
 * Exported for testing. Everything here is defending against a model that
 * returns something structurally plausible and semantically wrong, which is the
 * normal case rather than the exception.
 */
export function sanitizeGroups(
  raw: unknown,
  leadCount: number
): ProposedGroup[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<number>();
  const names = new Set<string>();
  const groups: ProposedGroup[] = [];

  for (const entry of raw) {
    const o = (entry ?? {}) as Record<string, unknown>;
    const name = normalizeTagName(
      typeof o.name === "string" ? o.name.slice(0, MAX_CONTACT_TAG_LENGTH) : ""
    );
    if (!name) continue;
    // A duplicate group name would produce two chips that look identical and
    // apply the same tag, so the second is dropped rather than merged: merging
    // would silently change which reason belongs to which leads.
    if (names.has(name)) continue;

    const reason = typeof o.reason === "string" ? o.reason.trim().slice(0, 200) : "";

    const indices: number[] = [];
    for (const value of Array.isArray(o.indices) ? o.indices : []) {
      const index = typeof value === "number" ? Math.trunc(value) : Number.NaN;
      // Out of range means the model referenced a lead that does not exist.
      // Dropped, never clamped: clamping would tag the wrong person.
      if (!Number.isInteger(index) || index < 0 || index >= leadCount) continue;
      // The prompt says one group per lead; this enforces it, because a lead in
      // two groups gets two tags and the reviewer sees a count that does not
      // add up.
      if (seen.has(index)) continue;
      seen.add(index);
      indices.push(index);
    }

    // A group of one is not a segment, and a named group with nothing in it is
    // a chip that does nothing when pressed.
    if (indices.length < 2) {
      for (const index of indices) seen.delete(index);
      continue;
    }

    names.add(name);
    groups.push({ name, reason, indices });
  }

  return groups.slice(0, 8);
}

export async function organizeLeads(leads: LeadForOrganizing[]): Promise<ProposedGroup[]> {
  if (!env.GEMINI_API_KEY) throw new AiNotConfiguredError();
  if (leads.length < 4) return [];

  const listing = leads
    .slice(0, MAX_LEADS_PER_PASS)
    .map((lead) => {
      const detail = lead.summary?.trim() ? `: ${lead.summary.trim().slice(0, 220)}` : "";
      return `${lead.index}. ${lead.businessName || "(no business name)"}${detail}`;
    })
    .join("\n");

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${env.GEMINI_MODEL}:generateContent?key=${env.GEMINI_API_KEY}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM }] },
      contents: [{ role: "user", parts: [{ text: listing }] }],
      // Classification, not writing. Creativity here means inventing categories
      // that the data does not support.
      generationConfig: { temperature: 0.2, responseMimeType: "application/json" },
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(
      `The AI had a problem (${res.status}). ${detail.slice(0, 140) || "Please try again."}`
    );
  }

  const data = (await res.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";

  let parsed: { groups?: unknown };
  try {
    parsed = JSON.parse(text);
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("The AI returned an unexpected format. Please try again.");
    parsed = JSON.parse(match[0]);
  }

  return sanitizeGroups(parsed.groups, Math.min(leads.length, MAX_LEADS_PER_PASS));
}
