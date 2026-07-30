"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { LogoMark } from "@/components/ui/Logo";
import {
  PUBLIC_PRICING,
  publicPriceLabel,
  publicPriceQualifier,
} from "@/lib/billing/publicPricing";
import styles from "./landing.module.css";

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

type DemoGlyphKind = "leads" | "spark" | "clock" | "reply";

function DemoGlyph({ kind }: { kind: DemoGlyphKind }) {
  if (kind === "leads") {
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path
          d="M8.5 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm7-1a2.5 2.5 0 1 0 0-5m-12 13.5c.6-3 2.3-4.5 5-4.5s4.4 1.5 5 4.5m1.5-5c2.4.2 3.8 1.7 4.2 4"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }

  if (kind === "spark") {
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path
          d="M12 3.5c.7 4.4 3.1 6.8 7.5 7.5-4.4.7-6.8 3.1-7.5 7.5-.7-4.4-3.1-6.8-7.5-7.5 4.4-.7 6.8-3.1 7.5-7.5Z"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinejoin="round"
        />
      </svg>
    );
  }

  if (kind === "clock") {
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
        <circle cx="12" cy="12" r="7.5" stroke="currentColor" strokeWidth="1.8" />
        <path
          d="M12 8v4.4l2.9 1.7"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }

  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M5 6.5h14v9H9l-4 3v-12Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M9 10h6m-6 3h3"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
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
      setMessage(body.message ?? "Your pilot request is in.");
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
          <small>We will follow up with fit and onboarding details.</small>
        </span>
      </div>
    );
  }

  return (
    <div className={styles.waitField}>
      <form className={styles.waitForm} onSubmit={submit} noValidate>
        <label className={styles.srOnly} htmlFor={`pilot-email-${source}`}>
          Work email
        </label>
        <input
          id={`pilot-email-${source}`}
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="you@company.com"
          autoComplete="email"
          inputMode="email"
          aria-describedby={`pilot-note-${source}`}
          required
        />
        <button type="submit" disabled={status === "busy"}>
          {status === "busy" ? "Sending request..." : "Request a pilot"}
          {status !== "busy" && <Arrow />}
        </button>
      </form>
      <p
        id={`pilot-note-${source}`}
        className={status === "error" ? styles.formError : styles.formNote}
        role={status === "error" ? "alert" : undefined}
      >
        {status === "error" ? message : note}
      </p>
    </div>
  );
}

const WORKFLOW = [
  {
    number: "01",
    title: "Bring in the right leads",
    copy: "Upload a CSV, paste email addresses, or choose a saved list. Cadence validates fields, finds duplicates, and checks suppressions before a campaign is prepared.",
  },
  {
    number: "02",
    title: "Write with context",
    copy: "Start with your message or ask AI for a draft. Reuse a saved brand voice, add verified personalization, and rotate variants without losing control of the final copy.",
  },
  {
    number: "03",
    title: "Set a responsible pace",
    copy: "Choose sending days, hours, delays, and daily limits. Test mode gives you a safe rehearsal before a workspace is approved for live sending.",
  },
  {
    number: "04",
    title: "Read the campaign clearly",
    copy: "See sends, failures, bounces, engagement signals, replies, and opt-outs at campaign level, with the limitations of open tracking explained in context.",
  },
  {
    number: "05",
    title: "Turn replies into next steps",
    copy: "Triage reply intent, keep the original Gmail thread, and draft a thoughtful response while automatic follow-ups stop for resolved recipients.",
  },
] as const;

const DEMO_FLOW = [
  { label: "Leads", detail: "Verified", icon: "leads" },
  { label: "AI draft", detail: "Reviewed", icon: "spark" },
  { label: "Paced send", detail: "Scheduled", icon: "clock" },
  { label: "Reply", detail: "Surfaced", icon: "reply" },
] as const satisfies ReadonlyArray<{
  label: string;
  detail: string;
  icon: DemoGlyphKind;
}>;

