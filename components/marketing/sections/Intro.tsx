"use client";

import styles from "../landing.module.css";
import { FeatureGlyph } from "../shared";

export function Intro() {
  return (
    <>
      {/* Four columns, six to eight words each. The scannable index of the
          product for a visitor who reads nothing else, taken directly from
          the reference designs. The detailed feature section further down is
          where anyone still interested goes. */}
      <section className={styles.introSection}>
        <div className={styles.shell}>
          <div className={styles.featureRow} data-reveal data-stagger>
            {[
              ["write", "Written for each lead", "AI drafts in your voice. You approve every one."],
              ["pace", "Paced across the day", "Spread at a human rhythm, under a hard cap."],
              ["verify", "Checked before launch", "SPF, DKIM and DMARC verified up front."],
              ["reply", "Replies come to you", "In your own Gmail thread, sorted by intent."],
            ].map(([icon, title, copy]) => (
              <article key={title}>
                <span className={styles.featureRowIcon} aria-hidden>
                  <FeatureGlyph kind={icon as "write" | "pace" | "verify" | "reply"} />
                </span>
                <h3>{title}</h3>
                <p>{copy}</p>
              </article>
            ))}
          </div>

          {/* Second beat of the same section rather than a section of its own:
              the four-column row above is the index, this is the argument. */}
          <div className={styles.sectionHeading} data-reveal style={{ marginTop: 96 }}>
            <span className={styles.eyebrow}>
              Why teams switch
            </span>
            <h2>Turn more of your list into real conversations.</h2>
            <p>Most outreach fails for three reasons. Cadence removes all three.</p>
          </div>
          {/* Each of these ran 23 to 26 words, which is three or four
              sentences per card and the main reason the page felt like
              homework. Cut to roughly half by removing the hedge clause in
              front of each claim, not the claim itself. */}
          <div className={styles.outcomeGrid} data-reveal data-stagger>
            {[
              /* These name the failure. The four columns above already name
                 the remedy, and until now these repeated it: "You approve every
                 one." appeared word for word in both, one screen apart, and all
                 three of these restated a card from that row. A section that
                 says one thing twice reads as padding however well each half is
                 written. The heading above promises three reasons outreach
                 fails, so this is the three reasons. */
              [
                "It never reached them",
                "A cold domain sending a burst of identical mail gets filtered before anyone reads a word.",
              ],
              [
                "It read like a template",
                "One message sent to five hundred people reads like one message sent to five hundred people.",
              ],
              [
                "The reply went cold",
                "Someone answered, and the reply sat in a shared inbox nobody owns until it was too late to matter.",
              ],
            ].map(([title, copy], index) => (
              <article key={title}>
                <span>0{index + 1}</span>
                <h3>{title}</h3>
                <p>{copy}</p>
              </article>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
