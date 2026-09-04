"use client";

import { useState, type FormEvent, type MouseEvent, type ReactNode } from "react";
import Link from "next/link";
import styles from "./landing.module.css";

/**
 * The pieces more than one band of the marketing page needs.
 *
 * Landing.tsx was 876 lines holding nine bands, four helper components, three
 * data tables and the page shell, so changing the pricing copy meant scrolling
 * past the hero, the workflow and the trust band to reach it, and every one of
 * those was a candidate for an accidental edit on the way. These are the parts
 * that genuinely are shared. Anything belonging to exactly one band moved to
 * live with it.
 */

export function Check({ size = 18 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="m5 12.5 4.2 4.2L19.5 6.5"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function Arrow() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M5 12h14m-5-5 5 5-5 5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export const CONTACT_TARGET_ID = "contact";
const CONTACT_EMAIL_ID = "contact-email-contact";

/**
 * The primary call to action. It goes to the real sign-in, because the product
 * is something you can now start using rather than something to be admitted
 * to. Everything that used to say "request a pilot" says "Get started" and
 * lands here.
 */
export function StartLink({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <Link className={className} href="/sign-in">
      {children}
    </Link>
  );
}

/**
 * The secondary path, for teams that want a conversation before they connect
 * an inbox. It centres and focuses the contact field rather than jumping, so
 * the cursor lands where the next keystroke should go.
 */
export function ContactLink({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  function focusContactRequest(event: MouseEvent<HTMLAnchorElement>) {
    const target = document.getElementById(CONTACT_TARGET_ID);
    const input = document.getElementById(CONTACT_EMAIL_ID);
    if (!target || !(input instanceof HTMLInputElement)) return;

    event.preventDefault();
    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;
    window.history.replaceState(null, "", `#${CONTACT_TARGET_ID}`);
    target.scrollIntoView({
      behavior: reduceMotion ? "auto" : "smooth",
      block: "center",
    });

    if (reduceMotion) {
      window.requestAnimationFrame(() => input.focus());
      return;
    }

    const focusInput = () => {
      window.removeEventListener("scrollend", focusInput);
      window.clearTimeout(fallback);
      input.focus();
    };
    window.addEventListener("scrollend", focusInput, { once: true });
    const fallback = window.setTimeout(focusInput, 600);
  }

  return (
    <a
      className={className}
      href={`#${CONTACT_TARGET_ID}`}
      aria-controls={CONTACT_EMAIL_ID}
      onClick={focusContactRequest}
    >
      {children}
    </a>
  );
}

/**
 * The four glyphs for the feature row, drawn locally.
 *
 * The app has a 37-icon module, and importing it here would pull every one of
 * them into the marketing bundle for the sake of four. This page already keeps
 * its own Check and Arrow for the same reason.
 */
export function FeatureGlyph({ kind }: { kind: "write" | "pace" | "verify" | "reply" }) {
  const common = {
    width: 18,
    height: 18,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.7,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
    focusable: false as const,
  };
  if (kind === "write") {
    return (
      <svg {...common}>
        <path d="M4 20h4l10-10a2.1 2.1 0 0 0-3-3L5 17v3Z" />
        <path d="M14 7l3 3" />
      </svg>
    );
  }
  if (kind === "pace") {
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="8.5" />
        <path d="M12 7.5V12l3 1.8" />
      </svg>
    );
  }
  if (kind === "verify") {
    return (
      <svg {...common}>
        <path d="M12 3.5 19 6v5.5c0 4-2.9 7.4-7 8.9-4.1-1.5-7-4.9-7-8.9V6l7-2.5Z" />
        <path d="m9.2 11.9 2 2 3.6-3.9" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <path d="M9.5 8.5 5 13l4.5 4.5" />
      <path d="M5 13h9a5 5 0 0 0 5-5V6.5" />
    </svg>
  );
}

export function WaitField({
  source,
  note,
}: {
  source: string;
  note: ReactNode;
}) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<
    "idle" | "busy" | "done" | "error"
  >("idle");
  const [message, setMessage] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setStatus("error");
      setMessage("Enter a valid work email.");
      return;
    }
    setStatus("busy");
    setMessage("");
    try {
      const response = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), source }),
      });
      const body = (await response.json().catch(() => ({}))) as {
        error?: string;
        message?: string;
      };
      if (!response.ok) {
        throw new Error(body.error ?? "We could not record your request.");
      }
      setStatus("done");
      setMessage(body.message ?? "Your message is in.");
    } catch (error) {
      setStatus("error");
      setMessage(
        error instanceof Error
          ? error.message
          : "We could not record your request."
      );
    }
  }

  if (status === "done") {
    return (
      <div className={styles.waitSuccess} role="status">
        <span className={styles.successIcon}>
          <Check />
        </span>
        <span>
          <strong>{message}</strong>
          <small>We will follow up with rollout and onboarding details.</small>
        </span>
      </div>
    );
  }

  return (
    <div className={styles.waitField}>
      <form className={styles.waitForm} onSubmit={submit} noValidate>
        <label className={styles.srOnly} htmlFor={`contact-email-${source}`}>
          Work email
        </label>
        <input
          id={`contact-email-${source}`}
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="you@company.com"
          autoComplete="email"
          inputMode="email"
          aria-describedby={`contact-note-${source}`}
          required
        />
        <button type="submit" disabled={status === "busy"}>
          {status === "busy" ? "Sending..." : "Talk to sales"}
          {status !== "busy" && <Arrow />}
        </button>
      </form>
      <p
        id={`contact-note-${source}`}
        className={status === "error" ? styles.formError : styles.formNote}
        role={status === "error" ? "alert" : undefined}
      >
        {status === "error" ? message : note}
      </p>
    </div>
  );
}

