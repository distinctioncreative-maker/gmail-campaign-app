"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { fetchJson } from "@/lib/fetchJson";

interface Pace {
  dailySendLimit: number;
  emailsPerBatch: number;
  minDelaySeconds: number;
  maxDelaySeconds: number;
  interBatchDelayMinutes: number;
}

export function CampaignControls({
  campaignId,
  status,
  followupsPaused,
  pace,
}: {
  campaignId: string;
  status: string;
  followupsPaused: boolean;
  pace: Pace;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showPace, setShowPace] = useState(false);
  const [draft, setDraft] = useState<Pace>(pace);

  async function post(body: Record<string, unknown>, confirmMessage?: string) {
    if (confirmMessage && !confirm(confirmMessage)) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetchJson<{ message?: string; campaignId?: string }>(
        `/api/campaigns/${campaignId}/control`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      );
      setMessage(res.message ?? "Done.");
      if (body.action === "clone" && res.campaignId) {
        router.push(`/campaigns/${res.campaignId}`);
        return;
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "That didn't work.");
    } finally {
      setBusy(false);
    }
  }

  const act = (action: string, confirmMessage?: string) => post({ action }, confirmMessage);

  const btn =
    "rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50";
  const primaryBtn = "btn-primary px-4 py-2 text-sm disabled:opacity-50";
  const dangerBtn =
    "rounded-xl border border-red-200 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50";
  const numInput =
    "w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm focus:border-primary focus:outline-none";

  const num = (k: keyof Pace, v: string) =>
    setDraft((d) => ({ ...d, [k]: Math.max(0, Number(v) || 0) }));

  const paceFields: Array<{ k: keyof Pace; label: string; hint: string; min: number; max: number }> = [
    { k: "dailySendLimit", label: "Emails per day", hint: "Max sent in one day", min: 1, max: 2000 },
    { k: "emailsPerBatch", label: "Per batch", hint: "Emails in each burst", min: 1, max: 50 },
    { k: "minDelaySeconds", label: "Min gap (sec)", hint: "Between emails", min: 1, max: 600 },
    { k: "maxDelaySeconds", label: "Max gap (sec)", hint: "Between emails", min: 1, max: 600 },
    { k: "interBatchDelayMinutes", label: "Batch gap (min)", hint: "Between batches", min: 0, max: 240 },
  ];

  return (
    <div className="card p-4">
      {message && <p className="mb-3 rounded-lg bg-green-50 p-2 text-sm text-green-700">{message}</p>}
      {error && <p className="mb-3 rounded-lg bg-red-50 p-2 text-sm text-red-700">{error}</p>}

      <div className="flex flex-wrap gap-2">
        {status === "ACTIVE" && (
          <>
            <button
              onClick={() =>
                act("pause", "Pause this campaign? An email already being sent this second may still go out; nothing else will.")
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
          <button onClick={() => setShowPace((s) => !s)} disabled={busy} className={btn}>
            {showPace ? "Hide pace" : "Adjust pace / daily limit"}
          </button>
        )}
        {(status === "ACTIVE" || status === "PAUSED") && (
          <>
            <button
              onClick={() => act("stop", "Stop this campaign permanently? Unsent emails will be cancelled.")}
              disabled={busy}
              className={dangerBtn}
            >
              Stop
            </button>
            <button
              onClick={() =>
                act("cancel_delete_drafts", "Cancel remaining emails AND delete unsent Gmail drafts? Sent emails are never touched.")
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

      {showPace && (status === "ACTIVE" || status === "PAUSED") && (
        <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50/60 p-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-slate-700">Sending pace for this campaign</p>
            <button
              onClick={() =>
                post({
                  action: "update_pace",
                  pace: { ...draft, dailySendLimit: Math.max(draft.dailySendLimit, 2000) },
                })
              }
              disabled={busy}
              className="text-xs font-medium text-primary hover:underline disabled:opacity-50"
            >
              Override today&apos;s limit — send the rest now
            </button>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-5">
            {paceFields.map((f) => (
              <label key={f.k} className="block text-xs font-medium text-slate-600">
                {f.label}
                <input
                  type="number"
                  min={f.min}
                  max={f.max}
                  value={draft[f.k]}
                  onChange={(e) => num(f.k, e.target.value)}
                  className={`mt-1 ${numInput}`}
                />
                <span className="mt-0.5 block font-normal text-[11px] text-slate-400">{f.hint}</span>
              </label>
            ))}
          </div>
          <div className="mt-3 flex items-center gap-2">
            <button
              onClick={() => post({ action: "update_pace", pace: draft })}
              disabled={busy}
              className={primaryBtn}
            >
              {busy ? "Saving…" : "Save pace & reschedule"}
            </button>
            <button onClick={() => setDraft(pace)} disabled={busy} className={btn}>
              Reset
            </button>
          </div>
          <p className="mt-2 text-xs text-slate-500">
            Saving re-spaces every remaining email with these settings. Higher numbers send faster but
            can hurt deliverability — Gmail limits how much you can send per day.
          </p>
        </div>
      )}
    </div>
  );
}
