"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { fetchJson } from "@/lib/fetchJson";
import { useConfirm, useToast } from "@/components/ui/UIProviders";
import { Button } from "@/components/ui/Button";
import { assessPaceRisk } from "@/lib/campaigns/paceSafety";

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
  const toast = useToast();
  const confirm = useConfirm();
  // Which action is in flight / just succeeded, so only the clicked button
  // shows its own spinner or success flash — siblings just stay disabled.
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [successAction, setSuccessAction] = useState<string | null>(null);
  const [showPace, setShowPace] = useState(false);
  const [draft, setDraft] = useState<Pace>(pace);

  function flashSuccess(actionKey: string) {
    setSuccessAction(actionKey);
    setTimeout(() => setSuccessAction((cur) => (cur === actionKey ? null : cur)), 1500);
  }

  async function post(actionKey: string, body: Record<string, unknown>, confirmMessage?: string) {
    if (confirmMessage && !(await confirm({ title: "Are you sure?", body: confirmMessage, danger: true, confirmLabel: "Yes, continue" })))
      return;
    setBusyAction(actionKey);
    try {
      const res = await fetchJson<{ message?: string; campaignId?: string }>(
        `/api/campaigns/${campaignId}/control`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      );
      toast(res.message ?? "Done.", "success");
      if (body.action === "clone" && res.campaignId) {
        router.push(`/campaigns/${res.campaignId}`);
        return;
      }
      flashSuccess(actionKey);
      router.refresh();
    } catch (err) {
      toast(err instanceof Error ? err.message : "That didn't work.", "error");
    } finally {
      setBusyAction(null);
    }
  }

  const act = (action: string, confirmMessage?: string) => post(action, { action }, confirmMessage);

  async function deleteDraft() {
    const ok = await confirm({
      title: "Delete this draft?",
      body: "This draft campaign will be permanently removed. This can't be undone.",
      danger: true,
      confirmLabel: "Delete",
    });
    if (!ok) return;
    setBusyAction("delete_draft");
    try {
      await fetchJson(`/api/campaigns/${campaignId}`, { method: "DELETE" });
      toast("Draft deleted.", "success");
      router.push("/campaigns");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not delete that campaign.", "error");
      setBusyAction(null);
    }
  }

  async function checkReplies() {
    setBusyAction("check_replies");
    try {
      const res = await fetchJson<{ message?: string }>(`/api/campaigns/${campaignId}/check-replies`, {
        method: "POST",
      });
      toast(res.message ?? "Checked for replies.", "success");
      flashSuccess("check_replies");
      router.refresh();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not check for replies.", "error");
    } finally {
      setBusyAction(null);
    }
  }

  const busy = busyAction !== null;
  const btn = "btn-ghost px-4 py-2 text-sm";
  const dangerBtn = "btn-danger px-4 py-2 text-sm";
  const numInput =
    "w-full rounded-lg border border-border px-2.5 py-1.5 text-sm focus:border-primary focus:outline-none";

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

      <div className="flex flex-wrap gap-2">
        {status === "ACTIVE" && (
          <>
            <Button
              onClick={() =>
                act("pause", "Pause this campaign? An email already being sent this second may still go out; nothing else will.")
              }
              disabled={busy}
              loading={busyAction === "pause"}
              success={successAction === "pause"}
              className="px-4 py-2 text-sm"
            >
              Pause
            </Button>
            <button onClick={() => act("send_next_batch")} disabled={busy} className={btn}>
              Send next batch now
            </button>
          </>
        )}
        {status === "PAUSED" && (
          <Button
            onClick={() => act("resume")}
            disabled={busy}
            loading={busyAction === "resume"}
            success={successAction === "resume"}
            className="px-4 py-2 text-sm"
          >
            Resume
          </Button>
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
              {busyAction === "stop" ? "Stopping…" : "Stop"}
            </button>
            <button
              onClick={() =>
                act("cancel_delete_drafts", "Cancel remaining emails AND delete unsent Gmail drafts? Sent emails are never touched.")
              }
              disabled={busy}
              className={dangerBtn}
            >
              {busyAction === "cancel_delete_drafts" ? "Cancelling…" : "Cancel & delete drafts"}
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
            {busyAction === "retry_failed" ? "Retrying…" : "Retry failed"}
          </button>
        )}
        <button onClick={() => void checkReplies()} disabled={busy} className={btn}>
          {busyAction === "check_replies" ? "Checking…" : successAction === "check_replies" ? "✓ Checked" : "Check for replies now"}
        </button>
        <button onClick={() => act("clone")} disabled={busy} className={btn}>
          {busyAction === "clone" ? "Duplicating…" : "Duplicate campaign"}
        </button>
        {status === "DRAFT" && (
          <button onClick={() => void deleteDraft()} disabled={busy} className={dangerBtn}>
            {busyAction === "delete_draft" ? "Deleting…" : "Delete draft"}
          </button>
        )}
        {["STOPPED", "CANCELLED", "COMPLETED", "ERROR"].includes(status) && (
          <button
            onClick={() =>
              act(
                "release_leads",
                "Free the leads this campaign never emailed so they can be used in new campaigns? Leads that actually received an email stay marked as contacted."
              )
            }
            disabled={busy}
            className={btn}
          >
            {busyAction === "release_leads" ? "Releasing…" : "Free unused leads"}
          </button>
        )}
      </div>

      {showPace && (status === "ACTIVE" || status === "PAUSED") && (
        <div className="mt-4 rounded-xl border border-border bg-surface-2/60 p-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-foreground">Sending pace for this campaign</p>
            <button
              onClick={() =>
                post(
                  "override_limit",
                  {
                    action: "update_pace",
                    pace: { ...draft, dailySendLimit: Math.max(draft.dailySendLimit, 2000) },
                  },
                  "Override today's limit and send the rest of this campaign right now? This can push you well past the ~50–100/day pace that keeps sending safe, which risks your sender reputation and inbox placement."
                )
              }
              disabled={busy}
              className="text-xs font-medium text-primary hover:underline disabled:opacity-50"
            >
              Override today&apos;s limit — send the rest now
            </button>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-5">
            {paceFields.map((f) => (
              <label key={f.k} className="block text-xs font-medium text-muted">
                {f.label}
                <input
                  type="number"
                  min={f.min}
                  max={f.max}
                  value={draft[f.k]}
                  onChange={(e) => num(f.k, e.target.value)}
                  className={`mt-1 ${numInput}`}
                />
                <span className="mt-0.5 block font-normal text-[11px] text-muted/70">{f.hint}</span>
              </label>
            ))}
          </div>
          {assessPaceRisk(draft).risky && (
            <div className="alert-warning mt-3 rounded-lg border p-3">
              <p className="text-xs font-semibold text-warning">⚠️ This pace risks your deliverability</p>
              <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs text-warning">
                {assessPaceRisk(draft).reasons.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
            </div>
          )}
          <div className="mt-3 flex items-center gap-2">
            <Button
              onClick={() => {
                const risk = assessPaceRisk(draft);
                const confirmMessage = risk.risky
                  ? `${risk.reasons.join(" ")} This can hurt your sender reputation and inbox placement. Save this pace anyway?`
                  : undefined;
                void post("update_pace", { action: "update_pace", pace: draft }, confirmMessage);
              }}
              disabled={busy}
              loading={busyAction === "update_pace"}
              loadingText="Saving…"
              success={successAction === "update_pace"}
              className="px-4 py-2 text-sm"
            >
              Save pace & reschedule
            </Button>
            <button onClick={() => setDraft(pace)} disabled={busy} className={btn}>
              Reset
            </button>
          </div>
          <p className="mt-2 text-xs text-muted">
            Saving re-spaces every remaining email with these settings. Higher numbers send faster but
            can hurt deliverability — Gmail limits how much you can send per day.
          </p>
        </div>
      )}
    </div>
  );
}
