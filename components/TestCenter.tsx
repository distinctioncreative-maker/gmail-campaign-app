"use client";

import { useState } from "react";
import { Icon, type IconName } from "@/components/ui/Icon";

interface Check {
  id: string;
  label: string;
  /** What this check actually does. */
  verifies: string;
  /** What a pass tells you. */
  passMeans: string;
  /** What to do if it fails. */
  onFailure: string;
}

const CHECKS: Check[] = [
  {
    id: "gmail-connection",
    label: "Gmail connection",
    verifies: "Confirms your Gmail account is connected and authorized.",
    passMeans: "Sends can go out through your real Gmail account.",
    onFailure: "Go to Settings and reconnect Gmail.",
  },
  {
    id: "profile-complete",
    label: "Sender profile",
    verifies: "Checks your required sending details (name, address, opt-out line) are filled in.",
    passMeans: "Every email you send will include what's legally required.",
    onFailure: "Go to Settings and fill in whatever's listed as missing.",
  },
  {
    id: "send-test-email",
    label: "Send a test email",
    verifies: "Sends one real email, only to your own address.",
    passMeans: "Sending genuinely works end to end: check your inbox.",
    onFailure: "If it doesn't arrive within a minute, check Settings for a Gmail connection problem.",
  },
  {
    id: "personalization",
    label: "Personalized email",
    verifies: "Fills a sample template's placeholders with your real profile data.",
    passMeans: "Placeholders like {{first_name}} will resolve correctly on real sends.",
    onFailure: "Complete your sender profile in Settings: that's usually the unfilled placeholder.",
  },
  {
    id: "parser",
    label: "Salesforce paste parser",
    verifies: "Parses a sample Salesforce lead list, including a record with a missing amount.",
    passMeans: "Pasting your own Salesforce rows on the Leads page will parse correctly.",
    onFailure: "This is an internal check, not something in your data: contact support if it fails.",
  },
  {
    id: "reply-detection",
    label: "Reply detection",
    verifies: "Classifies a sample human reply and a sample unsubscribe request.",
    passMeans: "Real replies and unsubscribe requests will be classified correctly.",
    onFailure: "This is an internal check, not something in your data: contact support if it fails.",
  },
  {
    id: "bounce-detection",
    label: "Bounce detection",
    verifies: "Classifies a sample hard-bounce delivery failure message.",
    passMeans: "Real bounces will be detected and marked so you stop emailing that address.",
    onFailure: "This is an internal check, not something in your data: contact support if it fails.",
  },
];

type Status = "idle" | "running" | "pass" | "fail";

const STATUS_PRESENTATION: Record<Status, { label: string; icon: IconName; className: string }> = {
  idle: { label: "Not run", icon: "pause", className: "bg-surface-2 text-muted" },
  running: { label: "Running", icon: "hourglass", className: "bg-surface-2 text-foreground" },
  pass: { label: "Passed", icon: "check", className: "bg-success-soft text-success" },
  fail: { label: "Failed", icon: "alert", className: "bg-danger-soft text-danger" },
};

export function TestCenter() {
  const [status, setStatus] = useState<Record<string, Status>>({});
  const [detail, setDetail] = useState<Record<string, string>>({});

  async function run(id: string) {
    setStatus((s) => ({ ...s, [id]: "running" }));
    try {
      const res = await fetch(`/api/test/${id}`, { method: "POST" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Check failed.");
      setStatus((s) => ({ ...s, [id]: body.pass ? "pass" : "fail" }));
      setDetail((d) => ({ ...d, [id]: body.detail }));
    } catch (err) {
      setStatus((s) => ({ ...s, [id]: "fail" }));
      setDetail((d) => ({ ...d, [id]: err instanceof Error ? err.message : "Check failed." }));
    }
  }

  async function runAll() {
    for (const c of CHECKS) await run(c.id);
  }

  return (
    <div>
      <button
        onClick={runAll}
        className="mb-4 btn-primary px-5 py-2.5"
      >
        Run all checks
      </button>

      <div className="grid gap-3 sm:grid-cols-2">
        {CHECKS.map((c) => {
          const st = status[c.id] ?? "idle";
          const presentation = STATUS_PRESENTATION[st];
          return (
            <div key={c.id} className="card p-6 sm:p-7">
              <div className="flex items-start justify-between gap-3">
                <p className="font-medium">{c.label}</p>
                <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-1 text-[11px] font-semibold ${presentation.className}`}>
                  <Icon name={presentation.icon} size={13} aria-hidden />
                  {presentation.label}
                </span>
              </div>
              <dl className="mt-2 space-y-1 text-xs text-muted">
                <div>
                  <dt className="inline font-medium text-foreground">Verifies: </dt>
                  <dd className="inline">{c.verifies}</dd>
                </div>
                <div>
                  <dt className="inline font-medium text-foreground">Pass means: </dt>
                  <dd className="inline">{c.passMeans}</dd>
                </div>
                <div>
                  <dt className="inline font-medium text-foreground">On failure: </dt>
                  <dd className="inline">{c.onFailure}</dd>
                </div>
              </dl>
              {detail[c.id] && (
                <p
                  className={`mt-2 rounded-lg p-2 text-xs ${
                    st === "fail" ? "bg-danger-soft text-danger" : "bg-success-soft text-success"
                  }`}
                >
                  {detail[c.id]}
                </p>
              )}
              <button
                onClick={() => run(c.id)}
                disabled={st === "running"}
                className="btn-ghost mt-3 px-3 py-1.5 text-sm"
              >
                {st === "running" ? "Running…" : "Run check"}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
