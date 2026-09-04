"use client";

import styles from "../landing.module.css";
import { Arrow, StartLink } from "../shared";
import { Sparkline } from "@/components/ui/charts/Sparkline";

export function Outcome() {
  return (
    <>
      {/* The dark metrics band. Every figure is illustrative and says so:
          these are the shapes a healthy workspace produces, not a forecast,
          and not anyone's real results. */}
      <section className={styles.outcomeBand}>
        <div className={styles.shell}>
          <div className={styles.outcomeLayout} data-reveal>
            <div className={styles.outcomeCopy}>
              <h2>More replies. More meetings. More closed deals.</h2>
              <p>
                Volume is easy. Volume that still sounds like one person
                writing to one person is the part that earns a reply.
              </p>
              <StartLink className={styles.heroPrimary}>
                Get started <Arrow />
              </StartLink>
              <p className={styles.outcomeNote}>
                Illustrative figures from an example workspace.
              </p>
            </div>

            <dl className={styles.outcomeStats}>
              <div className={styles.outcomeStat}>
                <div>
                  <dt>Emails sent</dt>
                  <dd>
                    2,439
                    <small>Across 30 days</small>
                  </dd>
                </div>
                <Sparkline
                  data={[110, 128, 96, 152, 141, 173, 168, 196, 184, 212]}
                  width={190}
                  height={54}
                  series={1}
                  label="Emails sent per day"
                />
              </div>
              <div className={styles.outcomeStat}>
                <div>
                  <dt>Reply rate</dt>
                  <dd>
                    6.2%
                    <small>Replies, not opens</small>
                  </dd>
                </div>
                <Sparkline
                  data={[3.1, 3.4, 4.0, 4.2, 4.9, 5.1, 5.4, 5.8, 6.0, 6.2]}
                  width={190}
                  height={54}
                  series={2}
                  label="Reply rate per day"
                />
              </div>
              <div className={styles.outcomeStat}>
                <div>
                  <dt>Meetings booked</dt>
                  <dd>
                    17
                    <small>Traced to outreach</small>
                  </dd>
                </div>
                <Sparkline
                  data={[0, 1, 1, 3, 4, 6, 8, 11, 14, 17]}
                  width={190}
                  height={54}
                  series={2}
                  label="Meetings booked, cumulative"
                />
              </div>
            </dl>
          </div>
        </div>
      </section>
    </>
  );
}
