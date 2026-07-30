"use client";

import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
} from "react";
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

const PILOT_TARGET_ID = "pilot";
const PILOT_EMAIL_ID = "pilot-email-hero";

function PilotLink({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  function focusPilotRequest(event: MouseEvent<HTMLAnchorElement>) {
    const target = document.getElementById(PILOT_TARGET_ID);
    const input = document.getElementById(PILOT_EMAIL_ID);
    if (!target || !(input instanceof HTMLInputElement)) return;

    event.preventDefault();
    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;
    window.history.replaceState(null, "", `#${PILOT_TARGET_ID}`);
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
      href={`#${PILOT_TARGET_ID}`}
      aria-controls={PILOT_EMAIL_ID}
      onClick={focusPilotRequest}
    >
      {children}
    </a>
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

const HERO_DEMO_STAGES = [
  {
    label: "Import",
    icon: "leads",
    title: "Start with a clean, usable audience",
    copy: "Cadence validates the list, removes duplicate addresses, flags missing context, and excludes suppressed recipients before any campaign is prepared.",
    status: "List checked",
    statusTone: "safe",
    metrics: [
      ["Prepared", "180", "ready for review"],
      ["Duplicates", "12", "removed"],
      ["Suppressed", "3", "excluded"],
      ["Needs context", "5", "flagged"],
    ],
  },
  {
    label: "AI draft",
    icon: "spark",
    title: "Turn context into a useful first draft",
    copy: "AI applies an approved brand voice and known lead details to create a focused message. No unverified research is silently presented as fact.",
    status: "Draft ready",
    statusTone: "active",
    metrics: [
      ["Drafts", "180", "prepared"],
      ["Brand voice", "1", "approved profile"],
      ["Variants", "3", "available"],
      ["Claims flagged", "2", "need review"],
    ],
  },
  {
    label: "Review",
    icon: "spark",
    title: "Keep a person in control",
    copy: "Preview variables, compare variants, edit the message, and approve the campaign. AI accelerates preparation but never replaces final judgment.",
    status: "Human review",
    statusTone: "review",
    metrics: [
      ["Reviewed", "180", "previews checked"],
      ["Edits", "14", "human changes"],
      ["Variables", "5", "validated"],
      ["Approved", "180", "ready to schedule"],
    ],
  },
  {
    label: "Schedule",
    icon: "clock",
    title: "Choose when and how outreach moves",
    copy: "Set business days, sending hours, spacing, and a daily ceiling. Test mode gives the team a rehearsal before a workspace is approved for live delivery.",
    status: "Test mode",
    statusTone: "review",
    metrics: [
      ["Daily pace", "40", "of 60 ceiling"],
      ["Send window", "9 to 4", "local hours"],
      ["Spacing", "6 min", "minimum delay"],
      ["Next batch", "2:40", "PM today"],
    ],
  },
  {
    label: "Send",
    icon: "clock",
    title: "Deliver through Gmail at the pace you set",
    copy: "Cadence reserves each delivery, rechecks suppression and plan limits, and quarantines ambiguous provider responses instead of blindly sending again.",
    status: "Sending steadily",
    statusTone: "safe",
    metrics: [
      ["Sent", "128", "of 180 prepared"],
      ["Failed", "2", "visible for review"],
      ["Bounced", "3", "follow-ups stopped"],
      ["Opt-outs", "2", "suppressed"],
    ],
  },
  {
    label: "Replies",
    icon: "reply",
    title: "Move the right replies toward a next step",
    copy: "Replies stay connected to the original Gmail thread, interested conversations rise to the top, and resolved recipients stop receiving automatic follow-ups.",
    status: "4 interested",
    statusTone: "safe",
    metrics: [
      ["Replies", "9", "7.0% of sent"],
      ["Interested", "4", "44% of replies"],
      ["Needs reply", "2", "action required"],
      ["Follow-ups", "7", "stopped"],
    ],
  },
] as const satisfies ReadonlyArray<{
  label: string;
  icon: DemoGlyphKind;
  title: string;
  copy: string;
  status: string;
  statusTone: "safe" | "active" | "review";
  metrics: ReadonlyArray<readonly [string, string, string]>;
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

function useReducedMotion() {
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  return reducedMotion;
}

function HeroDemo() {
  const [activeStage, setActiveStage] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [visible, setVisible] = useState(true);
  const demoRef = useRef<HTMLDivElement>(null);
  const reducedMotion = useReducedMotion();
  const stage = HERO_DEMO_STAGES[activeStage];

  useEffect(() => {
    const node = demoRef.current;
    if (!node || !("IntersectionObserver" in window)) return;
    const observer = new IntersectionObserver(
      ([entry]) => setVisible(entry.isIntersecting),
      { threshold: 0.15 }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!playing || !visible || reducedMotion) return;
    const timer = window.setInterval(() => {
      setActiveStage((current) => (current + 1) % HERO_DEMO_STAGES.length);
    }, 3600);
    return () => window.clearInterval(timer);
  }, [playing, reducedMotion, visible]);

  function chooseStage(index: number) {
    setActiveStage(index);
    setPlaying(false);
  }

  function moveStageWithKeyboard(
    event: KeyboardEvent<HTMLButtonElement>,
    index: number
  ) {
    let next = index;
    if (event.key === "ArrowRight") {
      next = (index + 1) % HERO_DEMO_STAGES.length;
    } else if (event.key === "ArrowLeft") {
      next =
        (index - 1 + HERO_DEMO_STAGES.length) % HERO_DEMO_STAGES.length;
    } else if (event.key === "Home") {
      next = 0;
    } else if (event.key === "End") {
      next = HERO_DEMO_STAGES.length - 1;
    } else {
      return;
    }

    event.preventDefault();
    chooseStage(next);
    window.requestAnimationFrame(() => {
      document.getElementById(`hero-demo-tab-${next}`)?.focus();
    });
  }

  function togglePlayback() {
    if (reducedMotion) {
      setActiveStage((current) => (current + 1) % HERO_DEMO_STAGES.length);
      return;
    }
    setPlaying((current) => !current);
  }

  return (
    <div className={styles.productFrame} ref={demoRef}>
      <div className={styles.frameTop}>
        <div className={styles.frameBrand}>
          <LogoMark size={24} />
          <span>Guided campaign walkthrough</span>
        </div>
        <span className={styles.exampleBadge}>Interactive example</span>
      </div>
      <div className={styles.frameBody}>
        <div className={styles.demoToolbar}>
          <span>
            Step {activeStage + 1} of {HERO_DEMO_STAGES.length}
          </span>
          <button type="button" onClick={togglePlayback}>
            {reducedMotion
              ? "Next step"
              : playing
                ? "Pause walkthrough"
                : "Play walkthrough"}
          </button>
        </div>

        <div
          className={styles.demoStageTabs}
          role="tablist"
          aria-label="Campaign workflow example"
        >
          {HERO_DEMO_STAGES.map((item, index) => (
            <button
              key={item.label}
              id={`hero-demo-tab-${index}`}
              type="button"
              role="tab"
              aria-selected={activeStage === index}
              aria-controls="hero-demo-panel"
              tabIndex={activeStage === index ? 0 : -1}
              onClick={() => chooseStage(index)}
              onKeyDown={(event) => moveStageWithKeyboard(event, index)}
            >
              <span>
                <DemoGlyph kind={item.icon} />
              </span>
              {item.label}
            </button>
          ))}
        </div>

        <div className={styles.demoProgress} aria-hidden="true">
          <span
            style={{
              width: `${((activeStage + 1) / HERO_DEMO_STAGES.length) * 100}%`,
            }}
          />
        </div>

        <div
          key={stage.label}
          className={styles.demoStagePanel}
          id="hero-demo-panel"
          role="tabpanel"
          aria-labelledby={`hero-demo-tab-${activeStage}`}
          aria-live="polite"
        >
          <div>
            <span className={styles.kicker}>Campaign command center</span>
            <h2>{stage.title}</h2>
            <p>{stage.copy}</p>
          </div>
          <span
            className={`${styles.healthPill} ${
              stage.statusTone === "review"
                ? styles.healthReview
                : stage.statusTone === "active"
                  ? styles.healthActive
                  : ""
            }`}
          >
            <span />
            {stage.status}
          </span>
        </div>

        <div className={styles.metricGrid} key={`${stage.label}-metrics`}>
          {stage.metrics.map(([label, value, detail]) => (
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
              <span>Example inbox</span>
            </div>
            {[
              ["JR", "Jordan Reyes", "Interested", "Can you send the details?"],
              ["PN", "Priya Nair", "Needs reply", "How would onboarding work?"],
              ["MW", "Marcus Webb", "Not now", "Circle back next quarter."],
            ].map(([initials, name, intent, snippet]) => (
              <div
                className={`${styles.replyRow} ${
                  activeStage === HERO_DEMO_STAGES.length - 1 &&
                  intent === "Interested"
                    ? styles.replyFeatured
                    : ""
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
              <span>Example</span>
            </div>
            {[
              ["Gmail connected", "Ready"],
              ["Suppression check", "Passed"],
              ["Daily pace", "40 of 60"],
              ["Next batch", "2:40 PM"],
            ].map(([label, value], index) => (
              <div className={styles.safetyRow} key={label}>
                <span className={index < 2 ? styles.checkDot : styles.timeDot}>
                  {index < 2 ? <Check size={13} /> : ""}
                </span>
                <span>{label}</span>
                <strong>{value}</strong>
              </div>
            ))}
            <div
              className={styles.paceLine}
              aria-label="Two thirds of example daily pace used"
            >
              <span />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const VOICE_OPTIONS = [
  {
    label: "Clear",
    descriptor: "Clear, specific, low pressure",
    beforeCompany: "I noticed",
    afterCompany:
      "is expanding its client team. We help growing agencies keep thoughtful follow-up moving without pulling conversations away from Gmail.",
  },
  {
    label: "Warm",
    descriptor: "Warm, direct, conversational",
    beforeCompany: "The growth at",
    afterCompany:
      "is exciting. As the client team expands, keeping personal follow-up consistent can become a job of its own.",
  },
  {
    label: "Consultative",
    descriptor: "Insight led, concise, practical",
    beforeCompany: "As",
    afterCompany:
      "grows, the gap between finding the right prospects and following up consistently can widen. Cadence keeps that work organized inside a Gmail-connected workflow.",
  },
] as const;

const VARIANT_ENDINGS = [
  "Would a short walkthrough be useful next week?",
  "Open to comparing your current process with a more controlled workflow?",
  "Is consistent follow-up a priority for the team this quarter?",
] as const;

function MessageDemo() {
  const [mode, setMode] = useState<"original" | "assisted">("assisted");
  const [voice, setVoice] = useState(0);
  const [variant, setVariant] = useState(0);
  const [preview, setPreview] = useState<"desktop" | "mobile">("desktop");
  const [approved, setApproved] = useState(false);
  const selectedVoice = VOICE_OPTIONS[voice];

  return (
    <div
      className={`${styles.composeMock} ${
        preview === "mobile" ? styles.mobileComposeMock : ""
      }`}
    >
      <div className={styles.mockTop}>
        <span>AI-assisted message workspace</span>
        <span className={styles.exampleBadge}>Interactive example</span>
      </div>
      <div className={styles.messageDemoControls}>
        <div>
          <span>Draft</span>
          <div role="group" aria-label="Draft comparison">
            {(["original", "assisted"] as const).map((item) => (
              <button
                key={item}
                type="button"
                aria-pressed={mode === item}
                onClick={() => {
                  setMode(item);
                  setApproved(false);
                }}
              >
                {item === "original" ? "Before AI" : "AI-assisted"}
              </button>
            ))}
          </div>
        </div>
        <div>
          <span>Preview</span>
          <div role="group" aria-label="Message preview size">
            {(["desktop", "mobile"] as const).map((item) => (
              <button
                key={item}
                type="button"
                aria-pressed={preview === item}
                onClick={() => setPreview(item)}
              >
                {item === "desktop" ? "Computer" : "Phone"}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className={styles.voicePicker}>
        <span>Brand voice</span>
        <div role="group" aria-label="Example brand voice">
          {VOICE_OPTIONS.map((item, index) => (
            <button
              key={item.label}
              type="button"
              aria-pressed={voice === index}
              onClick={() => {
                setVoice(index);
                setMode("assisted");
                setApproved(false);
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>
      <div className={styles.mockMeta}>
        <div>
          <small>Active voice</small>
          <strong>
            {mode === "assisted"
              ? selectedVoice.descriptor
              : "No voice profile applied"}
          </strong>
        </div>
        <span className={styles.aiStatus}>
          <i />
          {mode === "assisted" ? "AI assist on" : "Original draft"}
        </span>
      </div>
      <div className={styles.subjectLine}>
        <small>Subject</small>
        <strong>
          {mode === "assisted"
            ? "A quick question about Harbor Studio"
            : "Checking in"}
        </strong>
      </div>
      <div className={styles.messageBody} aria-live="polite">
        <p>Hi Maya,</p>
        {mode === "assisted" ? (
          <>
            <p>
              {selectedVoice.beforeCompany}{" "}
              <mark className={styles.personalizedField}>Harbor Studio</mark>{" "}
              {selectedVoice.afterCompany}
            </p>
            <p>{VARIANT_ENDINGS[variant]}</p>
          </>
        ) : (
          <>
            <p>
              I wanted to reach out and tell you about our email outreach
              product. It has AI features and can help your team.
            </p>
            <p>Do you have time to chat?</p>
          </>
        )}
        <p>Matthew</p>
      </div>
      <div className={styles.variantBar}>
        <div
          className={styles.variantPicker}
          role="group"
          aria-label="Message variant"
        >
          {VARIANT_ENDINGS.map((_, index) => (
            <button
              key={index}
              type="button"
              aria-pressed={variant === index}
              onClick={() => {
                setVariant(index);
                setMode("assisted");
                setApproved(false);
              }}
            >
              {String.fromCharCode(65 + index)}
            </button>
          ))}
        </div>
        <span className={styles.variantCheck}>
          <Check size={12} />
          {approved ? "Approved by reviewer" : "Human review required"}
        </span>
        <button
          type="button"
          onClick={() => setApproved((current) => !current)}
        >
          {approved ? "Return to review" : "Approve draft"}
        </button>
      </div>
    </div>
  );
}

const REPORT_EXAMPLES = {
  founders: {
    name: "Northeast founders",
    metrics: {
      7: [
        ["Sent", "36", "of 48 prepared"],
        ["Replies", "4", "11.1% of sent"],
        ["Interested", "2", "50% of replies"],
        ["Opt-outs", "1", "follow-ups stopped"],
      ],
      30: [
        ["Sent", "128", "of 180 prepared"],
        ["Replies", "9", "7.0% of sent"],
        ["Interested", "4", "44% of replies"],
        ["Opt-outs", "2", "follow-ups stopped"],
      ],
    },
  },
  agencies: {
    name: "Agency operations",
    metrics: {
      7: [
        ["Sent", "28", "of 35 prepared"],
        ["Replies", "5", "17.9% of sent"],
        ["Interested", "2", "40% of replies"],
        ["Opt-outs", "0", "none recorded"],
      ],
      30: [
        ["Sent", "94", "of 120 prepared"],
        ["Replies", "11", "11.7% of sent"],
        ["Interested", "3", "27% of replies"],
        ["Opt-outs", "1", "follow-ups stopped"],
      ],
    },
  },
} as const;

function OperationsDemo() {
  const [view, setView] = useState<"pacing" | "reporting">("pacing");
  const [pace, setPace] = useState(40);
  const [testMode, setTestMode] = useState(true);
  const [campaign, setCampaign] =
    useState<keyof typeof REPORT_EXAMPLES>("founders");
  const [windowDays, setWindowDays] = useState<7 | 30>(30);
  const [replyOpen, setReplyOpen] = useState(false);
  const report = REPORT_EXAMPLES[campaign];
  const reportMetrics = report.metrics[windowDays];

  return (
    <div className={styles.operationsDemo}>
      <div
        className={styles.operationsTabs}
        role="group"
        aria-label="Product controls demo"
      >
        <button
          type="button"
          aria-pressed={view === "pacing"}
          onClick={() => setView("pacing")}
        >
          Sending controls
        </button>
        <button
          type="button"
          aria-pressed={view === "reporting"}
          onClick={() => setView("reporting")}
        >
          Replies and reporting
        </button>
      </div>

      {view === "pacing" ? (
        <div className={styles.pacingDemo}>
          <div className={styles.demoExplanation}>
            <span className={styles.exampleBadge}>Interactive example</span>
            <h3>Choose a deliberate pace before anything sends.</h3>
            <p>
              Provider limits are ceilings, not a universal target. Cadence
              makes the working window, spacing, suppression state, and
              workspace ceiling visible before launch.
            </p>
            <label htmlFor="demo-pace">
              Example daily pace
              <output>{pace} messages</output>
            </label>
            <input
              id="demo-pace"
              type="range"
              min="15"
              max="60"
              step="5"
              value={pace}
              aria-valuetext={`${pace} example messages per day`}
              onChange={(event) => setPace(Number(event.target.value))}
            />
            <small>
              This example control does not send email or change a real
              account.
            </small>
          </div>
          <div className={styles.controlBoard}>
            <div className={styles.controlBoardTop}>
              <div>
                <small>Launch readiness</small>
                <strong>
                  {testMode ? "Rehearsal mode" : "Approval required"}
                </strong>
              </div>
              <button
                type="button"
                aria-pressed={testMode}
                onClick={() => setTestMode((current) => !current)}
              >
                <span />
                Test mode {testMode ? "on" : "off"}
              </button>
            </div>
            {[
              ["Connected Gmail", "Ready"],
              ["Suppression check", "Passed"],
              ["Sending window", "9:00 AM to 4:00 PM"],
              ["Minimum spacing", "6 minutes"],
              ["Selected pace", `${pace} of 60`],
            ].map(([label, value]) => (
              <div className={styles.controlBoardRow} key={label}>
                <span>
                  <Check size={15} />
                </span>
                <strong>{label}</strong>
                <small>{value}</small>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className={styles.reportingDemo}>
          <div className={styles.reportControls}>
            <div>
              <span>Campaign</span>
              <div role="group" aria-label="Example campaign">
                {(Object.keys(REPORT_EXAMPLES) as Array<
                  keyof typeof REPORT_EXAMPLES
                >).map((key) => (
                  <button
                    key={key}
                    type="button"
                    aria-pressed={campaign === key}
                    onClick={() => setCampaign(key)}
                  >
                    {REPORT_EXAMPLES[key].name}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <span>Date range</span>
              <div role="group" aria-label="Example reporting range">
                {([7, 30] as const).map((days) => (
                  <button
                    key={days}
                    type="button"
                    aria-pressed={windowDays === days}
                    onClick={() => setWindowDays(days)}
                  >
                    {days} days
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className={styles.reportBody}>
            <div>
              <span className={styles.exampleBadge}>
                Example data, last {windowDays} days
              </span>
              <h3>{report.name}</h3>
              <div className={styles.reportMetricGrid} aria-live="polite">
                {reportMetrics.map(([label, value, detail]) => (
                  <div key={label}>
                    <span>{label}</span>
                    <strong>{value}</strong>
                    <small>{detail}</small>
                  </div>
                ))}
              </div>
              <p className={styles.trackingCaveat}>
                Open tracking is intentionally secondary because image
                blocking and privacy preloading can distort the signal.
              </p>
            </div>
            <div className={styles.pipelineCard}>
              <small>Reply to next step</small>
              <strong>Jordan Reyes</strong>
              <p>“Can you send the details and a few times next week?”</p>
              <div className={styles.pipelineTags}>
                <span>Interested</span>
                <span>Follow-up stopped</span>
              </div>
              <button
                type="button"
                aria-expanded={replyOpen}
                onClick={() => setReplyOpen((current) => !current)}
              >
                {replyOpen ? "Close example reply" : "Open example reply"}
              </button>
              {replyOpen && (
                <div className={styles.replyDraft} aria-live="polite">
                  <small>Suggested next step</small>
                  <p>
                    Reply in the original Gmail thread, answer the onboarding
                    question, and offer two specific meeting times.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

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
            <a href="#features">Why Cadence</a>
            <a href="#controls">Product demo</a>
            <a href="#pricing">Pricing</a>
            <a href="#trust">Trust</a>
          </div>
          <div className={styles.navActions}>
            <a className={styles.login} href="/sign-in">
              Log in
            </a>
            <PilotLink className={styles.navPilot}>
              Request a pilot <Arrow />
            </PilotLink>
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
                AI-powered Gmail outreach with human control
              </span>
              <h1>Turn Gmail outreach into qualified conversations.</h1>
              <p className={styles.heroLead}>
                Cadence turns lead lists into human-reviewed campaigns, sends
                them at a deliberate pace through Gmail, and keeps replies and
                next steps organized. AI accelerates the work while you stay
                in control.
              </p>
              <div
                className={styles.pilotAnchor}
                id={PILOT_TARGET_ID}
                data-pilot-request
              >
                <WaitField
                  source="hero"
                  note="Request a managed pilot. No credit card and no open signup."
                />
              </div>
              <div className={styles.heroFoot}>
                <a href="#workflow">
                  Explore the workflow <Arrow />
                </a>
                <span>
                  Your Gmail. Your review. Your sending pace.
                </span>
              </div>
            </div>

            <HeroDemo />

            <div className={styles.proofBar}>
              {[
                ["Gmail-connected", "Keep real conversations in your inbox"],
                ["Human reviewed", "Approve messages before scheduling"],
                ["Visible safeguards", "Pacing and suppressions stay in view"],
                ["Pipeline focused", "See which replies need the next step"],
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
              <span className={styles.eyebrow}>
                A better outreach operating system
              </span>
              <h2>Consistent follow-up without turning email into noise.</h2>
              <p>
                Replace the spreadsheet, scattered drafts, manual send queue,
                and disconnected reply tracker with one clear path from lead
                list to qualified conversation.
              </p>
            </div>
            <div className={styles.outcomeGrid}>
              {[
                [
                  "Prepare campaigns faster",
                  "Import leads, catch missing context, draft with AI, and review variants without rebuilding the same process for every campaign.",
                ],
                [
                  "Protect the human touch",
                  "Use saved brand voice and practical personalization, then keep a person responsible for every final message and claim.",
                ],
                [
                  "Focus on the replies that matter",
                  "Campaign health, reply intent, and stopped follow-ups make the next useful action easier to find.",
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
              <span className={styles.eyebrow}>From list to next step</span>
              <h2>Do the repetitive work once. Keep the judgment human.</h2>
              <p>
                Cadence makes every handoff visible: what AI prepared, what
                your team approved, what is scheduled, and which replies are
                ready to move forward.
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
              <MessageDemo />
            </div>
          </div>
        </section>

        <section className={styles.featuresSection} id="features">
          <div className={styles.shell}>
            <div className={styles.sectionHeading}>
              <span className={styles.eyebrow}>Why teams choose Cadence</span>
              <h2>Everything needed to run thoughtful outreach as a system.</h2>
              <p>
                Move faster with AI, stay accountable with visible controls,
                and measure progress without pretending every email signal is
                equally reliable.
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

        <section className={styles.controlsSection} id="controls">
          <div className={styles.shell}>
            <div className={styles.sectionHeading}>
              <span className={styles.eyebrow}>Control creates confidence</span>
              <h2>See the safeguards and outcomes in the same workspace.</h2>
              <p>
                Explore how Cadence helps a team choose its pace, verify launch
                readiness, understand campaign performance, and move a useful
                reply toward pipeline.
              </p>
            </div>
            <OperationsDemo />
          </div>
        </section>

        <section className={styles.trustSection} id="trust">
          <div className={styles.shell}>
            <div className={styles.trustLayout}>
              <div className={styles.trustCopy}>
                <span className={styles.eyebrow}>
                  Trust is part of the workflow
                </span>
                <h2>Grow outreach without hiding the tradeoffs.</h2>
                <p>
                  No platform can guarantee inbox placement or replies.
                  Cadence gives your team practical controls for pacing,
                  consent, access, duplicate-send prevention, and campaign
                  review so avoidable risk is harder to ignore.
                </p>
                <PilotLink>
                  Discuss a managed pilot <Arrow />
                </PilotLink>
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
              <h2>Start with the workflow your team can actually use.</h2>
              <p>
                Choose a focused solo workflow or a shared team operating
                view. We confirm fit, limits, onboarding, and payment terms
                before billing is activated.
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
                  <PilotLink>
                    {tier.cta} <Arrow />
                  </PilotLink>
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
              <h2>Know exactly what Cadence does and does not promise.</h2>
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
              <h2>Make your next campaign easier to run and act on.</h2>
              <p>
                Bring a real audience and goal. We will review fit, explain
                the safety model, and help your team build a responsible path
                from first draft to qualified conversation.
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
            <p>
              AI-powered Gmail outreach for consistent, human-reviewed growth.
            </p>
          </div>
          <div className={styles.footerLinks}>
            <a href="#workflow">How it works</a>
            <a href="#features">Why Cadence</a>
            <a href="#controls">Product demo</a>
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
