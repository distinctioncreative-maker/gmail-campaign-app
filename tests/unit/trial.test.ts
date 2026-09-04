import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { TRIAL_PERIOD_DAYS, trialDaysFor } from "@/lib/billing/plans";

describe("who gets the free days", () => {
  it("gives them on a workspace's first subscription", () => {
    expect(trialDaysFor(null)).toBe(TRIAL_PERIOD_DAYS);
    expect(trialDaysFor(undefined)).toBe(TRIAL_PERIOD_DAYS);
    expect(trialDaysFor("")).toBe(TRIAL_PERIOD_DAYS);
  });

  it("never gives them twice", () => {
    /**
     * The assertion that costs money if it fails. Stripe honours
     * trial_period_days on whatever session it is handed, with no memory of
     * whether this customer already had one, so an unconditional trial hands a
     * free week to anyone willing to cancel and resubscribe, every time,
     * forever.
     */
    expect(trialDaysFor("sub_123")).toBe(0);
  });

  it("is a length worth having", () => {
    // Guards the guard: a zero here would pass every test above while quietly
    // disabling the feature.
    expect(TRIAL_PERIOD_DAYS).toBeGreaterThan(0);
  });
});

describe("how the trial reaches Stripe", () => {
  const stripe = readFileSync("lib/billing/stripe.ts", "utf8");
  const checkout = readFileSync("app/api/billing/checkout/route.ts", "utf8");

  it("sets the trial on the subscription rather than the session", () => {
    // A checkout session has no trial of its own; the field belongs to the
    // subscription the session creates.
    expect(stripe).toContain("subscription_data[trial_period_days]");
  });

  it("cancels rather than bills when the trial ends with no usable card", () => {
    /**
     * Checkout collects a card up front, so this covers the card later failing
     * or being removed. Cancelling leaves someone unsubscribed, which they can
     * fix; the alternative leaves a subscription retrying against a card its
     * owner already withdrew.
     */
    expect(stripe).toContain(
      "subscription_data[trial_settings][end_behavior][missing_payment_method]"
    );
    expect(stripe).toContain('"cancel"');
  });

  it("omits the field entirely when there is no trial", () => {
    // Sending trial_period_days=0 is not the same as sending nothing, and the
    // guard here is what keeps a returning customer's checkout clean.
    expect(stripe).toContain("if (input.trialDays && input.trialDays > 0)");
  });

  it("decides eligibility from the workspace's own subscription history", () => {
    expect(checkout).toContain("trialDaysFor(settings.billing.stripeSubscriptionId)");
  });
});

describe("saying so on the pricing page", () => {
  const landing = [
    "components/marketing/Landing.tsx",
    ...readdirSync("components/marketing/sections").map(
      (f) => `components/marketing/sections/${f}`
    ),
  ]
    .map((p) => readFileSync(p, "utf8"))
    .join("\n");
  const css = readFileSync("components/marketing/landing.module.css", "utf8");
  const pricing = readFileSync("lib/billing/publicPricing.ts", "utf8");

  it("names the trial next to the price, not only in the intro", () => {
    // The intro is read once. The number is what someone is actually weighing.
    expect(landing).toContain("styles.trialNote");
    expect(landing).toContain("TRIAL_PERIOD_DAYS");
  });

  it("reads the length from the same constant the billing code uses", () => {
    /**
     * A hardcoded "7 days free" in the copy is a promise that silently stops
     * matching the product the moment the constant changes, and the page is the
     * half nobody remembers to update.
     */
    expect(landing).not.toMatch(/7 days free/i);
  });

  it("no longer claims payment terms are agreed before any charge", () => {
    // True under the old high-touch early-access model, and false now that
    // checkout is self-serve and bills automatically when the trial ends.
    expect(landing).not.toContain("payment terms with you before any");
  });

  it("keeps the trial line clear of the description block's min-height", () => {
    /**
     * `.pricingGrid article > p` sets a 72px min-height to keep the three plan
     * cards aligned. A bare class loses to that selector and the sentence
     * renders inside a tall empty box, which reads as a layout bug.
     */
    expect(css).toContain("article > p.trialNote");
    const rule = css.slice(css.indexOf("article > p.trialNote"));
    expect(rule.slice(0, rule.indexOf("}"))).toContain("min-height: 0");
  });

  it("tells people what the button starts", () => {
    expect(pricing).toContain('cta: "Start free trial"');
  });
});