const FEATURES = [
  {
    eyebrow: "Create",
    title: "AI that supports your judgment",
    copy: "Draft, rewrite, shorten, generate subjects, and create variants. You review every message and can keep a reusable voice without pretending AI knows facts it cannot verify.",
  },
  {
    eyebrow: "Send",
    title: "Controlled Gmail pacing",
    copy: "Schedule deliberate batches through your connected Gmail. Provider ceilings are not presented as universal safe targets, and plan caps remain hard limits.",
  },
  {
    eyebrow: "Measure",
    title: "Campaign-level reporting",
    copy: "Compare campaigns and date ranges with clear metric definitions. Replies and clicks carry more weight than privacy-sensitive open signals.",
  },
  {
    eyebrow: "Protect",
    title: "Consent built into the path",
    copy: "Suppression checks run before delivery. Signed one-click unsubscribe requests stop queued follow-ups and update the do-not-email list.",
  },
  {
    eyebrow: "Collaborate",
    title: "A shared operating view",
    copy: "Give team members role-appropriate access to campaigns, templates, leads, and reporting while keeping every data path scoped to its owner and workspace.",
  },
  {
    eyebrow: "Improve",
    title: "Deliverability context, not promises",
    copy: "Review SPF, DKIM, DMARC, pacing, failures, and available provider signals. Cadence helps reduce avoidable risk but never guarantees inbox placement.",
  },
] as const;

const FAQ = [
  [
    "Who is the private pilot for?",
    "Cadence is currently best suited to founders, focused sales teams, and agencies that use Gmail or Google Workspace and want a more controlled outreach workflow. We confirm fit before onboarding.",
  ],
  [
    "Does Cadence guarantee replies or inbox placement?",
    "No. Results depend on your audience, offer, message quality, sender history, provider behavior, and consent practices. Cadence provides controls and visibility that help reduce preventable risk.",
  ],
  [
    "What Gmail access does Cadence need?",
    "Cadence uses Google authorization for the product features you approve. Access is revocable, tokens are encrypted at rest, and pilot onboarding explains the requested scopes before connection.",
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
    "In-app billing is not active during the managed pilot. We confirm the plan, limits, support, and payment terms with you before any charge. The displayed prices are the current monthly pilot model.",
  ],
] as const;

