"use client";

import styles from "../landing.module.css";
import { Arrow } from "../shared";

const WORKFLOW = [
  {
    number: "01",
    title: "Start with a list that will not burn you",
    copy: "Bring a CSV, a paste, or a saved list. Duplicates and opt-outs are stripped before anything touches your domain.",
  },
  {
    number: "02",
    title: "Write once, send something different to everyone",
    copy: "Describe the offer and AI drafts it in your voice, learned from your own website. One more press writes the alternate phrasings, so Cadence builds hundreds of combinations from the one message.",
  },
  {
    number: "03",
    title: "Send at a pace inboxes actually trust",
    copy: "Set your hours, your daily cap, your spacing. Provider limits are ceilings, not targets, so Cadence drips at a pace your domain can carry.",
  },
  {
    number: "04",
    title: "See exactly what is producing",
    copy: "Sends, bounces, clicks and replies in one view, so you know which campaign is producing and which is wasting leads.",
  },
  {
    number: "05",
    title: "Turn replies into booked revenue",
    copy: "Replies are sorted by intent so the hot ones get worked first, in the real Gmail thread. Follow-ups stop the moment someone answers.",
  },
] as const;

export function Workflow() {
  return (
    <>
      <section className={styles.workflowSection} id="workflow">
        <div className={styles.shell}>
          <div
            className={`${styles.sectionHeading} ${styles.sectionHeadingSplit}`}
            data-reveal
          >
            <span className={styles.eyebrow}>How it works</span>
            <h2>From cold list to booked call.</h2>
            <p>
              Five steps. Your team stays in control of every message that
              goes out.
            </p>
          </div>
          <div className={styles.workflow} data-reveal>
            <div className={styles.workflowSteps} data-stagger>
              {WORKFLOW.map((step) => (
                <article key={step.number}>
                  <span>{step.number}</span>
                  <div>
                    <h3>{step.title}</h3>
                    <p>{step.copy}</p>
                  </div>
                </article>
              ))}
            </div>
          </div>

          {/* The four interactive demos that lived here are gone, and the
              reasoning is worth keeping. They were by far the most complicated
              thing on the page, and they asked a visitor who has decided
              nothing yet to operate a product they have not bought. A landing
              page sells the feeling; the place to drive the product is /demo,
              which runs the real app components against sample data and is
              already in the nav as "See it live". Nothing was lost, it moved
              to where someone who wants it will actually use it, and the
              landing page shed four heavy client components. */}
          <p className={styles.workflowFoot} data-reveal>
            <a href="/demo">
              Try it yourself with sample data <Arrow />
            </a>
          </p>
        </div>
      </section>
    </>
  );
}
