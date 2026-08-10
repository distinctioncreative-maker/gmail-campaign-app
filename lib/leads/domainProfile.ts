/**
 * What a domain's MX records say about whether an address there can be checked.
 *
 * **This is not catch-all detection, and it cannot be.** The backlog asked for
 * catch-all detection "by probing a known-bad address at the domain", and then
 * said in the next paragraph to skip SMTP probing because it gets sending IPs
 * blocklisted. Those are the same technique: the only way to learn that a domain
 * accepts every address is to open an SMTP conversation with its mail server and
 * offer it one that cannot exist. There is no DNS record for it. Two things make
 * that route unavailable regardless of the tradeoff: Google Cloud blocks
 * outbound port 25 from Cloud Run entirely, and the warning about blocklisting is
 * correct.
 *
 * So what ships is the part that can be known from a DNS lookup we already
 * perform, and the more valuable half of the original idea: **stop the verifier
 * overclaiming.** Today an address whose domain merely has an MX record comes
 * back "Verified", and for most business domains that word is wrong. Google
 * Workspace and Microsoft 365 accept mail at SMTP time and decide about the
 * mailbox afterwards, so "the domain has a mail server" is the entire content of
 * that verdict. An address at a forwarding service is stronger still: those
 * accept everything by design, so no amount of checking will ever confirm one.
 *
 * The distinction the import preview now draws is between "we looked and found
 * something concerning", "we looked and found nothing", and "this one cannot be
 * confirmed by anybody without sending to it".
 */

export type MailProvider =
  | "GOOGLE"
  | "MICROSOFT"
  | "FORWARDER"
  | "CONSUMER"
  | "SECURITY_GATEWAY"
  | "OTHER"
  | "NONE";

/**
 * Services whose entire purpose is to accept mail for any address at a domain
 * and pass it somewhere else. An address behind one of these is unconfirmable by
 * construction: the service says yes before anything knows whether the mailbox
 * exists.
 */
const FORWARDER_SUFFIXES = [
  "improvmx.com",
  "forwardemail.net",
  "mailgun.org",
  "mxroute.com",
  "migadu.com",
  "purelymail.com",
  "sendgrid.net",
  "mailhostbox.com",
  "privateemail.com",
];

const GOOGLE_SUFFIXES = ["google.com", "googlemail.com", "psmtp.com"];

const MICROSOFT_SUFFIXES = ["outlook.com", "protection.outlook.com", "office365.com"];

/**
 * Filtering front-ends. Worth naming separately from a plain unknown host: mail
 * to these passes a spam gateway before it reaches the mailbox, so a marginal
 * message is likelier to be dropped silently than bounced.
 */
const GATEWAY_SUFFIXES = [
  "pphosted.com",
  "mimecast.com",
  "barracudanetworks.com",
  "messagelabs.com",
  "trendmicro.com",
  "sophos.com",
  "fortimail.com",
];

/**
 * Mailbox providers for individuals. Not invalid, and not rare on a bought list,
 * but a personal address on a business outreach list is usually either the wrong
 * contact for the pitch or a person who never gave it out for this, and both
 * show up later as complaints rather than bounces.
 */
const CONSUMER_DOMAINS = new Set([
  "gmail.com",
  "googlemail.com",
  "outlook.com",
  "hotmail.com",
  "live.com",
  "msn.com",
  "yahoo.com",
  "ymail.com",
  "aol.com",
  "icloud.com",
  "me.com",
  "mac.com",
  "protonmail.com",
  "proton.me",
  "gmx.com",
  "mail.com",
  "zoho.com",
  "yandex.com",
]);

function matchesSuffix(host: string, suffixes: string[]): boolean {
  const clean = host.toLowerCase().replace(/\.$/, "");
  return suffixes.some((suffix) => clean === suffix || clean.endsWith(`.${suffix}`));
}

export function isConsumerDomain(domain: string): boolean {
  return CONSUMER_DOMAINS.has(domain.toLowerCase().replace(/\.$/, ""));
}

/**
 * Classify a domain from its mail exchangers.
 *
 * The consumer check comes first and is keyed on the domain rather than the MX,
 * because gmail.com's own MX records are Google's and would otherwise classify
 * as a Workspace domain: the same infrastructure, an entirely different kind of
 * recipient.
 */
export function mailProviderFor(domain: string, mxHosts: readonly string[]): MailProvider {
  if (isConsumerDomain(domain)) return "CONSUMER";
  const hosts = mxHosts.filter((host) => typeof host === "string" && host.trim() !== "");
  if (hosts.length === 0) return "NONE";
  // Forwarders first: a domain can point at a forwarder that delivers into
  // Workspace, and the forwarder is the part that decides whether mail is
  // accepted, so it is the part that matters here.
  if (hosts.some((host) => matchesSuffix(host, FORWARDER_SUFFIXES))) return "FORWARDER";
  if (hosts.some((host) => matchesSuffix(host, GATEWAY_SUFFIXES))) return "SECURITY_GATEWAY";
  if (hosts.some((host) => matchesSuffix(host, GOOGLE_SUFFIXES))) return "GOOGLE";
  if (hosts.some((host) => matchesSuffix(host, MICROSOFT_SUFFIXES))) return "MICROSOFT";
  return "OTHER";
}

/**
 * Whether this provider accepts mail for addresses that do not exist.
 *
 * True only where it is a documented property of the service rather than a
 * guess. A Workspace or 365 domain *may* be configured as a catch-all and
 * usually is not, and claiming otherwise would put a warning on most of the
 * business addresses on earth.
 */
export function acceptsEveryAddress(provider: MailProvider): boolean {
  return provider === "FORWARDER";
}

export function describeProvider(provider: MailProvider): string {
  switch (provider) {
    case "GOOGLE":
      return "Google Workspace";
    case "MICROSOFT":
      return "Microsoft 365";
    case "FORWARDER":
      return "a mail forwarding service";
    case "SECURITY_GATEWAY":
      return "a mail security gateway";
    case "CONSUMER":
      return "a personal mailbox provider";
    case "NONE":
      return "no mail server";
    default:
      return "its own mail server";
  }
}
