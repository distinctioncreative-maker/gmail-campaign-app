"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { fetchJson } from "@/lib/fetchJson";
import { useToast } from "@/components/ui/UIProviders";
import { Icon } from "@/components/ui/Icon";
import { describeRemaining, type DeletionScope } from "@/lib/account/eligibility";
import type { DeletionRequest } from "@/schemas/deletion";

/**
 * The danger zone.
 *
 * Three deliberate frictions, because this is the one control in the product
 * that destroys work: it is collapsed by default, it requires typing DELETE,
 * and it schedules rather than executes. None of them is theatre. The typed
 * confirmation is the difference between a misclick and a lost quarter, and
 * the thirty-day delay is what makes a mistaken deletion recoverable at all.
 *
 * Equally deliberate: the cancel path is one click and always visible while a
 * deletion is pending. Making it as hard to stop as it was to start would be
 * the dark-pattern version of the same screen.
 */
/**
 * The countdown, resolved after mount.
 *
 * Reading the clock during render is impure and, worse here, the server
 * renders in UTC while the reader is somewhere else, so a server-computed
 * "runs in 3 days" can disagree with the browser and mismatch on hydration.
 * Same reasoning as components/LocalTime.tsx.
 */
function DeletionCountdown({ purgeAfter }: { purgeAfter: number }) {
  const [text, setText] = useState("");
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setText(describeRemaining(purgeAfter, Date.now()));
  }, [purgeAfter]);
  return <>{text || "Deletion is scheduled."}</>;
}

export function DeleteAccountCard({
  initial,
  canDeleteWorkspace,
  soloWorkspace,
}: {
  initial: {
    request: DeletionRequest | null;
    allowed: boolean;
    effectiveScope: DeletionScope;
    reason: string;
    gracePeriodDays: number;
  };
  canDeleteWorkspace: boolean;
  soloWorkspace: boolean;
}) {
  const toast = useToast();
  const router = useRouter();
  const [state, setState] = useState(initial);
  const [open, setOpen] = useState(false);
  const [scope, setScope] = useState<DeletionScope>(initial.effectiveScope);
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);

  async function refresh(next: DeletionScope) {
    setScope(next);
    try {
      const res = await fetchJson<typeof initial>(`/api/account/deletion?scope=${next}`);
      setState(res);
    } catch {
      /* Leave the last known verdict on screen rather than blanking it. */
    }
  }

  async function schedule() {
    setBusy(true);
    try {
      const res = await fetchJson<{ request: DeletionRequest; message: string }>(
        "/api/account/deletion",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ scope, confirmation }),
        }
      );
      setState((prev) => ({ ...prev, request: res.request }));
      setConfirmation("");
      setOpen(false);
      toast(res.message, "success");
      router.refresh();
    } catch (err) {
      toast(err instanceof Error ? err.message : "That did not go through.", "error");
    } finally {
      setBusy(false);
    }
  }

  async function cancel() {
    setBusy(true);
    try {
      const res = await fetchJson<{ message: string }>("/api/account/deletion", {
        method: "DELETE",
      });
      setState((prev) => ({ ...prev, request: null }));
      toast(res.message, "success");
      router.refresh();
    } catch (err) {
      toast(err instanceof Error ? err.message : "That did not go through.", "error");
    } finally {
      setBusy(false);
    }
  }

  if (state.request) {
    return (
      <div className="alert-danger card border p-6">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 shrink-0 text-danger">
            <Icon name="alert" size={20} />
          </span>
          <div className="min-w-0">
            <h2 className="font-medium text-foreground">
              {state.request.scope === "WORKSPACE"
                ? "This workspace is scheduled for deletion"
                : "Your account is scheduled for deletion"}
            </h2>
            <p className="mt-1 text-sm text-muted">
              <DeletionCountdown purgeAfter={state.request.purgeAfter} /> Everything keeps working
              until then, and nothing has been removed yet. After it runs, campaigns, leads,
              templates, and sending history are gone and the Gmail connection is revoked with
              Google.
            </p>
            <button
              onClick={() => void cancel()}
              disabled={busy}
              className="btn-primary mt-4 min-h-11 px-4 py-2.5 text-sm disabled:opacity-50"
            >
              {busy ? "Cancelling…" : "Cancel deletion"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="card p-6">
      <h2 className="font-medium">Delete {soloWorkspace ? "your workspace" : "your account"}</h2>
      <p className="mt-1 text-sm text-muted">
        Scheduled with a {state.gracePeriodDays} day grace period, so a change of mind costs
        nothing. After that it is permanent.
      </p>

      {!open ? (
        <button
          onClick={() => setOpen(true)}
          className="btn-secondary mt-4 min-h-11 px-4 py-2.5 text-sm text-danger"
        >
          Delete {soloWorkspace ? "workspace" : "account"}
        </button>
      ) : (
        <div className="mt-4 space-y-4">
          {canDeleteWorkspace && !soloWorkspace ? (
            <fieldset>
              <legend className="text-sm font-medium">What should be deleted?</legend>
              <div className="mt-2 space-y-2">
                {(
                  [
                    ["ACCOUNT", "Just my account", "Your data goes. The workspace and everyone else stay."],
                    ["WORKSPACE", "The entire workspace", "Every member's data, for everyone here."],
                  ] as const
                ).map(([value, label, hint]) => (
                  <label key={value} className="flex items-start gap-2 text-sm">
                    <input
                      type="radio"
                      name="deletion-scope"
                      checked={scope === value}
                      onChange={() => void refresh(value)}
                      className="mt-1"
                    />
                    <span>
                      {label}
                      <span className="mt-0.5 block text-xs text-muted">{hint}</span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
          ) : null}

          <p
            className={`rounded-xl border p-3 text-sm ${
              state.allowed ? "alert-warning text-foreground" : "alert-danger text-danger"
            }`}
          >
            {state.reason}
          </p>

          {state.allowed ? (
            <>
              <label className="block text-sm">
                <span className="font-medium">Type DELETE to confirm</span>
                <input
                  value={confirmation}
                  onChange={(e) => setConfirmation(e.target.value)}
                  autoComplete="off"
                  className="mt-1.5 w-full max-w-xs rounded-xl border border-border bg-surface px-3 py-2.5 text-sm focus:border-primary focus:outline-none"
                />
              </label>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => void schedule()}
                  disabled={busy || confirmation.trim().toUpperCase() !== "DELETE"}
                  className="btn-danger min-h-11 px-4 py-2.5 text-sm disabled:opacity-50"
                >
                  {busy ? "Scheduling…" : "Schedule deletion"}
                </button>
                <button
                  onClick={() => {
                    setOpen(false);
                    setConfirmation("");
                  }}
                  className="btn-secondary min-h-11 px-4 py-2.5 text-sm"
                >
                  Keep my {soloWorkspace ? "workspace" : "account"}
                </button>
              </div>
            </>
          ) : (
            <button
              onClick={() => setOpen(false)}
              className="btn-secondary min-h-11 px-4 py-2.5 text-sm"
            >
              Close
            </button>
          )}
        </div>
      )}
    </div>
  );
}
