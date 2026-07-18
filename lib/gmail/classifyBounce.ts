/**
 * Detect and classify delivery-failure (bounce) messages. Gmail-based
 * bounce detection is less comprehensive than a dedicated ESP — documented
 * in CAMPAIGN_SAFETY.md. Pure and unit-tested.
 */

export type BounceType = "HARD" | "SOFT" | "UNKNOWN";

export interface BounceMessage {
  from: string;
  subject: string;
  bodyText: string;
}

const DAEMON_FROM = /(mailer-daemon|postmaster|mail delivery (?:subsystem|system))/i;
const FAILURE_SUBJECT =
  /(delivery status notification|undeliverable|mail delivery failed|returned mail|failure notice|delivery has failed)/i;

export function isBounceMessage(msg: BounceMessage): boolean {
  return DAEMON_FROM.test(msg.from) || FAILURE_SUBJECT.test(msg.subject);
}

/** Extract the failed recipient address from a DSN body when present. */
export function parseFailedRecipient(bodyText: string): string | null {
  const patterns = [
    /(?:final|original)-recipient:\s*(?:rfc822;)?\s*([^\s<>]+@[^\s<>]+)/i,
    /to:\s*<?([^\s<>]+@[^\s<>]+)>?/i,
    /(?:failed|undelivered).*?<?([^\s<>]+@[^\s<>]+)>?/i,
  ];
  for (const re of patterns) {
    const m = bodyText.match(re);
    if (m) return m[1].toLowerCase().replace(/[.,;]$/, "");
  }
  return null;
}

export function classifyBounce(msg: BounceMessage): BounceType {
  const text = `${msg.subject}\n${msg.bodyText}`;

  // SMTP status code: 5.x.x = permanent (hard), 4.x.x = temporary (soft).
  const enhanced = text.match(/\b([245])\.\d{1,3}\.\d{1,3}\b/);
  if (enhanced) {
    if (enhanced[1] === "5") return "HARD";
    if (enhanced[1] === "4") return "SOFT";
  }
  const basic = text.match(/\b(4\d{2}|5\d{2})\b(?:\s|-)/);
  if (basic) return basic[1].startsWith("5") ? "HARD" : "SOFT";

  if (/(user unknown|no such user|address (?:not found|rejected)|does not exist|mailbox unavailable|recipient rejected)/i.test(text)) {
    return "HARD";
  }
  if (/(mailbox full|quota exceeded|temporarily|try again|greylist|deferred|rate limit)/i.test(text)) {
    return "SOFT";
  }
  return "UNKNOWN";
}
