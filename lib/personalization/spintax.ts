/**
 * Spintax: `{option one|option two}` chosen per recipient.
 *
 * Five hundred byte-identical bodies is a fingerprint. Providers cluster on
 * message similarity, and varying the wording is one of the very few
 * deliverability levers that costs nothing and needs no infrastructure.
 *
 * Three decisions shape this file.
 *
 * **It parses rather than regexes.** A single regex over `\{([^{}]*)\}` looks
 * adequate until someone nests, and `{Hi {there|friend}|Hello}` then produces
 * mangled output rather than an error. Silently corrupting an email is worse
 * than refusing to send it, so the parser is recursive and reports what it
 * cannot read.
 *
 * **`{{placeholder}}` is not spintax.** The two syntaxes share a brace, and the
 * templates already in the database are full of `{{first_name}}`. A parser that
 * did not know the difference would read `{{first_name}}` as a spin group whose
 * only option is `{first_name}`, and quietly strip a brace from every
 * placeholder in the product. Double braces are therefore recognised and
 * skipped whole.
 *
 * **Expansion happens before placeholder substitution**, never after. A lead
 * whose company is literally "Foo {Bar|Baz}" is data, not markup, and a
 * substitute-then-spin order would let a contact's own field name become
 * template syntax that decides what the email says.
 */

export interface SpintaxIssue {
  /** Character offset, so an editor can point at it. */
  index: number;
  message: string;
}

export interface SpintaxAnalysis {
  /** Distinct bodies this template can produce. 1 means no variation. */
  variants: number;
  /** True when the count was clamped rather than computed exactly. */
  clamped: boolean;
  /** How many spin groups the template contains. */
  groups: number;
  issues: SpintaxIssue[];
}

/**
 * Above this the exact number stops being information. "This produces 4,096
 * distinct bodies" tells a writer something; "this produces 2^61" does not, and
 * computing it invites a float that reads as Infinity in the interface.
 */
const MAX_VARIANTS = 1_000_000;

type Node = string | { options: Node[][] };

interface ParseState {
  index: number;
  issues: SpintaxIssue[];
}

/**
 * Parse until the given terminator, returning the nodes consumed.
 *
 * `stopAt` is `|` or `}` inside a group and undefined at the top level, which
 * is what lets the same function handle both without a separate tokenizer.
 */
function parseNodes(
  input: string,
  state: ParseState,
  inGroup: boolean
): Node[] {
  const nodes: Node[] = [];
  let literal = "";

  const flush = () => {
    if (literal) nodes.push(literal);
    literal = "";
  };

  while (state.index < input.length) {
    const char = input[state.index];

    // A placeholder, not a group. Copied through untouched, braces and all.
    if (char === "{" && input[state.index + 1] === "{") {
      const close = input.indexOf("}}", state.index + 2);
      if (close === -1) {
        // An unterminated {{ is a template problem, not a spintax one, and the
        // placeholder renderer already reports it. Take the braces literally.
        literal += input.slice(state.index);
        state.index = input.length;
        continue;
      }
      literal += input.slice(state.index, close + 2);
      state.index = close + 2;
      continue;
    }

    if (char === "{") {
      flush();
      state.index += 1;
      nodes.push(parseGroup(input, state));
      continue;
    }

    if (inGroup && (char === "|" || char === "}")) {
      flush();
      return nodes;
    }

    if (!inGroup && char === "}") {
      // A stray closing brace at the top level. Recorded, then taken as text,
      // because refusing to render the whole email over one typo is a worse
      // trade than sending it with a visible brace the author can see.
      state.issues.push({
        index: state.index,
        message: "Unmatched } with no opening brace.",
      });
      literal += char;
      state.index += 1;
      continue;
    }

    literal += char;
    state.index += 1;
  }

  flush();
  return nodes;
}

function parseGroup(input: string, state: ParseState): { options: Node[][] } {
  const start = state.index - 1;
  const options: Node[][] = [];

  for (;;) {
    options.push(parseNodes(input, state, true));
    const char = input[state.index];
    if (char === "|") {
      state.index += 1;
      continue;
    }
    if (char === "}") {
      state.index += 1;
      break;
    }
    // Ran off the end without a closing brace.
    state.issues.push({
      index: start,
      message: "Unclosed { : every spin group needs a matching }.",
    });
    break;
  }

  if (options.length === 1) {
    state.issues.push({
      index: start,
      message: "This group has only one option, so it produces no variation. Use { a | b }.",
    });
  }
  if (options.some((option) => option.length === 0)) {
    // `{hello||there}` is almost always a typo rather than a deliberate empty
    // option, and it silently drops a word from a fraction of the send.
    state.issues.push({
      index: start,
      message: "One option is empty. Remove the extra | or fill it in.",
    });
  }

  return { options };
}