export function Landing() {
  return (
    <div className={styles.root}>
      <a className={styles.skipLink} href="#main">
        Skip to main content
      </a>

      <nav className={styles.nav} aria-label="Primary navigation">
        <div className={styles.navInner}>
          <Link className={styles.brand} href="/" aria-label="Cadence home">
            <LogoMark size={29} />
            <span>Cadence</span>
          </Link>
          <div className={styles.navLinks}>
            <a href="#workflow">How it works</a>
            <a href="#features">Product</a>
            <a href="#pricing">Pricing</a>
            <a href="#trust">Trust</a>
          </div>
          <div className={styles.navActions}>
            <a className={styles.login} href="/sign-in">
              Log in
            </a>
            <a className={styles.navPilot} href="#pilot">
              Request a pilot <Arrow />
            </a>
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
                Managed private pilots are open
              </span>
              <h1>AI-assisted outreach that still sounds like you.</h1>
              <p className={styles.heroLead}>
                Build thoughtful Gmail campaigns, personalize without losing
                your voice, pace sends with visible controls, and keep replies
                and reporting in one focused workspace.
              </p>
              <div id="pilot">
                <WaitField
                  source="hero"
                  note="No credit card. No open signup. We only use your email to discuss a Cadence pilot."
                />
              </div>
              <div className={styles.heroFoot}>
                <a href="#workflow">
                  See the workflow <Arrow />
                </a>
                <span>
                  Gmail-connected. Test mode first. Human reviewed.
                </span>
              </div>
            </div>

            <div className={styles.productFrame}>
              <div className={styles.frameTop}>
                <div className={styles.frameBrand}>
                  <LogoMark size={24} />
                  <span>Campaign command center</span>
                </div>
                <span className={styles.exampleBadge}>Example data</span>
              </div>
              <div className={styles.frameBody}>
                <div className={styles.campaignHeader}>
                  <div>
                    <span className={styles.kicker}>Active campaign</span>
                    <h2>Northeast founder outreach</h2>
                  </div>
                  <span className={styles.healthPill}>
                    <span />
                    Sending steadily
                  </span>
                </div>
                <div className={styles.demoFlow}>
                  <span className={styles.srOnly}>
                    Example campaign flow: leads verified, AI draft reviewed,
                    send scheduled, and reply surfaced.
                  </span>
                  <div className={styles.flowVisual} aria-hidden="true">
                    <div className={styles.flowTrack}>
                      <span className={styles.flowProgress} />
                      <span className={styles.flowCursor} />
                    </div>
                    {DEMO_FLOW.map((stage) => (
                      <div className={styles.flowNode} key={stage.label}>
                        <span className={styles.flowIcon}>
                          <DemoGlyph kind={stage.icon} />
                        </span>
                        <span className={styles.flowText}>
                          <strong>{stage.label}</strong>
                          <small>{stage.detail}</small>
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className={styles.metricGrid}>
                  {[
                    ["Sent", "128", "of 180 prepared"],
                    ["Replies", "9", "7.0% of sent"],
                    ["Interested", "4", "44% of replies"],
                    ["Opt-outs", "2", "follow-ups stopped"],
                  ].map(([label, value, detail]) => (
                    <div className={styles.metric} key={label}>
                      <span>{label}</span>
                      <strong>{value}</strong>
                      <small>{detail}</small>
                    </div>
                  ))}
                </div>
                <div className={styles.frameColumns}>
                  <div className={styles.activityPanel}>
                    <div className={styles.panelHeading}>
                      <strong>Priority replies</strong>
                      <span>View all</span>
                    </div>
                    {[
                      ["JR", "Jordan Reyes", "Interested", "Can you send the details?"],
                      ["PN", "Priya Nair", "Needs reply", "How would onboarding work?"],
                      ["MW", "Marcus Webb", "Not now", "Circle back next quarter."],
                    ].map(([initials, name, intent, snippet]) => (
                      <div
                        className={`${styles.replyRow} ${
                          intent === "Interested" ? styles.replyFeatured : ""
                        }`}
                        key={name}
                      >
                        <span className={styles.avatar}>{initials}</span>
                        <span className={styles.replyCopy}>
                          <strong>{name}</strong>
                          <small>{snippet}</small>
                        </span>
                        <span
                          className={`${styles.intent} ${
                            intent === "Interested" ? styles.intentHot : ""
                          }`}
                        >
                          {intent}
                        </span>
                      </div>
                    ))}
                  </div>
                  <div className={styles.safetyPanel}>
                    <div className={styles.panelHeading}>
                      <strong>Launch controls</strong>
                      <span>Today</span>
                    </div>
                    {[
                      ["Gmail connected", "Ready"],
                      ["Suppression check", "Passed"],
                      ["Daily pace", "40 of 60"],
                      ["Next batch", "2:40 PM"],
                    ].map(([label, value], index) => (
                      <div className={styles.safetyRow} key={label}>
                        <span
                          className={index < 2 ? styles.checkDot : styles.timeDot}
                        >
                          {index < 2 ? <Check size={13} /> : ""}
                        </span>
                        <span>{label}</span>
                        <strong>{value}</strong>
                      </div>
                    ))}
                    <div className={styles.paceLine} aria-hidden="true">
                      <span />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className={styles.proofBar}>
              {[
                ["Gmail-native", "Messages stay connected to your inbox"],
                ["Test mode first", "Rehearse before a live workflow"],
                ["Campaign-level", "Metrics keep their real context"],
                ["Consent-aware", "Opt-outs stop future follow-ups"],
              ].map(([title, copy]) => (
                <div key={title}>
                  <Check size={17} />
                  <span>
                    <strong>{title}</strong>
                    <small>{copy}</small>
                  </span>
                </div>
              ))}
            </div>
          </div>
        </header>

        <section className={styles.introSection}>
          <div className={styles.shell}>
            <div className={styles.sectionHeading}>
              <span className={styles.eyebrow}>Built for focused teams</span>
              <h2>Less campaign machinery. More clarity at every decision.</h2>
              <p>
                Cadence brings the work that usually lives across spreadsheets,
                drafts, inbox tabs, and disconnected dashboards into one
                deliberate operating flow.
              </p>
            </div>
            <div className={styles.outcomeGrid}>
              {[
                [
                  "Know what is ready",
                  "Imports, missing fields, duplicates, suppressions, and launch checks are visible before a campaign moves.",
                ],
                [
                  "Keep the message human",
                  "AI gives you a strong first pass while your voice, proof, review, and final judgment stay in control.",
                ],
                [
                  "See what needs action",
                  "Campaign health and reply intent are prioritized so the next useful step is easier to find.",
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
            <div className={styles.sectionHeading}>
              <span className={styles.eyebrow}>One connected workflow</span>
              <h2>From lead list to real conversation.</h2>
              <p>
                Each step explains what Cadence is doing, what still needs your
                review, and which safety control stands between preparation and
                delivery.
              </p>
            </div>
            <div className={styles.workflow}>
              <div className={styles.workflowSteps}>
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
              <div className={styles.composeMock}>
                <div className={styles.mockTop}>
                  <span>Message workspace</span>
                  <span className={styles.exampleBadge}>Example</span>
                </div>
                <div className={styles.mockMeta}>
                  <div>
                    <small>Brand voice</small>
                    <strong>Clear, specific, low pressure</strong>
                  </div>
                  <span className={styles.aiStatus}>
                    <i />
                    AI assist on
                  </span>
                </div>
                <div className={styles.subjectLine}>
                  <small>Subject</small>
                  <strong>
                    A quick question about{" "}
                    <span className={styles.personalizedSubject}>
                      Harbor Studio
                    </span>
                    <span className={styles.typingCaret} aria-hidden="true" />
                  </strong>
                </div>
                <div className={styles.messageBody}>
                  <p>Hi Maya,</p>
                  <p>
                    I noticed{" "}
                    <mark className={styles.personalizedField}>
                      Harbor Studio
                    </mark>{" "}
                    is expanding its client team. We help growing agencies
                    keep outbound follow-up organized without moving
                    conversations away from Gmail.
                  </p>
                  <p>
                    Would a short walkthrough be useful next week?
                  </p>
                  <p>Matthew</p>
                </div>
                <div className={styles.assistNote} aria-hidden="true">
                  <span className={styles.assistIcon}>
                    <DemoGlyph kind="spark" />
                  </span>
                  <span>
                    <strong>Draft refined</strong>
                    <small>Voice and personalization checked</small>
                  </span>
                  <span className={styles.assistCheck}>
                    <Check size={14} />
                  </span>
                </div>
                <div className={styles.variantBar}>
                  <span>Variant A</span>
                  <span className={styles.variantCheck}>
                    <Check size={12} />
                    Personalization checked
                  </span>
                  <button type="button">Preview</button>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className={styles.featuresSection} id="features">
          <div className={styles.shell}>
            <div className={styles.sectionHeading}>
              <span className={styles.eyebrow}>The product</span>
              <h2>Serious outreach controls without enterprise clutter.</h2>
              <p>
                Enough structure to run a reliable process, with honest labels
                wherever email data or provider behavior has real limitations.
              </p>
            </div>
            <div className={styles.featureGrid}>
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
            <div className={styles.trustLayout}>
              <div className={styles.trustCopy}>
                <span className={styles.eyebrow}>Trust is a product feature</span>
                <h2>Designed to protect the relationship behind every send.</h2>
                <p>
                  Cadence cannot make outreach risk-free. It can make risk,
                  consent, access, and campaign state easier to see and harder
                  to ignore.
                </p>
                <a href="#pilot">
                  Discuss a managed pilot <Arrow />
                </a>
              </div>
              <div className={styles.trustGrid}>
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

        <section className={styles.pricingSection} id="pricing">
          <div className={styles.shell}>
            <div className={styles.sectionHeading}>
              <span className={styles.eyebrow}>Managed pilot pricing</span>
              <h2>Clear monthly plans, confirmed before you pay.</h2>
              <p>
                These are the current pilot prices. Billing stays off until we
                confirm fit, limits, onboarding, and payment terms with you.
              </p>
            </div>
            <div className={styles.pricingGrid}>
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
                  <a href="#pilot">
                    {tier.cta} <Arrow />
                  </a>
                </article>
              ))}
            </div>
            <p className={styles.pricingNote}>
              Daily limits are product ceilings, not a promise that every
              inbox should use the maximum. Recommended pacing depends on
              provider rules, sender history, audience quality, and campaign
              behavior. Annual billing and overages are not active in the
              private pilot.
            </p>
          </div>
        </section>

        <section className={styles.faqSection}>
          <div className={styles.shell}>
            <div className={styles.sectionHeading}>
              <span className={styles.eyebrow}>Straight answers</span>
              <h2>What to know before a pilot.</h2>
            </div>
            <div className={styles.faq}>
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
            <div className={styles.finalPanel}>
              <span className={styles.eyebrow}>Private pilot</span>
              <h2>Bring your real outreach workflow.</h2>
              <p>
                We will review fit, explain the safety model, and help you
                define a responsible first-success milestone.
              </p>
              <WaitField
                source="footer"
                note="No mailing list. We only use your email to discuss a Cadence pilot."
              />
            </div>
          </div>
        </section>
      </main>

      <footer className={styles.footer}>
        <div className={styles.footerInner}>
          <div>
            <Link className={styles.brand} href="/">
              <LogoMark size={25} />
              <span>Cadence</span>
            </Link>
            <p>Thoughtful Gmail outreach with visible controls.</p>
          </div>
          <div className={styles.footerLinks}>
            <a href="#workflow">How it works</a>
            <a href="#features">Product</a>
            <a href="#pricing">Pricing</a>
            <a href="#trust">Trust</a>
            <a href="/sign-in">Log in</a>
          </div>
          <p className={styles.copyright}>
            © 2026 Cadence. Private pilot. Legal terms and privacy details are
            provided before onboarding.
          </p>
        </div>
      </footer>
    </div>
  );
}
