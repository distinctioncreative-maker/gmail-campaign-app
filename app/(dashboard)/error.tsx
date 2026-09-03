"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Icon } from "@/components/ui/Icon";

/**
 * What a signed-in person sees when a page throws.
 *
 * Without this file Next.js falls back to its own screen, which on a production
 * build is a bare "Application error" with no navigation: the sidebar is gone, so
 * the only way out of a single broken page is the browser's back button.
 *
 * The error's message is deliberately not shown. It is written by whatever threw,
 * which can be a Firestore client or a Google API wrapper, and those put document
 * paths, ids, and occasionally tokens into their messages. The digest is shown
 * instead, because that is the value that matches the server log line and turns a
 * support conversation into a lookup.
 */
export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Reaches the same structured log the server routes use, so a client-side
    // failure is not invisible just because it happened after hydration.
    console.error("[client] dashboard error", { digest: error.digest });
  }, [error]);

  return (
    <div className="mx-auto max-w-lg py-16 text-center">
      <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-lg bg-danger-soft text-danger">
        <Icon name="alert" size={22} aria-hidden />
      </span>
      <h1 className="mt-4 text-2xl font-semibold">This page could not load</h1>
      <p className="mt-2 text-muted">
        Something went wrong on our side. Nothing you were working on was lost, and no campaign was
        changed by this.
      </p>
      {error.digest ? (
        <p className="mt-3 font-mono text-xs text-muted">Reference {error.digest}</p>
      ) : null}
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        <button onClick={reset} className="btn-primary min-h-11 px-4 py-2.5 text-sm">
          Try again
        </button>
        <Link href="/home" className="btn-secondary min-h-11 px-4 py-2.5 text-sm no-underline">
          Back to Home
        </Link>
        <Link href="/help/contact" className="btn-ghost min-h-11 px-4 py-2.5 text-sm no-underline">
          Contact support
        </Link>
      </div>
    </div>
  );
}
