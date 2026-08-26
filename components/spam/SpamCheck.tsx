"use client";

import { useMemo } from "react";
import { analyzeSpam, type SpamStatus } from "@/lib/spam/score";

const MARK: Record<SpamStatus, { icon: string; className: string }> = {
  pass: { icon: "✓", className: "bg-success-soft text-success" },
  warn: { icon: "!", className: "bg-warning-soft text-warning" },
  fail: { icon: "✕", className: "bg-danger-soft text-danger" },
};

/**
 * The score ring's colour.
 *
 * Was four off-palette literals, one of them a lime (#84cc16) that introduced a
 * third hue the palette explicitly forbids. They were also fixed values, so the
 * ring stayed light-mode bright on a dark ground. The file already used
 * `bg-success-soft text-success` correctly ten lines above, so it was
 * contradicting itself.
 *
 * Four bands collapse to three because there were never four meanings: the old
 * green and lime both said "fine".
 */
function ringColor(score: number): string {
  if (score >= 70) return "var(--success)";
  if (score >= 50) return "var(--warning)";
  return "var(--danger)";
}

/** Apple-style inbox-friendliness score for the current email content. */
export function SpamCheck({ subject, html }: { subject: string; html: string }) {
  const result = useMemo(() => {
    const blob = `${subject}\n${html}`;
    const hasUnsubscribe = /\{\{\s*unsubscribe_text\s*\}\}|\bunsubscribe\b|\bopt[\s-]?out\b/i.test(blob);
    const hasPhysicalAddress =
      /\{\{\s*physical_address\s*\}\}/i.test(blob) ||
      /\b\d{1,6}\s+[A-Za-z0-9.\s]+(?:st|street|ave|avenue|rd|road|blvd|suite|ste|dr|drive|lane|ln)\b/i.test(
        html
      );
    return analyzeSpam({ subject, html, hasUnsubscribe, hasPhysicalAddress });
  }, [subject, html]);

  const { score, grade, verdict, checks } = result;
  const radius = 34;
  const circ = 2 * Math.PI * radius;
  const dash = (score / 100) * circ;
  const color = ringColor(score);

  return (
    <div>
      <div className="flex items-center gap-5">
        <div className="relative h-24 w-24 shrink-0">
          <svg viewBox="0 0 80 80" className="h-24 w-24 -rotate-90">
            <circle cx="40" cy="40" r={radius} fill="none" stroke="var(--border)" strokeWidth="7" />
            <circle
              cx="40"
              cy="40"
              r={radius}
              fill="none"
              stroke={color}
              strokeWidth="7"
              strokeLinecap="round"
              strokeDasharray={`${dash} ${circ}`}
              style={{ transition: "stroke-dasharray 0.5s ease" }}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-2xl font-semibold tabular-nums text-foreground">{score}</span>
            <span className="text-[10px] font-medium uppercase tracking-wide text-muted">Grade {grade}</span>
          </div>
        </div>
        <div>
          <p className="text-sm font-medium text-foreground">Inbox-friendliness</p>
          <p className="mt-0.5 text-sm text-muted">{verdict}</p>
        </div>
      </div>

      <ul className="mt-5 space-y-2.5">
        {checks.map((c) => {
          const m = MARK[c.status];
          return (
            <li key={c.label} className="flex items-start gap-3">
              <span
                aria-hidden
                className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-bold ${m.className}`}
              >
                {m.icon}
              </span>
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground">
                  {c.label}
                  <span className="ml-2 font-normal text-muted">{c.detail}</span>
                </p>
                {c.status !== "pass" && c.fix && (
                  <p className="mt-0.5 text-xs text-muted">{c.fix}</p>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      <p className="mt-4 text-xs text-muted">
        This is a content guide, not a guarantee of inbox placement. Replies and a clean list matter
        most.
      </p>
    </div>
  );
}
