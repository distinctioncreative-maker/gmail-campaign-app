"use client";

import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import Link from "next/link";
import { LogoMark, Wordmark } from "@/components/ui/Logo";
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

const WORKFLOW = [
  {
    number: "01",
    title: "Start with a list that will not burn you",
    copy: "Bring a CSV, a paste, or a saved list. We strip duplicates and hold back anyone who already opted out, so bad data never touches your domain.",
  },
  {
    number: "02",
    title: "Write once, sound personal every time",
    copy: "Describe the offer and AI drafts it in your brand voice. Every email goes out personalized to that recipient, not blasted from a template.",
  },
  {
    number: "03",
    title: "Send at a pace inboxes actually trust",
    copy: "Set your hours, your daily cap, your spacing. Cadence drips sends the way a person would, which is why they land in the inbox instead of Promotions.",
  },
  {
    number: "04",
    title: "See exactly what is producing",
    copy: "Sends, bounces, opens, clicks, and replies in one view. You always know which campaign is generating pipeline and which is wasting good leads.",
  },
  {
    number: "05",
    title: "Turn replies into booked revenue",
    copy: "Every reply is sorted by intent, so your team works the hot ones first inside the real Gmail thread. Follow-ups stop the moment someone answers.",
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
    signal: ["180 usable leads", "Duplicates and suppressions resolved"],
    trackPosition: 0,
    controlIndex: 1,
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
    signal: ["Drafting with context", "Brand voice and known lead fields applied"],
    trackPosition: 1,
    controlIndex: 0,
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
    signal: ["14 edits captured", "Every message remains under human control"],
    trackPosition: 2,
    controlIndex: 0,
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
    signal: ["Next batch staged", "Working hours, spacing, and ceiling confirmed"],
    trackPosition: 3,
    controlIndex: 3,
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
    signal: ["Delivery reserved", "Final suppression and quota checks passed"],
    trackPosition: 3,
    controlIndex: 2,
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
    signal: ["Reply moved forward", "Follow-up stopped and next step surfaced"],
    trackPosition: 4,
    controlIndex: null,
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
  signal: readonly [string, string];
  trackPosition: number;
  controlIndex: number | null;
  metrics: ReadonlyArray<readonly [string, string, string]>;
}>;

const HERO_STAGE_DURATION_MS = 2300;

const HERO_MOTION_NODES = [
  { label: "Lead", icon: "leads" },
  { label: "Draft", icon: "spark" },
  { label: "Review", icon: "spark" },
  { label: "Gmail", icon: "clock" },
  { label: "Reply", icon: "reply" },
] as const satisfies ReadonlyArray<{
  label: string;
  icon: DemoGlyphKind;
}>;

const FEATURES = [
  {
    eyebrow: "Write",
    title: "A rep's email, in seconds",
    copy: "Describe the offer. AI writes it in your brand voice, personalized per lead, with subject variants to test. You approve every message before it sends.",
  },
  {
    eyebrow: "Send",
    title: "Volume without the spam folder",
    copy: "Cadence spreads sends across your day at a human rhythm and holds a hard cap. Speed that burns your domain is the expensive kind.",
  },
  {
    eyebrow: "Measure",
    title: "Know which campaign pays",
    copy: "Compare campaigns side by side on the metrics that predict revenue. Replies and clicks lead, because opens are the least honest number in email.",
  },
  {
    eyebrow: "Protect",
    title: "Compliance you cannot forget",
    copy: "Opt-outs are checked before every send and honored instantly with one click. Follow-ups stop themselves. Your list stays clean and your name stays good.",
  },
  {
    eyebrow: "Scale",
    title: "Built for a team, not a seat",
    copy: "Roles, per-rep leaderboards, and shared brand voice. Managers see the whole board while each rep's leads stay strictly their own.",
  },
  {
    eyebrow: "Land",
    title: "Deliverability, checked before you send",
    copy: "SPF, DKIM, DMARC, and sender reputation verified up front, so you find out on the dashboard rather than from a silent campaign.",
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
  const [documentVisible, setDocumentVisible] = useState(true);
  const demoRef = useRef<HTMLDivElement>(null);
  const pointerFrameRef = useRef<number | null>(null);
  const pointerPositionRef = useRef({ x: 50, y: 28 });
  const reducedMotion = useReducedMotion();
  const stage = HERO_DEMO_STAGES[activeStage];
  const autoplayActive =
    playing && visible && documentVisible && !reducedMotion;

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
    const update = () => setDocumentVisible(document.visibilityState === "visible");
    update();
    document.addEventListener("visibilitychange", update);
    return () => document.removeEventListener("visibilitychange", update);
  }, []);

  useEffect(() => {
    if (!autoplayActive) return;
    const timer = window.setTimeout(() => {
      setActiveStage((current) => (current + 1) % HERO_DEMO_STAGES.length);
    }, HERO_STAGE_DURATION_MS);
    return () => window.clearTimeout(timer);
  }, [activeStage, autoplayActive]);

  useEffect(
    () => () => {
      if (pointerFrameRef.current !== null) {
        window.cancelAnimationFrame(pointerFrameRef.current);
      }
    },
    []
  );

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

  function moveSpotlight(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.pointerType === "touch" || reducedMotion) return;
    const node = demoRef.current;
    if (!node) return;
    const rect = node.getBoundingClientRect();
    pointerPositionRef.current = {
      x: ((event.clientX - rect.left) / rect.width) * 100,
      y: ((event.clientY - rect.top) / rect.height) * 100,
    };
    if (pointerFrameRef.current !== null) return;
    pointerFrameRef.current = window.requestAnimationFrame(() => {
      node.style.setProperty(
        "--spotlight-x",
        `${pointerPositionRef.current.x.toFixed(2)}%`
      );
      node.style.setProperty(
        "--spotlight-y",
        `${pointerPositionRef.current.y.toFixed(2)}%`
      );
      pointerFrameRef.current = null;
    });
  }

  function resetSpotlight() {
    const node = demoRef.current;
    if (!node) return;
    node.style.setProperty("--spotlight-x", "72%");
    node.style.setProperty("--spotlight-y", "18%");
  }

  return (
    <div
      className={styles.productFrame}
      ref={demoRef}
      data-playing={autoplayActive ? "true" : "false"}
      onPointerMove={moveSpotlight}
      onPointerLeave={resetSpotlight}
    >
      <div className={styles.frameTop}>
        <div className={styles.frameBrand}>
          <LogoMark size={24} />
          <span>Cadence campaign command center</span>
        </div>
        <span className={styles.exampleBadge}>
          <i />
          Interactive example
        </span>
      </div>
      <div className={styles.frameBody}>
        <div className={styles.demoToolbar}>
          <span className={styles.liveWalkthrough}>
            <i />
            {autoplayActive ? "Live walkthrough" : "Walkthrough paused"}
            <small>
              Step {activeStage + 1} of {HERO_DEMO_STAGES.length}
            </small>
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
              {activeStage === index && (
                <i
                  className={styles.stageClock}
                  key={`${activeStage}-${visible}-${documentVisible}`}
                  aria-hidden
                />
              )}
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

        <div className={styles.motionRail} aria-hidden="true">
          <div className={styles.motionTrack}>
            <span
              style={{
                width: `${
                  (stage.trackPosition / (HERO_MOTION_NODES.length - 1)) * 100
                }%`,
              }}
            />
            <i
              style={{
                left: `${
                  (stage.trackPosition / (HERO_MOTION_NODES.length - 1)) * 100
                }%`,
              }}
            />
          </div>
          <div className={styles.motionNodes}>
            {HERO_MOTION_NODES.map((node, index) => (
              <span
                key={node.label}
                className={`${styles.motionNode} ${
                  index <= stage.trackPosition ? styles.motionNodeComplete : ""
                } ${
                  index === stage.trackPosition ? styles.motionNodeActive : ""
                }`}
              >
                <i>
                  <DemoGlyph kind={node.icon} />
                </i>
                <small>{node.label}</small>
              </span>
            ))}
          </div>
        </div>

        <div
          key={stage.label}
          className={styles.demoStagePanel}
          id="hero-demo-panel"
          role="tabpanel"
          aria-labelledby={`hero-demo-tab-${activeStage}`}
          aria-live={autoplayActive ? "off" : "polite"}
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

        <div className={styles.stageSignal} key={`${stage.label}-signal`}>
          <span className={styles.stageSignalIcon}>
            <DemoGlyph kind={stage.icon} />
          </span>
          <span>
            <small>Live action</small>
            <strong>{stage.signal[0]}</strong>
          </span>
          <p>{stage.signal[1]}</p>
          <i aria-hidden />
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
              <div
                className={`${styles.safetyRow} ${
                  stage.controlIndex === index ? styles.safetyRowActive : ""
                }`}
                key={label}
              >
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
        <strong
          key={`${mode}-${voice}-subject`}
          className={mode === "assisted" ? styles.personalizedSubject : ""}
        >
          {mode === "assisted"
            ? "A quick question about Harbor Studio"
            : "Checking in"}
          {mode === "assisted" && (
            <span className={styles.typingCaret} aria-hidden />
          )}
        </strong>
      </div>
      <div
        className={styles.messageBody}
        key={`${mode}-${voice}-${variant}`}
        aria-live="polite"
      >
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
      {mode === "assisted" && (
        <div className={styles.assistNote} aria-hidden>
          <span className={styles.assistIcon}>
            <DemoGlyph kind="spark" />
          </span>
          <span>
            <strong>Brand voice applied</strong>
            <small>Context checked and variant ready for review</small>
          </span>
          <span className={styles.assistCheck}>
            <Check size={14} />
          </span>
        </div>
      )}
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
            <div className={styles.launchSequence} aria-hidden>
              {["Review", "Reserve", "Deliver"].map((label) => (
                <span key={label}>{label}</span>
              ))}
              <i />
            </div>
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
              <div
                className={styles.reportMetricGrid}
                key={`${campaign}-${windowDays}`}
                aria-live="polite"
              >
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
            <Wordmark />
          </Link>
          <div className={styles.navLinks}>
            <a href="#workflow">Workflow</a>
            <a href="#features">Product</a>
            <a href="#controls">Live demo</a>
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
                Gmail outreach with deliberate control
              </span>
              <h1>
                Your list is worth more than you are getting from it.
              </h1>
              <p className={styles.heroLead}>
                Cadence helps you prepare and schedule personalized campaigns
                from your own Gmail, with human-reviewed AI, measured pacing,
                and every reply organized for the next step.
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
                Connect your own Gmail. Nothing sends until you review it.
              </p>
              <div className={styles.heroFoot}>
                <a href="#workflow">
                  Explore the workflow <Arrow />
                </a>
                <span>
                  Human-reviewed by design. Gmail-connected. Built for the next step.
                </span>
              </div>
            </div>

            <HeroDemo />

            <div className={styles.proofBar}>
              {[
                ["Your real Gmail", "Not a relay. Replies land in your thread."],
                ["Built for deliverability", "Pacing and domain checks before launch."],
                ["Personal at scale", "Every email written for that one recipient."],
                ["Replies ranked", "Your team works the hot ones first."],
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
            <div className={styles.sectionHeading} data-reveal>
              <span className={styles.eyebrow}>
                Why teams switch
              </span>
              <h2>Turn more of your list into real conversations.</h2>
              <p>
                Most outreach fails for three reasons. Cadence is built to
                remove all three.
              </p>
            </div>
            <div className={styles.outcomeGrid} data-reveal>
              {[
                [
                  "It never reached them",
                  "High-volume blasts can damage sender reputation. Cadence uses your connected Gmail, measured pacing, and preflight domain checks to help you send more responsibly.",
                ],
                [
                  "It read like a template",
                  "Generic email is easy to ignore. AI-assisted drafts use your brand voice and lead context, while your team stays responsible for review and approval.",
                ],
                [
                  "The reply went cold",
                  "Interest can fade in a crowded inbox. Cadence groups replies by intent and keeps follow-up in the original Gmail thread so the right conversations surface sooner.",
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

        <section className={styles.controlsSection} id="controls">
          <div className={styles.shell}>
            <div className={styles.sectionHeading} data-reveal>
              <span className={styles.eyebrow}>See it work</span>
              <h2>Set the pace. Watch the pipeline build.</h2>
              <p>
                Every control that protects your domain, and every number that
                tells you it is working.
              </p>
            </div>
            <div data-reveal>
              <OperationsDemo />
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
