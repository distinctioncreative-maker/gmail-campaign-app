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

const UNSUB_PATTERNS = [
  /\bunsubscribe\b/i,
  /\bopt(?:\s|-)?out\b/i,
  /\bremove me\b/i,
  /\btake me off\b/i,
  /\bstop (?:emailing|contacting|messaging)\b/i,
  /\bdo not (?:email|contact)\b/i,
];

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

export function classifyInboundMessage(msg: InboundMessage): ReplyClass {
  // 1. Header-based automated-response detection (most reliable).
  const autoSubmitted = header(msg, "Auto-Submitted").toLowerCase();
  const autoreply = header(msg, "X-Autoreply") || header(msg, "X-Autorespond");
  const precedence = header(msg, "Precedence").toLowerCase();

  const bodyAndSubject = `${msg.subject}\n${msg.bodyText || msg.snippet}`;

  // Unsubscribe / not-interested take priority even if auto-ish, because a
  // human deliberately opted out and we must honor it.
  if (UNSUB_PATTERNS.some((re) => re.test(bodyAndSubject))) return "UNSUBSCRIBE";
  if (NOT_INTERESTED_PATTERNS.some((re) => re.test(bodyAndSubject))) return "NOT_INTERESTED";

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