function parse(input: string): { nodes: Node[]; issues: SpintaxIssue[] } {
  const state: ParseState = { index: 0, issues: [] };
  const nodes = parseNodes(input, state, false);
  return { nodes, issues: state.issues };
}

/**
 * Deterministic 0..1 from a string.
 *
 * Determinism is the requirement, not randomness. A retry after an ambiguous
 * delivery must render byte-identical output: otherwise the same recipient can
 * receive two visibly different versions of one email, and the quarantine that
 * exists to prevent duplicates would be reasoning about bodies that no longer
 * match. It is also what makes the preview honest, since the preview and the
 * send agree.
 *
 * FNV-1a then a small xorshift, which is plenty for picking between three
 * greetings and has no security role whatsoever.
 */
export function seededPicker(seed: string): () => number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < seed.length; i += 1) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  let state = hash >>> 0 || 0x9e3779b9;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    return state / 0x100000000;
  };
}

function renderNodes(nodes: readonly Node[], pick: () => number): string {
  let out = "";
  for (const node of nodes) {
    if (typeof node === "string") {
      out += node;
      continue;
    }
    const chosen = node.options[Math.floor(pick() * node.options.length)] ?? node.options[0] ?? [];
    out += renderNodes(chosen, pick);
  }
  return out;
}

/**
 * Choose one variant.
 *
 * `seed` should identify the recipient and the step, so two people get
 * different wording and one person gets the same wording every time.
 */
export function expandSpintax(template: string, seed: string): string {
  if (!hasSpintax(template)) return template;
  const { nodes } = parse(template);
  return renderNodes(nodes, seededPicker(seed));
}

/** Spans that look like braces but are placeholders. */
const PLACEHOLDER_SPAN = /\{\{[\s\S]*?\}\}/g;

/**
 * Cheap check so a template with no spintax never touches the parser.
 *
 * The placeholders have to come out first. Testing the raw string for
 * `\{[^{}]*\|` looks equivalent and is not: in `{Hi {{first_name}}|Hello}` the
 * pipe is separated from the opening brace by the placeholder's own braces, so
 * the brace-free window never reaches it, the check returns false, and the
 * template ships to the recipient with its spin syntax intact. Removing
 * placeholder spans first leaves `{Hi |Hello}`, which matches.
 */
export function hasSpintax(template: string): boolean {
  return /\{[^{}]*\|/.test(template.replace(PLACEHOLDER_SPAN, ""));
}

function countNodes(nodes: readonly Node[]): number {
  let total = 1;
  for (const node of nodes) {
    if (typeof node === "string") continue;
    const branch = node.options.reduce((sum, option) => sum + countNodes(option), 0);
    total *= Math.max(1, branch);
    if (total > MAX_VARIANTS) return MAX_VARIANTS + 1;
  }
  return total;
}

function countGroups(nodes: readonly Node[]): number {
  let total = 0;
  for (const node of nodes) {
    if (typeof node === "string") continue;
    total += 1 + node.options.reduce((sum, option) => sum + countGroups(option), 0);
  }
  return total;
}

/** What the editor shows: how many distinct bodies, and anything wrong. */
export function analyzeSpintax(template: string): SpintaxAnalysis {
  const { nodes, issues } = parse(template);
  const raw = countNodes(nodes);
  return {
    variants: Math.min(raw, MAX_VARIANTS),
    clamped: raw > MAX_VARIANTS,
    groups: countGroups(nodes),
    issues,
  };
}

/** One line for the template editor. */
export function describeVariants(analysis: SpintaxAnalysis): string {
  if (analysis.groups === 0) {
    return "No variation: every recipient gets a byte-identical email.";
  }
  if (analysis.variants <= 1) {
    return "No variation yet: each group needs at least two options.";
  }
  const count = analysis.clamped
    ? `over ${MAX_VARIANTS.toLocaleString()}`
    : analysis.variants.toLocaleString();
  return `${count} distinct version${analysis.variants === 1 ? "" : "s"} of this email.`;
}
