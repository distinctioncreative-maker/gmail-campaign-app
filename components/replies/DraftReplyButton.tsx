"use client";

import { useState } from "react";
import { fetchJson } from "@/lib/fetchJson";
import { useToast } from "@/components/ui/UIProviders";

/**
 * "Draft reply with AI" — generates an on-brand reply to a prospect and drops
 * it into the Gmail thread as a draft (never auto-sent). Shown only when the
 * AI writer is configured on the server.
 */
export function DraftReplyButton({
  campaignId,
  recipientId,
  threadId,
  compact = false,
}: {
  campaignId: string;
  recipientId: string;
  threadId: string | null;
  compact?: boolean;
}) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  async function draft() {
    if (!threadId) {
      toast("Open this one in Gmail to reply — no thread is linked yet.", "error");
      return;
    }
    setBusy(true);
    try {
      const res = await fetchJson<{ message?: string; threadId?: string }>("/api/replies/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ campaignId, recipientId }),
      });
      setDone(true);
      toast(res.message ?? "Draft ready in Gmail.", "success");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Couldn't draft that reply.", "error");
    } finally {
      setBusy(false);
    }
  }

  const label = busy ? "Drafting…" : done ? "✓ Draft ready" : "✨ Draft reply";
  return (
    <button
      onClick={() => void draft()}
      disabled={busy}
      className={
        compact
          ? "rounded-lg px-2 py-1 text-xs font-medium text-primary transition hover:bg-primary-soft disabled:opacity-50"
          : "rounded-lg border border-primary/30 bg-primary-soft px-2.5 py-1 text-xs font-medium text-primary transition hover:bg-primary/10 disabled:opacity-50"
      }
    >
      {label}
    </button>
  );
}
