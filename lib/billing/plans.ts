/**
 * Plan catalog. Pure and framework-free so it is easy to test and share
 * between the pricing UI, the capability map, and the Stripe layer.
 *
 * Plans map to the three public tiers plus the free Solo funnel. Each plan
 * carries the limits it unlocks; the Stripe price id comes from env so the
 * same code works across test and live modes.
 */
export type PlanId = "FREE" | "STARTER" | "TEAM" | "ENTERPRISE";

export interface PlanDef {
  id: PlanId;
  name: string;
  /** Indicative monthly price per seat in USD; null = custom (contact us). */
  priceMonthly: number | null;
  /** Seats included; 0 = per-seat / unlimited-by-arrangement. */
  seatsIncluded: number;
  /** Minimum quantity for a paid subscription to this plan. */
  minimumSeats: number;
  /** App-enforced safe daily send ceiling for this plan. */
  maxDailySends: number;
  /** Whether the plan unlocks shared team features. */
  teams: boolean;
  /** Which env var holds this plan's Stripe price id (null for FREE / custom). */
  stripePriceEnv: string | null;
}

export const PLANS: Record<PlanId, PlanDef> = {
  FREE: { id: "FREE", name: "Solo", priceMonthly: 0, seatsIncluded: 1, minimumSeats: 1, maxDailySends: 40, teams: false, stripePriceEnv: null },
  STARTER: { id: "STARTER", name: "Starter", priceMonthly: 29, seatsIncluded: 1, minimumSeats: 1, maxDailySends: 150, teams: false, stripePriceEnv: "STRIPE_PRICE_STARTER" },
  TEAM: { id: "TEAM", name: "Team", priceMonthly: 24, seatsIncluded: 0, minimumSeats: 2, maxDailySends: 400, teams: true, stripePriceEnv: "STRIPE_PRICE_TEAM" },
  ENTERPRISE: { id: "ENTERPRISE", name: "Enterprise", priceMonthly: null, seatsIncluded: 0, minimumSeats: 1, maxDailySends: 2000, teams: true, stripePriceEnv: null },
};

/**
 * Free days on a first paid subscription.
 *
 * The application already understood a trialing subscription everywhere it
 * mattered: the webhook mapped the status, the plan resolver treated it as
 * entitled, and checkout refused to start a second subscription during one. The
 * one thing missing was anything that ever began a trial, so `trialing` was a
 * state the code could describe and never reach.
 */
export const TRIAL_PERIOD_DAYS = 7;

/**
 * Whether this workspace should get the free days.
 *
 * Offered once, on the first subscription this workspace has ever had. Stripe
 * grants `trial_period_days` on whatever session it is given, so without this
 * check a customer who subscribes, cancels, and returns collects another free
 * week every time, indefinitely.
 */
export function trialDaysFor(existingSubscriptionId: string | null | undefined): number {
  return existingSubscriptionId ? 0 : TRIAL_PERIOD_DAYS;
}

export const PLAN_IDS = Object.keys(PLANS) as PlanId[];

export function isPlanId(v: unknown): v is PlanId {
  return typeof v === "string" && v in PLANS;
}

/** Plan a tenant sits on before/without a subscription. Solo accounts are
 * free; workspaces default to TEAM so existing internal orgs keep full
 * capabilities until (and unless) billing assigns a different plan. */
export function defaultPlanFor(tenantType: "WORKSPACE" | "CONSUMER"): PlanId {
  return tenantType === "CONSUMER" ? "FREE" : "TEAM";
}

/** Plans a customer can self-serve checkout into (FREE and ENTERPRISE are not
 * Stripe-checkout plans). */
export function checkoutablePlans(): PlanDef[] {
  return [PLANS.STARTER, PLANS.TEAM];
}

/**
 * Return the paid seat ceiling that must be enforced by membership writes.
 *
 * Legacy workspaces have TEAM capabilities but no Stripe subscription or
 * purchased quantity; returning null preserves their grandfathered access.
 * Enterprise arrangements can opt into the same enforcement by storing a
 * positive seat quantity with a subscription.
 */
export function purchasedSeatLimit(billing: {
  plan: PlanId;
  status: string;
  stripeSubscriptionId: string | null;
  seats: number;
}): number | null {
  if (
    !PLANS[billing.plan].teams ||
    !billing.stripeSubscriptionId ||
    !["trialing", "active", "past_due", "canceled"].includes(billing.status) ||
    !Number.isInteger(billing.seats) ||
    billing.seats < 1
  ) {
    return null;
  }
  return billing.seats;
}
