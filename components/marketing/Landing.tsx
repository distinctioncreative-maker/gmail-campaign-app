"use client";

import { useState, type FormEvent, type MouseEvent, type ReactNode } from "react";
import Link from "next/link";
import { Wordmark } from "@/components/ui/Logo";
import {
  PUBLIC_PRICING,
  publicPriceLabel,
  publicPriceQualifier,
} from "@/lib/billing/publicPricing";
import styles from "./landing.module.css";
import { ScrollReveal } from "./ScrollReveal";
import { Sparkline } from "@/components/ui/charts/Sparkline";
import { InboxProof } from "./InboxProof";

function Check({ size = 18 }: { size?: number }) {
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

function Arrow() {
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

const CONTACT_TARGET_ID = "contact";
const CONTACT_EMAIL_ID = "contact-email-contact";

/**
 * The primary call to action. It goes to the real sign-in, because the product
 * is something you can now start using rather than something to be admitted
 * to. Everything that used to say "request a pilot" says "Get started" and
 * lands here.
 */
function StartLink({
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
function ContactLink({
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

const WORKFLOW = [
  {
    number: "01",
    title: "Start with a list that will not burn you",
    copy: "Bring a CSV, a paste, or a saved list. Duplicates and opt-outs are stripped before anything touches your domain.",
  },
  {
    number: "02",
    title: "Write once, send something different to everyone",
    copy: "Describe the offer and AI drafts it in your voice. Mark the phrases that could go either way and Cadence builds hundreds of versions from the one message.",
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

const FEATURES = [
  {
    eyebrow: "Vary",
    title: "Hundreds of versions of one email",
    copy: "Mark the phrases that could go either way and Cadence writes the combinations. A retry never sends different wording to the same person.",
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
    "Not on signup. There is no card field anywhere on this site and none in the product yet, so creating a workspace costs nothing. The prices above are the current monthly model, and we confirm the plan, limits, support, and payment terms with you before any charge is ever raised.",
  ],
] as const;

/**
 * The four glyphs for the feature row, drawn locally.
 *
 * The app has a 37-icon module, and importing it here would pull every one of
 * them into the marketing bundle for the sake of four. This page already keeps
 * its own Check and Arrow for the same reason.
 */
function FeatureGlyph({ kind }: { kind: "write" | "pace" | "verify" | "reply" }) {
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

function WaitField({
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

export function Landing() {
  return (
    <div className={styles.root} data-landing-root>
      <ScrollReveal />
      <a className={styles.skipLink} href="#main">
        Skip to main content
      </a>

      <nav className={styles.nav} aria-label="Primary navigation">
        <div className={styles.navInner}>
          <Link className={styles.brand} href="/" aria-label="Cadence home">
            <Wordmark />
          </Link>
          <div className={styles.navLinks}>
            <a href="#workflow">How it works</a>
            <a href="#features">Product</a>
            <a href="#pricing">Pricing</a>
            <a href="#trust">Trust</a>
          </div>
          <div className={styles.navActions}>
            <a className={styles.login} href="/demo">
              See it live
            </a>
            <a className={styles.login} href="/sign-in">
              Log in
            </a>
            <StartLink className={styles.navStart}>
              Get started <Arrow />
            </StartLink>
          </div>
        </div>
      </nav>

      <main id="main">
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
              <h1>
                Thousands a month.{" "}
                <em>Sound like one person.</em>{" "}
                Get replies.
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
                [
                  "It never reached them",
                  "Sent from your own Gmail, paced across the day, with domain checks before launch.",
                ],
                [
                  "It read like a template",
                  "AI drafts in your brand voice from real lead context. You approve every one.",
                ],
                [
                  "The reply went cold",
                  "Replies sorted by intent, kept in the original Gmail thread.",
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

        <section className={styles.workflowSection} id="workflow">
          <div className={styles.shell}>
            <div className={styles.sectionHeading} data-reveal>
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

        <section className={styles.pricingSection} id="pricing">
          <div className={styles.shell}>
            <div className={styles.sectionHeading} data-reveal>
              <span className={styles.eyebrow}>Pricing</span>
              <h2>Priced for real use, not for a demo.</h2>
              <p>
                Choose a focused solo workflow or a shared team operating
                view. Card details are never taken on this page: we confirm
                limits, onboarding, and payment terms with you before any
                charge.
              </p>
            </div>
            <div className={styles.pricingGrid} data-reveal>
              {PUBLIC_PRICING.map((tier) => (
                <article
                  className={tier.featured ? styles.featuredPrice : ""}
                  key={tier.id}
                >
                  {tier.featured && (
                    <span className={styles.recommended}>Recommended</span>
                  )}
                  <span className={styles.planEyebrow}>{tier.eyebrow}</span>
                  <h3>{tier.name}</h3>
                  <div className={styles.priceLine}>
                    <strong>{publicPriceLabel(tier.id)}</strong>
                    <span>{publicPriceQualifier(tier.id)}</span>
                  </div>
                  <p>{tier.description}</p>
                  <ul>
                    {tier.features.map((feature) => (
                      <li key={feature}>
                        <Check size={16} />
                        {feature}
                      </li>
                    ))}
                  </ul>
                  {/* Enterprise is a conversation; the other two are a
                      sign-in. Neither takes card details on this page. */}
                  {tier.id === "ENTERPRISE" ? (
                    <ContactLink>
                      {tier.cta} <Arrow />
                    </ContactLink>
                  ) : (
                    <StartLink>
                      {tier.cta} <Arrow />
                    </StartLink>
                  )}
                </article>
              ))}
            </div>
            <p className={styles.pricingNote}>
              Daily limits are product ceilings, not a promise that every
              inbox should use the maximum. Recommended pacing depends on
              provider rules, sender history, audience quality, and campaign
              behavior. Annual billing and overages are not active yet.
            </p>
          </div>
        </section>

        <section className={styles.faqSection}>
          <div className={styles.shell}>
            <div className={styles.sectionHeading} data-reveal>
              <span className={styles.eyebrow}>Straight answers</span>
              <h2>Know exactly what Cadence does and does not promise.</h2>
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
      </main>

      <footer className={styles.footer}>
        <div className={styles.footerInner}>
          <div>
            <Link className={styles.brand} href="/">
              <Wordmark />
            </Link>
            <p>
              AI-powered Gmail outreach with human review, deliberate pacing,
              and a clear next step.
            </p>
          </div>
          <div className={styles.footerLinks}>
            <a href="#workflow">Workflow</a>
            <a href="#features">Product</a>
            <a href="#controls">Live demo</a>
            <a href="#pricing">Pricing</a>
            <a href="#trust">Trust</a>
            <Link href="/terms">Terms</Link>
            <Link href="/privacy">Privacy</Link>
            <Link href="/acceptable-use">Anti-spam</Link>
            <Link href="/compliance">Compliance</Link>
            <Link href="/support">Support</Link>
            <Link href="/sign-in">Log in</Link>
          </div>
          <p className={styles.copyright}>
            © 2026 Cadence. Early access. A signed order form completes the
            operating entity, jurisdiction, commercial, and data terms.
          </p>
        </div>
      </footer>
    </div>
  );
}
