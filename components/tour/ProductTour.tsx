"use client";

/* This overlay measures live DOM elements and positions itself from effects,
   which inherently sets state after layout — the lint rule doesn't apply. */
/* eslint-disable react-hooks/set-state-in-effect */
import { useCallback, useEffect, useState } from "react";

interface Step {
  selector?: string; // CSS selector to spotlight; omitted = centered card
  title: string;
  body: string;
  emoji: string;
}

const STORAGE_KEY = "outreach.tourSeen.v1";

const STEPS: Step[] = [
  {
    emoji: "👋",
    title: "Welcome to MassLeader",
    body: "A quick 60-second tour of where everything lives. You can skip any time, and replay this from the Help page.",
  },
  {
    selector: '[data-tour="nav-leads"]',
    emoji: "👥",
    title: "1. Leads",
    body: "Start here. Paste a lead list from Salesforce or upload a CSV — the app checks for duplicates and opt-outs automatically.",
  },
  {
    selector: '[data-tour="nav-templates"]',
    emoji: "✉️",
    title: "2. Templates",
    body: "Write a reusable email. Drop in placeholders like {{first_name}} and your {{signature}}, and each recipient gets a personalized copy.",
  },
  {
    selector: '[data-tour="nav-sequences"]',
    emoji: "🔁",
    title: "3. Follow-Ups",
    body: "Optional: build a sequence of automatic follow-ups. They stop the moment someone replies.",
  },
  {
    selector: '[data-tour="nav-campaigns"]',
    emoji: "🚀",
    title: "4. Campaigns",
    body: "Put it all together. A guided wizard walks you through leads, email, schedule, and a safety review before anything sends.",
  },
  {
    selector: '[data-tour="notif-bell"]',
    emoji: "🔔",
    title: "Replies & alerts",
    body: "When someone replies, unsubscribes, or an email bounces, you'll see it here.",
  },
  {
    selector: '[data-tour="nav-help"]',
    emoji: "💬",
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

export function ProductTour() {
  const [active, setActive] = useState(false);
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);

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
      if (!localStorage.getItem(STORAGE_KEY)) {
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
  }, []);

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
        left: Math.min(spotlight.left + spotlight.width + 16, window.innerWidth - 340),
      }
    : {
        top: "50%",
        left: "50%",
        transform: "translate(-50%, -50%)",
      };

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="Product tour">
      {/* Dimmed backdrop with an optional spotlight cutout. */}
      {spotlight ? (
        <div
          className="pointer-events-none absolute rounded-xl transition-all duration-200"
          style={{
            top: spotlight.top,
            left: spotlight.left,
            width: spotlight.width,
            height: spotlight.height,
            boxShadow: "0 0 0 9999px rgba(15,23,42,0.55)",
            border: "2px solid rgba(255,255,255,0.9)",
          }}
        />
      ) : (
        <div className="absolute inset-0 bg-slate-900/55" />
      )}

      <div
        className="absolute w-80 max-w-[calc(100vw-24px)] rounded-2xl bg-white p-5 shadow-2xl"
        style={tooltipStyle}
      >
        <div className="flex items-start gap-3">
          <span aria-hidden className="text-2xl">{step.emoji}</span>
          <div>
            <p className="font-semibold text-slate-900">{step.title}</p>
            <p className="mt-1 text-sm text-slate-600">{step.body}</p>
          </div>
        </div>

        <div className="mt-4 flex items-center justify-between">
          <button onClick={finish} className="text-xs text-slate-400 hover:text-slate-600">
            Skip tour
          </button>
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400">
              {index + 1} / {STEPS.length}
            </span>
            {index > 0 && (
              <button
                onClick={() => setIndex((i) => i - 1)}
                className="rounded-lg px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100"
              >
                Back
              </button>
            )}
            {index < STEPS.length - 1 ? (
              <button onClick={() => setIndex((i) => i + 1)} className="btn-primary px-4 py-1.5 text-sm">
                Next
              </button>
            ) : (
              <button onClick={finish} className="btn-primary px-4 py-1.5 text-sm">
                Done
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
