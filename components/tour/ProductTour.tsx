"use client";

/* This overlay measures live DOM elements and positions itself from effects,
   which inherently sets state after layout: the lint rule doesn't apply. */
/* eslint-disable react-hooks/set-state-in-effect */
import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { Icon, type IconName } from "@/components/ui/Icon";

interface Step {
  selector?: string; // CSS selector to spotlight; omitted = centered card
  title: string;
  body: string;
  icon: IconName;
}

const STORAGE_KEY = "outreach.tourSeen.v1";

const STEPS: Step[] = [
  {
    icon: "sparkles",
    title: "Welcome to Cadence",
    body: "A quick 60-second tour of where everything lives. You can skip any time, and replay this from the Help page.",
  },
  {
    selector: '[data-tour="nav-leads"]',
    icon: "users",
    title: "1. Leads",
    body: "Start here. Paste a lead list from Salesforce or upload a CSV: the app checks for duplicates and opt-outs automatically.",
  },
  {
    selector: '[data-tour="nav-templates"]',
    icon: "mail",
    title: "2. Templates",
    body: "Write a reusable email. Drop in placeholders like {{first_name}} and your {{signature}}, and each recipient gets a personalized copy.",
  },
  {
    selector: '[data-tour="nav-sequences"]',
    icon: "repeat",
    title: "3. Follow-Ups",
    body: "Optional: build a sequence of automatic follow-ups. They stop the moment someone replies.",
  },
  {
    selector: '[data-tour="nav-campaigns"]',
    icon: "rocket",
    title: "4. Campaigns",
    body: "Put it all together. A guided wizard walks you through leads, email, schedule, and a safety review before anything sends.",
  },
  {
    selector: '[data-tour="notif-bell"]',
    icon: "bell",
    title: "Replies & alerts",
    body: "When someone replies, unsubscribes, or an email bounces, you'll see it here.",
  },
  {
    selector: '[data-tour="nav-help"]',
    icon: "help",
    title: "Need help?",
    body: "The Help page has guides, a Test Center to check everything works, and a button to replay this tour. You're all set!",
  },
];

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

function TourSignal({ index }: { index: number }) {
  return (
    <div className="tour-signal" aria-hidden>
      <span className="tour-signal-orbit" />
      <span className="tour-signal-core"><Icon name={STEPS[index]?.icon ?? "sparkles"} size={18} /></span>
      <span className="tour-signal-pulse" />
    </div>
  );
}

export function ProductTour({ autoStart = true }: { autoStart?: boolean }) {
  const pathname = usePathname();
  const [active, setActive] = useState(false);
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  const step = STEPS[index];

  const measure = useCallback(() => {
    if (!step?.selector) {
      setRect(null);
      return;
    }
    const el = document.querySelector(step.selector);
    if (!el) {
      setRect(null);
      return;
    }
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) {
      setRect(null);
      return;
    }
    setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
  }, [step]);

  useEffect(() => {
    if (active) measure();
  }, [active, index, measure]);

  useEffect(() => {
    if (!active) return;
    const onResize = () => measure();
    window.addEventListener("resize", onResize);
    window.addEventListener("scroll", onResize, true);
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("scroll", onResize, true);
    };
  }, [active, measure]);

  // Auto-start once, and listen for a manual replay trigger.
  useEffect(() => {
    const start = () => {
      setIndex(0);
      setActive(true);
    };
    if (typeof window !== "undefined") {
      if (autoStart && pathname !== "/onboarding" && !localStorage.getItem(STORAGE_KEY)) {
        // Small delay so the layout has painted.
        const t = setTimeout(start, 700);
        window.addEventListener("outreach:start-tour", start);
        return () => {
          clearTimeout(t);
          window.removeEventListener("outreach:start-tour", start);
        };
      }
      window.addEventListener("outreach:start-tour", start);
      return () => window.removeEventListener("outreach:start-tour", start);
    }
  }, [autoStart, pathname]);

  useEffect(() => {
    if (!active) return;
    previousFocusRef.current = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialogRef.current?.querySelector<HTMLButtonElement>("button")?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        finish();
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusable = [...dialogRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])'
      )];
      const first = focusable[0];
      const last = focusable.at(-1);
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
      previousFocusRef.current?.focus();
    };
  }, [active]);

  function finish() {
    localStorage.setItem(STORAGE_KEY, "1");
    setActive(false);
  }

  if (!active || !step) return null;

  const pad = 8;
  const spotlight: Rect | null = rect
    ? {
        top: rect.top - pad,
        left: rect.left - pad,
        width: rect.width + pad * 2,
        height: rect.height + pad * 2,
      }
    : null;

  // Tooltip position: to the right of a spotlighted element, else centered.
  const tooltipStyle: React.CSSProperties = spotlight
    ? {
        top: Math.max(12, Math.min(spotlight.top, window.innerHeight - 240)),
        left: Math.max(12, Math.min(spotlight.left + spotlight.width + 16, window.innerWidth - 340)),
      }
    : {
        top: "50%",
        left: "50%",
        transform: "translate(-50%, -50%)",
      };

  return (
    <div ref={dialogRef} className="fixed inset-0 z-overlay" role="dialog" aria-modal="true" aria-label="Product tour">
      {/* Dimmed backdrop with an optional spotlight cutout. */}
      {spotlight ? (
        <div
          className="tour-spotlight pointer-events-none absolute rounded-lg transition-all duration-300"
          style={{
            top: spotlight.top,
            left: spotlight.left,
            width: spotlight.width,
            height: spotlight.height,
          }}
        />
      ) : (
        <div className="absolute inset-0 bg-overlay" />
      )}

      <div
        className="absolute w-80 max-w-[calc(100vw-24px)] overflow-hidden rounded-2xl border border-border bg-surface shadow-2xl"
        style={tooltipStyle}
      >
        <div className="tour-card-accent h-1" aria-hidden />
        <div className="p-5">
          <div className="flex items-start gap-4">
            <TourSignal index={index} />
            <div>
            <p className="font-semibold text-foreground">{step.title}</p>
            <p className="mt-1 text-sm leading-6 text-muted">{step.body}</p>
            </div>
          </div>

          <div className="mt-5 flex gap-1" aria-hidden>
            {STEPS.map((candidate, position) => (
              <span
                key={candidate.title}
                className={`h-1 flex-1 rounded-full transition-colors ${position <= index ? "bg-primary" : "bg-border"}`}
              />
            ))}
          </div>

          <div className="mt-4 flex items-center justify-between gap-3">
          <button onClick={finish} className="min-h-11 rounded-lg px-2 text-xs text-muted hover:bg-surface-2 hover:text-foreground">
            Skip tour
          </button>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted">
              {index + 1} / {STEPS.length}
            </span>
            {index > 0 && (
              <button
                onClick={() => setIndex((i) => i - 1)}
                className="min-h-11 rounded-lg px-3 py-2 text-sm text-muted hover:bg-surface-2"
              >
                Back
              </button>
            )}
            {index < STEPS.length - 1 ? (
              <button onClick={() => setIndex((i) => i + 1)} className="btn-primary min-h-11 px-4 py-2 text-sm">
                Next
              </button>
            ) : (
              <button onClick={finish} className="btn-primary min-h-11 px-4 py-2 text-sm">
                Done
              </button>
            )}
          </div>
        </div>
        </div>
      </div>
    </div>
  );
}
