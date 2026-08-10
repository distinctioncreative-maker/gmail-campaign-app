import "server-only";
import { enforceRateLimit } from "@/lib/util/rateLimit";
import type { AuthContext } from "@/lib/auth/requireUser";

/**
 * Per-user limits on the expensive authenticated routes.
 *
 * Rate limiting previously covered five routes out of sixty-seven, and all
 * five were unauthenticated: sign-in, the two tracking endpoints, unsubscribe,
 * and the waitlist. Every signed-in route was unlimited, including a lead
 * import that accepts five megabytes of CSV and performs a DNS lookup and a
 * Firestore write per row. A signed-in user, or a stolen session, could drive
 * unbounded cost.
 *
 * Keyed on user rather than IP, because these routes already require a
 * session: the identity is known and is the thing worth limiting. IP-keyed
 * limits would also punish an entire office behind one NAT.
 */
export class RateLimitedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RateLimitedError";
  }
}

export interface UserRateLimit {
  bucket: string;
  limit: number;
  windowMs: number;
  /** Shown to the person who hit it, so it says what to do next. */
  message: string;
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

/**
 * Ceilings, not throttles. Every number here is far above what the interface
 * can produce through ordinary use, so a customer working quickly never sees
 * one: the point is to bound cost and abuse, not to pace legitimate work.
 */
export const RATE_LIMITS = {
  /** Parsing is CPU plus a DNS lookup per distinct domain. */
  leadParse: {
    bucket: "lead-parse",
    limit: 30,
    windowMs: 10 * MINUTE,
    message: "Too many import previews in a short time. Wait a few minutes and try again.",
  },
  /** Writing is a Firestore write per lead, batched. */
  leadImport: {
    bucket: "lead-import",
    limit: 20,
    windowMs: 10 * MINUTE,
    message: "Too many imports in a short time. Wait a few minutes and try again.",
  },
  /** Bulk contact edits fan out across the directory. */
  contactBulk: {
    bucket: "contact-bulk",
    limit: 60,
    windowMs: 10 * MINUTE,
    message: "Too many bulk changes in a short time. Wait a few minutes and try again.",
  },
  /** A launch schedules a Cloud Task per recipient. */
  campaignLaunch: {
    bucket: "campaign-launch",
    limit: 20,
    windowMs: HOUR,
    message: "Too many campaign launches in a short time. Wait a while and try again.",
  },
  /** The palette reads four collections per query. Debouncing on the client
   * keeps ordinary typing far below this; the ceiling exists for a script, and
   * has to stay high enough that fast typing in a long session never trips it
   * and makes search look broken. */
  search: {
    bucket: "palette-search",
    limit: 300,
    windowMs: 10 * MINUTE,
    message: "Search is busy. Give it a moment and try again.",
  },
  /** Each export walks every contact, campaign, and recipient the user owns.
   * Generous because a customer taking their data out may reasonably pull all
   * six datasets twice while working out which one they wanted. */
  dataExport: {
    bucket: "data-export",
    limit: 30,
    windowMs: HOUR,
    message: "Too many exports in a short time. Wait a few minutes and try again.",
  },
  /** Every check is a live DNS lookup. Generous, because someone waiting on
   * propagation will legitimately click "check again" a lot. */
  trackingDomain: {
    bucket: "tracking-domain",
    limit: 60,
    windowMs: HOUR,
    message: "That is a lot of DNS checks. Give propagation a few minutes and try again.",
  },
  /** Support requests are cheap to store and expensive to bury: a flood of
   * them hides the real one. Set high enough that nobody with a genuine
   * problem meets it, since the person hitting this limit is by definition
   * someone already having a bad time. */
  supportRequest: {
    bucket: "support-request",
    limit: 10,
    windowMs: HOUR,
    message:
      "That is a lot of support requests at once. Reply to the one you already sent and we will pick it up there.",
  },
  /** Each search is a paid call to a data vendor. The credit ceiling in
   * lib/sourcing/quota.ts bounds the money; this bounds the request rate, so a
   * loop cannot burn a whole month's credits in a few seconds and leave the
   * workspace unable to search for the rest of it. */
  leadSourcing: {
    bucket: "lead-sourcing",
    limit: 60,
    windowMs: HOUR,
    message:
      "That is a lot of searches at once. Each one costs a sourcing credit, so give it a minute and refine the filters rather than paging through.",
  },
  /** A test delivery makes our server post to an address the customer chose.
   * This is the one limit here that bounds an *outbound* request rather than our
   * own cost, so it stays modest: wiring up a receiver takes a handful of tries
   * and nothing legitimate needs more. */
  webhookTest: {
    bucket: "webhook-test",
    limit: 30,
    windowMs: HOUR,
    message:
      "That is a lot of test deliveries. Check what came back in recent deliveries, then try again in a few minutes.",
  },
  /** Each scan walks Gmail threads for every active campaign. */
  replyScan: {
    bucket: "reply-scan",
    limit: 20,
    windowMs: HOUR,
    message: "Reply scanning runs automatically in the background. Try again in a few minutes.",
  },
} as const satisfies Record<string, UserRateLimit>;

/**
 * Consume one unit, or throw. `handleApiErrors` maps the throw to a 429.
 *
 * Fails open on a limiter error, matching `enforceRateLimit`: a glitch in the
 * limiter must never block a customer from importing their own leads.
 */
export async function enforceUserRateLimit(
  ctx: Pick<AuthContext, "userId">,
  limit: UserRateLimit
): Promise<void> {
  const allowed = await enforceRateLimit(limit.bucket, ctx.userId, limit.limit, limit.windowMs);
  if (!allowed) throw new RateLimitedError(limit.message);
}
