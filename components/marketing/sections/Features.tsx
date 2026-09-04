"use client";

import styles from "../landing.module.css";

const FEATURES = [
  {
    eyebrow: "Write",
    title: "It learns how you sound from your own site",
    copy: "Paste your address once. Cadence reads what you sell, who you sell to, and how you say it, then drafts in that voice. You approve every one.",
  },
  {
    eyebrow: "Research",
    title: "Openers that could only be for them",
    copy: "Before a campaign goes out, Cadence reads each prospect's own website, so the first line references their actual business instead of hoping trade is good.",
  },
  {
    eyebrow: "Vary",
    title: "Hundreds of versions of one email",
    copy: "One press writes the alternate phrasings, so no two recipients get a byte-identical message. A retry never sends different wording to the same person.",
  },
  {
    eyebrow: "Rotate",
    title: "More inboxes, not more risk",
    copy: "Rotates across your connected Gmail accounts, always sending from the one that has done least today. A new inbox ramps over four weeks.",
  },
  {
    eyebrow: "Brake",
    title: "It stops itself before you notice",
    copy: "A campaign that starts bouncing pauses itself, per inbox, so one bad list cannot spend the reputation of the others.",
  },
  {
    eyebrow: "Connect",
    title: "It talks to the rest of your stack",
    copy: "Scoped API keys and signed webhooks, so replies, bounces and closed deals reach your CRM on their own. Same signature scheme as Stripe.",
  },
  {
    eyebrow: "Measure",
    title: "Know which campaign pays",
    copy: "Compare campaigns on the metrics that predict revenue. Replies lead, because opens are the least honest number in email.",
  },
  {
    eyebrow: "Protect",
    title: "Compliance you cannot forget",
    copy: "Opt-outs are checked before every send and honored in one click. Follow-ups stop themselves.",
  },
  {
    eyebrow: "Scale",
    title: "Built for a team, not a seat",
    copy: "Roles, per-rep leaderboards, shared brand voice. Managers see everything; each rep's leads stay their own.",
  },
] as const;

export function Features() {
  return (
    <>
      {/* Variation had shipped for weeks and this site never mentioned it, while
          step 02 above claimed its benefit without naming the mechanism or
          showing any proof. The demo below runs the real parser. */}
  

      <section className={styles.featuresSection} id="features">
        <div className={styles.shell}>
          <div className={styles.sectionHeading} data-reveal>
            <span className={styles.eyebrow}>What you get</span>
            <h2>Built to produce pipeline, not busywork.</h2>
            <p>
              Everything a revenue team needs to run outreach at volume, and
              nothing that gets in the way.
            </p>
          </div>
          <div className={styles.featureGrid} data-reveal>
            {FEATURES.map((feature) => (
              <article key={feature.title}>
                <span>{feature.eyebrow}</span>
                <h3>{feature.title}</h3>
                <p>{feature.copy}</p>
              </article>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
