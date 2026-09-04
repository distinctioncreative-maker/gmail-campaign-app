"use client";

import styles from "../landing.module.css";
import { CONTACT_TARGET_ID, WaitField } from "../shared";

export function FinalCta() {
  return (
    <>
      <section className={styles.finalCta}>
        <div className={styles.shell}>
          <div
            className={`${styles.finalPanel} ${styles.contactAnchor}`}
            id={CONTACT_TARGET_ID}
            data-reveal
          >
            <span className={styles.eyebrow}>Talk to us</span>
            <h2>Give your next campaign a clearer path to conversation.</h2>
            <p>
              You can start on your own with Get started above. If you would
              rather talk through rollout, security review, or how this fits
              your team first, leave a work email and we will reply.
            </p>
            <WaitField
              source="contact"
              note="No mailing list. We only use your email to answer you."
            />
          </div>
        </div>
      </section>
    </>
  );
}
