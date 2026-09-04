"use client";

import styles from "../landing.module.css";
import { Arrow, ContactLink, StartLink } from "../shared";
import { InboxProof } from "../InboxProof";

export function Hero() {
  return (
    <>
      <header className={styles.hero}>
        <div className={styles.heroGlow} aria-hidden />
        <div className={styles.shell}>
          <div className={styles.heroCopy}>
            <span className={styles.pill}>
              <span />
              Built for Gmail
            </span>
            {/* Three beats, and the middle one carries the accent because it
                is the one a deliverability-literate buyer is actually weighing.
                Note what it does not say: nothing here promises inbox
                placement, because no sender can. It promises the behaviour
                that earns it. */}
            {/* The volume claim is true and stays. A warmed inbox sends 150 a
                day, the per-campaign ceiling is 2000, and inbox rotation
                spreads a day's volume across several mailboxes, so thousands
                a month is what the starter plan does with one inbox and a
                large multiple of that with a pool.

                What changed is the unit. The old first beat named a raw send
                count with no timeframe, which reads as a blast boast, and
                this is the page a Google reviewer reads when deciding what an
                app requesting a restricted Gmail scope is for. A monthly
                figure says the same thing about capacity while implying the
                pacing that earns it. Both halves matter: understating the
                number would sell the product short, and stating it without a
                timeframe invites exactly the reading the acceptable-use
                policy is aimed at. */}
            {/* One beat per line, as blocks.
                These were three sentences separated by spaces under
                `text-wrap: balance`, so the browser balanced line LENGTHS
                across all three and broke wherever the arithmetic landed:
                "person." was orphaned onto the third line beside "Get
                replies.", which put the accent colour halfway through a line
                and split the middle beat across two. Three beats that are
                three blocks break at the beat at every width, and balance
                then does the job it is good at, inside each one. */}
            <h1>
              <span className={styles.heroBeat}>Thousands a month.</span>
              <span className={styles.heroBeat}>
                <em>Sound like one person.</em>
              </span>
              <span className={styles.heroBeat}>Get replies.</span>
            </h1>
            <p className={styles.heroLead}>
              Cadence paces every campaign from your own Gmail and checks your
              domain before a single email leaves. Replies land in your thread.
            </p>
            <div className={styles.heroCtas}>
              <StartLink className={styles.heroPrimary}>
                Get started <Arrow />
              </StartLink>
              <ContactLink className={styles.heroSecondary}>
                Talk to sales
              </ContactLink>
            </div>
            <p className={styles.heroNote}>
              Free to start. No card. Nothing sends until you review it.
            </p>
          </div>

          <InboxProof />
        </div>
      </header>
    </>
  );
}
