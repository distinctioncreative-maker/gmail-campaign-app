"use client";

import { useState } from "react";
import { fetchJson } from "@/lib/fetchJson";
import { Icon } from "@/components/ui/Icon";

interface ThreadMessage {
  from: string;
  subject: string;
  bodyText: string;
  snippet: string;
}

/**
 * In-app reading view for a recipient's Gmail thread: reads it live via
 * Gmail (not the truncated 280-char snippet cached on the recipient doc),
 * so replies can be read without leaving the app or opening Gmail.
 */
export function ReplyThreadViewer({
  campaignId,
  recipientId,
  fullName,
  email,
  fallbackSnippet,
  compact = false,
}: {
  campaignId: string;
  recipientId: string;
  fullName: string;
  email: string;
  fallbackSnippet: string;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [messages, setMessages] = useState<ThreadMessage[] | null>(null);

  async function openViewer() {
    setOpen(true);
    if (messages !== null) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetchJson<{ messages: ThreadMessage[] }>(
        `/api/campaigns/${campaignId}/recipients/${recipientId}/thread`
      );
      setMessages(res.messages);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load this reply.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <button
        onClick={() => void openViewer()}
        className={`font-medium text-foreground ${compact ? "text-xs" : "text-xs hover:underline"}`}
      >
        Read reply
      </button>
      {open && (
        <div className="fixed inset-0 z-modal flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-overlay" onClick={() => setOpen(false)} aria-hidden />
          <div
            role="dialog"
            aria-modal="true"
            className="relative flex max-h-[80vh] w-full max-w-2xl animate-rise flex-col overflow-hidden rounded-2xl bg-surface shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-border px-6 py-4">
              <div className="min-w-0">
                <p className="truncate font-semibold text-foreground">{fullName || email}</p>
                {fullName && <p className="truncate text-sm text-muted">{email}</p>}
              </div>
              <button
                onClick={() => setOpen(false)}
                className="shrink-0 rounded-lg p-1.5 text-muted hover:bg-surface-2 hover:text-muted"
                aria-label="Close"
              >
                <Icon name="x" size={18} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-6 py-4">
              {loading ? (
                <p className="text-sm text-muted">Loading the thread…</p>
              ) : error ? (
                <div>
                  <p className="text-sm text-danger">{error}</p>
                  {fallbackSnippet && (
                    <p className="mt-3 rounded-lg bg-surface-2 p-3 text-sm italic text-muted">
                      “{fallbackSnippet}”
                    </p>
                  )}
                </div>
              ) : messages && messages.length > 0 ? (
                <div className="space-y-4">
                  {messages.map((m, i) => (
                    <div key={i} className="rounded-lg border border-border bg-surface-2 p-4">
                      <p className="text-sm font-medium text-muted">{m.from}</p>
                      <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-foreground">
                        {m.bodyText || m.snippet}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted">No message content found in this thread yet.</p>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
