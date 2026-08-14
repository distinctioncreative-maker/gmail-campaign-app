"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import styles from "./landing.module.css";

/**
 * The hero visual: real Gmail chrome with Cadence working inside it.
 *
 * The brief for this was that the first thing a visitor sees should say three
 * things at once, and that it should look like Gmail, because that is the whole
 * proposition. Those three things are: this sends at volume, it works hard on
 * deliverability, and replies actually come back.
 *
 * Two of those are straightforward. The middle one is where the honest version
 * and the tempting version part company, and this deliberately takes the honest
 * one.
 *
 * Nobody can promise inbox placement. It is decided by the receiving provider
 * using recipient engagement, domain history, list quality and content, none of
 * which any sending tool controls, and Google does not make that promise about
 * Gmail either. A landing page that says "we keep you out of spam" is writing a
 * cheque the product cannot cash, and landing-experience.test.ts has guarded
 * against exactly that wording since before this component existed.
 *
 * So the panel shows the *work*, not a guarantee: the domain actually
 * authenticated, the send actually paced across the day, the bounce rate
 * actually being watched, the replies actually counted. Evidence of care is
 * more convincing than a claim anyway, and it is the thing a deliverability-
 * literate buyer is looking for. Every figure here is illustrative and labelled
 * as an example, because inventing a customer's results would be the same
 * dishonesty wearing a different hat.
 */

const ROWS = [
  { name: "Priya Raman", subject: "Re: Working capital for Q3", reply: true },
  { name: "Daniel Okafor", subject: "Following up on our note", reply: false },
  { name: "Marta Silva", subject: "Re: Terms you asked about", reply: true },
  { name: "Tom Whitfield", subject: "Quick question about volume", reply: false },
  { name: "Aisha Bello", subject: "Re: Happy to take a look", reply: true },
];

const CHECKS = [
  { label: "SPF", state: "Pass" },
  { label: "DKIM", state: "Pass" },
  { label: "DMARC", state: "Pass" },
];

function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const query = window.matchMedia("(prefers-reduced-motion: reduce)");
      query.addEventListener("change", onChange);
      return () => query.removeEventListener("change", onChange);
    },
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    () => false
  );
}

/** The Gmail envelope, drawn rather than fetched: no external asset, no CSP hole. */
function GmailMark({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size * 0.75} viewBox="0 0 24 18" aria-hidden focusable="false">
      <path d="M2 16.5V4.2L12 11l10-6.8v12.3a1.5 1.5 0 0 1-1.5 1.5H18V8.9l-6 4.1-6-4.1v8.1H3.5A1.5 1.5 0 0 1 2 16.5Z" fill="#4285F4" />
      <path d="M2 4.2 12 11 22 4.2A1.5 1.5 0 0 0 20.5 3h-17A1.5 1.5 0 0 0 2 4.2Z" fill="#EA4335" />
      <path d="M18 17V8.9l4-2.7V17h-4Z" fill="#34A853" />
      <path d="M2 6.2 6 8.9V17H2V6.2Z" fill="#C5221F" />
      <path d="M22 4.2v2l-4 2.7V11l4-2.8V4.2Z" fill="#FBBC04" />
    </svg>
  );
}

/**
 * Counts up once, on mount, from the clock rather than per frame. Kept local
 * rather than reusing the app's CountUp, because that component belongs to the
 * authenticated product and the marketing bundle should not pull it in.
 */
function Ticker({ to, reduced, duration = 1600 }: { to: number; reduced: boolean; duration?: number }) {
  const [shown, setShown] = useState(to);
  const frame = useRef<number | null>(null);

  useEffect(() => {
    // Already initialised to the target, so there is nothing to set: returning
    // here leaves the settled figure on screen and never starts a frame loop.
    if (reduced) return;
    const started = performance.now();
    const step = (now: number) => {
      const progress = Math.min(1, (now - started) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      if (progress < 1) {
        setShown(Math.round(to * eased));
        frame.current = requestAnimationFrame(step);
      } else {
        setShown(to);
      }
    };
    // No synchronous reset to zero. The first frame lands about 16ms later with
    // progress at roughly nought and sets it anyway, so seeding it here only
    // bought an extra render, which is what the react-hooks rule was pointing
    // at. The figure therefore stays at its server value until the animation
    // genuinely starts.
    frame.current = requestAnimationFrame(step);
    return () => {
      if (frame.current) cancelAnimationFrame(frame.current);
    };
  }, [to, duration, reduced]);

  // Server prints the settled figure, so no flash of zero and no empty value
  // without JavaScript.
  return <span suppressHydrationWarning>{shown.toLocaleString()}</span>;
}

export function InboxProof() {
  const reduced = usePrefersReducedMotion();
  const [live, setLive] = useState(false);

  useEffect(() => {
    if (reduced) return;
    const id = window.setTimeout(() => setLive(true), 260);
    return () => window.clearTimeout(id);
  }, [reduced]);

  return (
    <div className={styles.inboxProof} data-live={live || reduced ? "" : undefined}>
      {/* ------------------------------------------------ Gmail window */}
      <div className={styles.mailWindow}>
        <div className={styles.mailChrome}>
          <GmailMark />
          <span className={styles.mailChromeName}>Gmail</span>
          <span className={styles.mailSearch} aria-hidden />
        </div>

        <div className={styles.mailBody}>
          <div className={styles.mailRail} aria-hidden>
            <span data-current>
              Inbox <b>14</b>
            </span>
            <span>Starred</span>
            <span>Sent</span>
            <span>Drafts</span>
            {/* The one row a deliverability buyer looks for. It is our own
                bounce-and-complaint tracking, not a claim about Google's. */}
            <span data-quiet>
              Spam <b>0</b>
            </span>
          </div>

          <ul className={styles.mailList}>
            {ROWS.map((row, i) => (
              <li
                key={row.name}
                className={styles.mailRow}
                data-reply={row.reply || undefined}
                style={{ transitionDelay: `${260 + i * 90}ms` }}
              >
                <span className={styles.mailAvatar} aria-hidden>
                  {row.name.charAt(0)}
                </span>
                <span className={styles.mailText}>
                  <strong>{row.name}</strong>
                  <small>{row.subject}</small>
                </span>
                {row.reply && <span className={styles.mailTag}>Replied</span>}
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* ------------------------------------------- Cadence side panel */}
      <div className={styles.proofPanel}>
        <p className={styles.proofPanelHead}>
          <span className={styles.proofDot} aria-hidden />
          Cadence · sending now
        </p>

        <div className={styles.proofFigure}>
          <b>
            <Ticker to={2439} reduced={reduced} />
          </b>
          <small>Emails sent this month</small>
        </div>

        <div className={styles.proofChecks}>
          {CHECKS.map((check) => (
            <span key={check.label}>
              <i aria-hidden />
              {check.label} <b>{check.state}</b>
            </span>
          ))}
        </div>

        <dl className={styles.proofStats}>
          <div>
            <dt>Paced across</dt>
            <dd>9 hours</dd>
          </div>
          <div>
            <dt>Bounce rate</dt>
            <dd data-good>0.1%</dd>
          </div>
          <div>
            <dt>Replies</dt>
            <dd data-good>
              <Ticker to={14} reduced={reduced} duration={1200} />
            </dd>
          </div>
        </dl>

        {/* Said plainly rather than in small print, because the alternative is a
            reader assuming these are their numbers. */}
        <p className={styles.proofFootnote}>Example workspace</p>
      </div>
    </div>
  );
}
