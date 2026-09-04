"use client";

import styles from "../landing.module.css";
import { Arrow, Check, ContactLink } from "../shared";

export function Trust() {
  return (
    <>
      <section className={styles.trustSection} id="trust">
        <div className={styles.shell}>
          <div className={styles.trustLayout} data-reveal>
            <div className={styles.trustCopy}>
              <span className={styles.eyebrow}>
                Trust is part of the workflow
              </span>
              <h2>Scale the process without hiding the risk.</h2>
              <p>
                No platform can guarantee inbox placement or replies.
                Cadence gives your team practical controls for pacing,
                consent, access, duplicate-send prevention, and campaign
                review so avoidable risk is harder to ignore.
              </p>
              <ContactLink>
                Talk to sales <Arrow />
              </ContactLink>
            </div>
            <div className={styles.trustGrid} data-stagger>
              {[
                [
                  "Scoped workspace access",
                  "Server-side authorization keeps user and organization paths explicit.",
                ],
                [
                  "Encrypted Gmail credentials",
                  "Connection tokens are encrypted at rest and access can be revoked.",
                ],
                [
                  "Duplicate-send defenses",
                  "Idempotency and ambiguous-delivery quarantine favor safety over blind retries.",
                ],
                [
                  "Suppression enforcement",
                  "Imports, launches, and final delivery checks respect opt-outs and do-not-email records.",
                ],
              ].map(([title, copy]) => (
                <article key={title}>
                  <span>
                    <Check size={16} />
                  </span>
                  <h3>{title}</h3>
                  <p>{copy}</p>
                </article>
              ))}
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
