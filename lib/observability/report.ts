import "server-only";
import { env } from "@/lib/env";

export interface ErrorContext {
  /** Where it happened, e.g. "api" or a route path. */
  scope?: string;
  /** A short classifier, e.g. the error name. */
  kind?: string;
}

export interface ErrorSummary {
  name: string;
  message: string;
  scope: string;
  kind: string;
  at: string;
}

/**
 * Shape an error into a compact, log-safe summary. Pure and testable. The
 * message is truncated so a stray large payload can't flood logs; stack traces
 * are never included (they can carry sensitive data and never reach clients).
 */
export function errorSummary(err: unknown, ctx: ErrorContext = {}): ErrorSummary {
  const isErr = err instanceof Error;
  return {
    name: isErr ? err.name || "Error" : "NonError",
    message: (isErr ? err.message : String(err)).slice(0, 300),
    scope: ctx.scope ?? "app",
    kind: ctx.kind ?? (isErr ? err.name : "unknown"),
    at: new Date().toISOString(),
  };
}

/**
 * Record an unexpected error: always a structured console line (picked up by
 * Cloud Run logs), plus a best-effort webhook post when ERROR_WEBHOOK_URL is
 * configured (Slack/Sentry-ingest/etc.). Never throws and never blocks the
 * request — webhook failures are swallowed.
 */
export function reportError(err: unknown, ctx: ErrorContext = {}): void {
  const summary = errorSummary(err, ctx);
  console.error("[error]", JSON.stringify(summary));

  const url = env.ERROR_WEBHOOK_URL.trim();
  if (!url) return;
  void fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: `⚠️ ${summary.scope}: ${summary.name} — ${summary.message}`, summary }),
  }).catch(() => {
    /* Alerting is best-effort; never let it affect the request. */
  });
}
