"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function CampaignControls({
  campaignId,
  status,
  followupsPaused,
}: {
  campaignId: string;
  status: string;
  followupsPaused: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function act(action: string, confirmMessage?: string) {
    if (confirmMessage && !confirm(confirmMessage)) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/control`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "That didn't work.");
      setMessage(body.message);
      if (action === "clone" && body.campaignId) {
        router.push(`/campaigns/${body.campaignId}`);
        return;
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "That didn't work.");
    } finally {
      setBusy(false);
    }
  }

  const btn =
    "rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50";
  const primaryBtn =
    "rounded-xl bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-hover disabled:opacity-50";
  const dangerBtn =
    "rounded-xl border border-red-200 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50";

  return (
    <div className="card p-4">
      {message && <p className="mb-3 rounded-lg bg-green-50 p-2 text-sm text-green-700">{message}</p>}
      {error && <p className="mb-3 rounded-lg bg-red-50 p-2 text-sm text-red-700">{error}</p>}

      <div className="flex flex-wrap gap-2">
        {status === "ACTIVE" && (
          <>
            <button
              onClick={() =>
                act(
                  "pause",
                  "Pause this campaign? An email already being sent this second may still go out; nothing else will."
                )
              }
              disabled={busy}
              className={primaryBtn}
            >
              Pause
            </button>
            <button onClick={() => act("send_next_batch")} disabled={busy} className={btn}>
              Send next batch now
            </button>
          </>
        )}
        {status === "PAUSED" && (
          <button onClick={() => act("resume")} disabled={busy} className={primaryBtn}>
            Resume
          </button>
        )}
        {(status === "ACTIVE" || status === "PAUSED") && (
          <>
            <button
              onClick={() =>
                act("stop", "Stop this campaign permanently? Unsent emails will be cancelled.")
              }
              disabled={busy}
              className={dangerBtn}
            >
              Stop
            </button>
            <button
              onClick={() =>
                act(
                  "cancel_delete_drafts",
                  "Cancel remaining emails AND delete unsent Gmail drafts? Sent emails are never touched."
                )
              }
              disabled={busy}
              className={dangerBtn}
            >
              Cancel &amp; delete drafts
            </button>
            <button
              onClick={() => act(followupsPaused ? "resume_followups" : "pause_followups")}
              disabled={busy}
              className={btn}
            >
              {followupsPaused ? "Resume follow-ups" : "Pause follow-ups"}
            </button>
          </>
        )}
        {(status === "ERROR" || status === "PAUSED" || status === "ACTIVE") && (
          <button onClick={() => act("retry_failed")} disabled={busy} className={btn}>
            Retry failed
          </button>
        )}
        <button onClick={() => act("clone")} disabled={busy} className={btn}>
          Duplicate campaign
        </button>
      </div>
    </div>
  );
}
