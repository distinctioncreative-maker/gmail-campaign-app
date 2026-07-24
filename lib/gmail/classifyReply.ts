/**
 * Classify an inbound message in a campaign thread. Pure so it is fully
 * unit-testable. Never relies on subject text alone (spec §16): headers
 * are inspected first, body keywords only as a secondary signal.
 */

export type ReplyClass =
  | "HUMAN_REPLY"
  | "NOT_INTERESTED"
  | "UNSUBSCRIBE"
  | "OUT_OF_OFFICE"
  | "AUTO_RESPONSE"
  | "AMBIGUOUS";

export interface InboundMessage {
  headers: Record<string, string>;
  subject: string;
  snippet: string;
  bodyText: string;
}

function header(msg: InboundMessage, name: string): string {
  const key = Object.keys(msg.headers).find((k) => k.toLowerCase() === name.toLowerCase());
  return key ? msg.headers[key] : "";
}

/**
 * Cut quoted history out of a reply so classification only sees what the
 * person actually typed. Without this, a campaign template containing an
 * opt-out line ("reply 'unsubscribe' to stop") makes EVERY reply look like
 * an unsubscribe, because Gmail includes the quoted original below the
 * fresh text.
 */
export function stripQuotedText(body: string): string {
  const lines = body.split(/\r?\n/);
  const fresh: string[] = [];
  for (const line of lines) {
    const l = line.trim();
    // Quote-block openers: everything from here down is history.
    if (
      /^On .{0,200}wrote:\s*$/i.test(l) ||
      /^-{2,}\s*Original Message\s*-{2,}/i.test(l) ||
      /^-{2,}\s*Forwarded message\s*-{2,}/i.test(l) ||
      /^_{10,}\s*$/.test(l) ||
      /^From:\s.+$/i.test(l)
    ) {
      break;
    }
    if (l.startsWith(">")) continue; // inline-quoted line
    fresh.push(line);
  }
  return fresh.join("\n").trim();
}

/** Explicit, directed opt-out requests — honored at any message length. */
const UNSUB_STRONG_PATTERNS = [
  /(?:^|\n)\s*(?:please\s+)?unsubscribe(?:\s+me)?\s*[.!]*\s*(?:$|\n)/i,
  /\b(?:please\s+)?remove me from\b/i,
  /\btake me off\b/i,
  /\bstop (?:emailing|contacting|messaging)\s+me\b/i,
  /\bdo not (?:email|contact)\s+me\b/i,
  /\bopt me out\b/i,
  /\bi (?:want|would like|wish) to (?:unsubscribe|opt[ -]?out)\b/i,
];

/** Weaker mentions — only count when the whole fresh reply is a short
 * opt-out-shaped message, never inside a longer conversation. */
const UNSUB_WEAK_PATTERNS = [/\bunsubscribe\b/i, /\bopt(?:\s|-)?out\b/i];
const UNSUB_WEAK_MAX_LENGTH = 160;

const NOT_INTERESTED_PATTERNS = [
  /\bnot interested\b/i,
  /\bno thank(?:s| you)\b/i,
  /\bnot at this time\b/i,
  /\bwe(?:'re| are) all set\b/i,
  /\bplease stop\b/i,
];

const OOO_SUBJECT_PATTERNS = [
  /out of (?:the )?office/i,
  /automatic reply/i,
  /auto(?:matic)?[-\s]?reply/i,
  /on vacation/i,
  /away from (?:my|the) (?:desk|office)/i,
  /\bOOO\b/,
];

/** Positive buying signals — a reply that reads like real interest, so the
 * inbox can float it to the top. Applied to the fresh (unquoted) text only. */
const POSITIVE_PATTERNS = [
  /\binterested\b/i,
  /\b(?:sounds?|looks?) (?:good|great)\b/i,
  /\btell me more\b/i,
  /\bmore (?:info|information|details)\b/i,
  /\bhow much\b/i,
  /\bwhat (?:are|'?s) (?:the |your )?(?:rates?|terms?|cost|pricing|next steps?)\b/i,
  /\blet'?s (?:talk|chat|connect|discuss)\b/i,
  /\b(?:give me a |please )?call me\b/i,
  /\b(?:can we|could we|let'?s) (?:schedule|set up|book|hop on)\b/i,
  /\b(?:i'?d|i would) (?:like|love) to\b/i,
  /\bplease send\b/i,
  /\bwhen (?:can|are) you\b/i,
  /\byes[,! ]/i,
];

/** True when the fresh reply text carries a positive/interested signal. */
export function detectPositiveIntent(freshText: string): boolean {
  return POSITIVE_PATTERNS.some((re) => re.test(freshText));
}

export function classifyInboundMessage(msg: InboundMessage): ReplyClass {
  // 1. Header-based automated-response detection (most reliable).
  const autoSubmitted = header(msg, "Auto-Submitted").toLowerCase();
  const autoreply = header(msg, "X-Autoreply") || header(msg, "X-Autorespond");
  const precedence = header(msg, "Precedence").toLowerCase();

  // Classify only what the person actually typed — never the quoted
  // original email underneath their reply.
  const fresh = stripQuotedText(msg.bodyText || msg.snippet);
  const bodyAndSubject = `${msg.subject}\n${msg.bodyText || msg.snippet}`;

  // Unsubscribe requires explicit intent: a directed request at any length,
  // or a short message that is essentially just "unsubscribe". A question
  // that merely mentions the word is a human reply, not an opt-out.
  if (UNSUB_STRONG_PATTERNS.some((re) => re.test(fresh))) return "UNSUBSCRIBE";
  if (
    fresh.length > 0 &&
    fresh.length <= UNSUB_WEAK_MAX_LENGTH &&
    UNSUB_WEAK_PATTERNS.some((re) => re.test(fresh))
  ) {
    return "UNSUBSCRIBE";
  }
  if (NOT_INTERESTED_PATTERNS.some((re) => re.test(fresh))) return "NOT_INTERESTED";

  const looksAutomated =
    (autoSubmitted !== "" && autoSubmitted !== "no") ||
    autoreply !== "" ||
    precedence === "auto_reply" ||
    precedence === "bulk";

  if (OOO_SUBJECT_PATTERNS.some((re) => re.test(msg.subject))) return "OUT_OF_OFFICE";
  if (looksAutomated) {
    // Distinguish an OOO auto-reply from a generic bot acknowledgment.
    if (/out of office|vacation|away|返信|返信できません/i.test(bodyAndSubject)) {
      return "OUT_OF_OFFICE";
    }
    return "AUTO_RESPONSE";
  }

  // 2. A genuine human reply (has body content, not automated).
  if ((msg.bodyText || msg.snippet).trim().length > 0) return "HUMAN_REPLY";

  return "AMBIGUOUS";
}

/** Try to extract a return date from an out-of-office message body. */
export function parseReturnDate(bodyText: string): number | null {
  const match = bodyText.match(
    /back (?:on|after)\s+([A-Z][a-z]+ \d{1,2}(?:,? \d{4})?|\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)/
  );
  if (!match) return null;
  const t = Date.parse(match[1]);
  return Number.isFinite(t) ? t : null;
}
