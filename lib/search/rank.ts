/**
 * Ranking for the command palette.
 *
 * A palette lives or dies on the first result. If typing three letters puts
 * the thing you wanted third, you stop trusting it and go back to clicking,
 * and the feature has cost more than it gave. So the scoring is explicit and
 * tested rather than left to whatever order Firestore returned.
 *
 * The order that matters, highest first:
 *
 *   exact match          "q3 founders" → "Q3 founders"
 *   whole-string prefix  "q3" → "Q3 founders"
 *   word prefix          "found" → "Q3 founders"
 *   substring            "ounder" → "Q3 founders"
 *
 * Whole-string prefix beats word prefix because someone typing from the start
 * of a name is almost always after that specific thing. Substring is last
 * because it is the weakest evidence of intent, but it is kept: it is what
 * saves the person who remembers the middle of a name and not the beginning.
 *
 * Recency breaks ties rather than driving the ranking. Ordering primarily by
 * recency would mean the same three campaigns crowd out an exact-name match on
 * an older one, which is the single most annoying way for a palette to fail.
 */

export interface Rankable {
  /** The text a person is typing at. */
  text: string;
  /** Secondary text also worth matching, e.g. an email under a name. */
  subtext?: string;
  /** Epoch millis, used only to break ties between equal scores. */
  updatedAt?: number;
}

const EXACT = 1000;
const PREFIX = 500;
const WORD_PREFIX = 250;
const SUBSTRING = 100;
/** A hit in the secondary field counts, but never outranks the primary one. */
const SUBTEXT_PENALTY = 0.4;

export function normalizeQuery(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, " ");
}

function scoreField(field: string, query: string): number {
  const text = field.toLowerCase();
  if (!text) return 0;
  if (text === query) return EXACT;
  if (text.startsWith(query)) return PREFIX;
  // Word boundaries include the separators that show up in real names:
  // "Q3 founders", "acme-corp", "welcome_email", "sales/EU".
  if (new RegExp(`(?:^|[\\s\\-_/.,(])${escapeRegex(query)}`).test(text)) return WORD_PREFIX;
  if (text.includes(query)) return SUBSTRING;
  return 0;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * How well one item matches, or 0 for no match.
 *
 * A multi-word query is matched as a whole first, then as separate terms that
 * must all appear somewhere. "acme q3" should find "Q3 founders at Acme" even
 * though those words are not adjacent, which is how people actually type when
 * they half-remember a name.
 */
export function scoreMatch(item: Rankable, query: string): number {
  if (!query) return 0;
  const direct = Math.max(
    scoreField(item.text, query),
    scoreField(item.subtext ?? "", query) * SUBTEXT_PENALTY
  );
  if (direct > 0) return direct;

  const terms = query.split(" ").filter(Boolean);
  if (terms.length < 2) return 0;
  const haystack = `${item.text} ${item.subtext ?? ""}`.toLowerCase();
  if (!terms.every((term) => haystack.includes(term))) return 0;
  // Every term is present but not contiguously: real, and weaker than any
  // contiguous match, so it sits below SUBSTRING.
  return SUBSTRING / 2;
}

export function rankItems<T extends Rankable>(items: readonly T[], query: string, limit: number): T[] {
  const normalized = normalizeQuery(query);
  if (!normalized) return [];
  return items
    .map((item) => ({ item, score: scoreMatch(item, normalized) }))
    .filter((row) => row.score > 0)
    .sort(
      (a, b) =>
        b.score - a.score ||
        (b.item.updatedAt ?? 0) - (a.item.updatedAt ?? 0) ||
        a.item.text.localeCompare(b.item.text)
    )
    .slice(0, limit)
    .map((row) => row.item);
}

export type PaletteGroup = "Actions" | "Campaigns" | "Leads" | "Templates" | "Follow-ups" | "Pages";

export interface PaletteResult extends Rankable {
  id: string;
  group: PaletteGroup;
  href: string;
  /** Shown on the right, e.g. a campaign status. */
  meta?: string;
}

/**
 * Order the groups appear in.
 *
 * Actions first when there is a query, because an action is something the
 * person means to *do* and there are only ever a handful, so it costs nothing
 * to put them on top. Pages last: they are always reachable from the sidebar,
 * so they are the least valuable thing a palette can offer.
 */
export const GROUP_ORDER: readonly PaletteGroup[] = [
  "Actions",
  "Campaigns",
  "Leads",
  "Templates",
  "Follow-ups",
  "Pages",
];

export function groupResults(results: readonly PaletteResult[]): Array<{
  group: PaletteGroup;
  items: PaletteResult[];
}> {
  return GROUP_ORDER.map((group) => ({
    group,
    items: results.filter((r) => r.group === group),
  })).filter((section) => section.items.length > 0);
}

/**
 * Flat order for keyboard navigation.
 *
 * Arrow keys must walk the list exactly as it is drawn, across group
 * boundaries, or the highlight jumps and the palette feels broken. Deriving
 * both the render order and the key order from this one function is what keeps
 * them from drifting apart.
 */
export function flattenGroups(results: readonly PaletteResult[]): PaletteResult[] {
  return groupResults(results).flatMap((section) => section.items);
}
