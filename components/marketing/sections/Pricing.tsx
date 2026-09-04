"use client";

import styles from "../landing.module.css";
import { Arrow, Check, ContactLink, StartLink } from "../shared";
import { TRIAL_PERIOD_DAYS } from "@/lib/billing/plans";
import {
  PUBLIC_PRICING,
  publicPriceLabel,
  publicPriceQualifier,
} from "@/lib/billing/publicPricing";

export function Pricing() {
  return (
    <>
      <section className={styles.pricingSection} id="pricing">
        <div className={styles.shell}>
          <div
            className={`${styles.sectionHeading} ${styles.sectionHeadingCentered}`}
            data-reveal
          >
            <span className={styles.eyebrow}>Pricing</span>
            <h2>Priced for real use, not for a demo.</h2>
            <p>
              Every paid plan starts with {TRIAL_PERIOD_DAYS} days free. Card details are
              never taken on this page: checkout runs on Stripe, nothing is
              charged until the free days are up, and you can cancel inside
              them without paying anything.
            </p>
          </div>
          <div className={styles.pricingGrid} data-reveal>
            {PUBLIC_PRICING.map((tier) => (
              <article
                className={tier.featured ? styles.featuredPrice : ""}
                key={tier.id}
              >
                {tier.featured && (
                  <span className={styles.recommended}>Recommended</span>
                )}
                <span className={styles.planEyebrow}>{tier.eyebrow}</span>
                <h3>{tier.name}</h3>
                <div className={styles.priceLine}>
                  <strong>{publicPriceLabel(tier.id)}</strong>
                  <span>{publicPriceQualifier(tier.id)}</span>
                </div>
                {/* Named on the tier as well as in the section intro. The
                    intro is read once; this is next to the number someone is
                    actually weighing, and it is the thing that makes the
                    number easy to say yes to. */}
                {tier.id !== "ENTERPRISE" && (
                  <p className={styles.trialNote}>
                    {TRIAL_PERIOD_DAYS} days free, then billed monthly. Cancel any time.
                  </p>
                )}
                <p>{tier.description}</p>
                <ul>
                  {tier.features.map((feature) => (
                    <li key={feature}>
                      <Check size={16} />
                      {feature}
                    </li>
                  ))}
                </ul>
                {/* Enterprise is a conversation; the other two are a
                    sign-in. Neither takes card details on this page. */}
                {tier.id === "ENTERPRISE" ? (
                  <ContactLink>
                    {tier.cta} <Arrow />
                  </ContactLink>
                ) : (
                  <StartLink>
                    {tier.cta} <Arrow />
                  </StartLink>
                )}
              </article>
            ))}
          </div>
          <p className={styles.pricingNote}>
            Daily limits are product ceilings, not a promise that every
            inbox should use the maximum. Recommended pacing depends on
            provider rules, sender history, audience quality, and campaign
            behavior. Annual billing and overages are not active yet.
          </p>
        </div>
      </section>
    </>
  );
}
