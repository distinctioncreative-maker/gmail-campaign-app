"use client";

import { useState } from "react";

const CHECKS: Array<{ id: string; label: string; description: string }> = [
  { id: "gmail-connection", label: "Gmail connection", description: "Confirms your Gmail is connected." },
  { id: "profile-complete", label: "Sender profile", description: "Checks your required sending details." },
  { id: "send-test-email", label: "Send a test email", description: "Sends one email to yourself." },
  { id: "personalization", label: "Personalized email", description: "Fills placeholders with example data." },
  { id: "parser", label: "Salesforce paste parser", description: "Parses a sample lead list." },
  { id: "reply-detection", label: "Reply detection", description: "Spots replies and unsubscribes." },
  { id: "bounce-detection", label: "Bounce detection", description: "Spots delivery failures." },
];

type Status = "idle" | "running" | "pass" | "fail";

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
        className="mb-4 rounded-xl bg-primary px-5 py-2.5 font-medium text-white hover:bg-primary-hover"
      >
        Run all checks
      </button>

      <div className="grid gap-3 sm:grid-cols-2">
        {CHECKS.map((c) => {
          const st = status[c.id] ?? "idle";
          return (
            <div key={c.id} className="rounded-2xl bg-white p-5 shadow-sm">
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-medium">{c.label}</p>
                  <p className="mt-1 text-sm text-slate-500">{c.description}</p>
                </div>
                <span aria-hidden className="text-xl">
                  {st === "pass" ? "✅" : st === "fail" ? "❌" : st === "running" ? "⏳" : "⚪"}
                </span>
              </div>
              {detail[c.id] && (
                <p
                  className={`mt-2 rounded-lg p-2 text-xs ${
                    st === "fail" ? "bg-red-50 text-red-700" : "bg-green-50 text-green-700"
                  }`}
                >
                  {detail[c.id]}
                </p>
              )}
              <button
                onClick={() => run(c.id)}
                disabled={st === "running"}
                className="mt-3 rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
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
