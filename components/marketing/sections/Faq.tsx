"use client";

import styles from "../landing.module.css";
import { TRIAL_PERIOD_DAYS } from "@/lib/billing/plans";

const FAQ = [
  [
    "How do I start?",
    "Choose Get started, sign in with your Google account, and connect the Gmail you send from. Cadence is built for founders, focused sales teams, and agencies on Gmail or Google Workspace. Access is granted per workspace while we are in early access, so if yours is not enabled yet the sign-in page will say so and we will follow up.",
  ],
  [
    "Does Cadence guarantee replies or inbox placement?",
    "No. Results depend on your audience, offer, message quality, sender history, provider behavior, and consent practices. Cadence provides controls and visibility that help reduce preventable risk.",
  ],
  [
    "What Gmail access does Cadence need?",
    "Two scopes: permission to compose and send as you, and read access so replies and bounces can be matched back to the right campaign. Google shows both on the consent screen before anything is connected. Cadence sends through the Gmail API as your account, not through a relay, so replies land in your own thread. Access is revocable from your Google account at any time and the connection tokens are encrypted at rest.",
  ],
  [
    "How many emails should I send each day?",
    "There is no single safe number. Gmail limits are technical ceilings, not outreach recommendations. Cadence supports account-specific pacing, gradual increases, working-hour windows, and hard plan limits.",
  ],
  [
    "Are opens exact?",
    "No. Image blocking and privacy preloading can create missing or inflated open signals. Cadence labels opens accordingly and treats replies and intentional clicks as stronger evidence.",
  ],
  [
    "When am I charged?",
    `Not on signup, and not during the free days. Creating a workspace costs nothing and takes no card. When you start a paid plan, checkout runs on Stripe and takes your card there, then the first charge is raised ${TRIAL_PERIOD_DAYS} days later. Cancel inside those days and you are not billed at all. This site never has a card field of its own.`,
  ],
] as const;

export function Faq() {
  return (
    <>
      <section className={styles.faqSection}>
        <div className={styles.shell}>
          <div
            className={`${styles.sectionHeading} ${styles.sectionHeadingSplit}`}
            data-reveal
          >
            <span className={styles.eyebrow}>Straight answers</span>
            <h2>Know exactly what Cadence does and does not promise.</h2>
            <p>
              The answers below describe what ships today. Where something is
              still being built, it says so.
            </p>
          </div>
          <div className={styles.faq} data-reveal>
            {FAQ.map(([question, answer]) => (
              <details key={question}>
                <summary>{question}</summary>
                <p>{answer}</p>
              </details>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
