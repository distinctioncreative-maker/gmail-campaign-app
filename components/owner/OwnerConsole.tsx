"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchJson } from "@/lib/fetchJson";
import { useConfirm, useToast } from "@/components/ui/UIProviders";
import { LocalTime } from "@/components/LocalTime";
import { SUSPENSION_REASONS, SIGNUP_MODES } from "@/schemas/platform";

/**
 * The operator console.
 *
 * Two things about how this is arranged rather than how it looks.
 *
 * **Destructive controls confirm with what they will do, not with "are you
 * sure".** Suspending a workspace signs every member out and stops mail that is
 * already queued, and the confirmation says so, because those are the two
 * consequences an operator is most likely to have not thought about.
 *
 * **The checkup loads on demand.** It reads across every tenant, so it is not
 * something to fetch on every page view; it is a question an operator asks.
 */

interface Settings {
  signupMode: string | null;
  readOnlyMode: boolean;
  noticeBanner: string;
  noticeSeverity: "INFO" | "WARNING";
  sendingHalted: boolean;
  haltReason: string;
  updatedAt: number;
  updatedByEmail: string;
}

interface Suspension {
  organizationId: string;
  reason: string;
  message: string;
  suspendedByEmail: string;
  suspendedAt: number;
}

interface Ban {
  email: string;
  reason: string;
  bannedByEmail: string;
  bannedAt: number;
}

interface Override {
  organizationId: string;
  plan: string;
  note: string;
  setAt: number;
}

interface AuditEntry {
  entryId: string;
  action: string;
  operatorEmail: string;
  summary: string;
  at: number;
}

interface OwnerState {
  settings: Settings;
  signupMode: string;
  suspensions: Suspension[];
  bans: Ban[];
  overrides: Override[];
  audit: AuditEntry[];
  plans: string[];
}

interface Risk {
  organizationId: string;
  name: string;
  sendingMode: string;
  sentCount: number;
  bounceRate: number;
  verdict: "OK" | "WATCH" | "ACT";
  reasons: string[];
}

interface Checkup {
  counts: Record<string, number>;
  risks: Risk[];
  needsAction: number;
  watching: number;
}

const REASON_LABELS: Record<string, string> = {
  SPAM_COMPLAINTS: "Spam complaints",
  HIGH_BOUNCE_RATE: "High bounce rate",
  PAYMENT_FAILED: "Payment failed",
  TERMS_VIOLATION: "Terms violation",
  SUSPECTED_COMPROMISE: "Suspected compromise",
  OPERATOR_REQUEST: "Operator request",
};

export function OwnerConsole({ canWrite }: { canWrite: boolean }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [state, setState] = useState<OwnerState | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [checkup, setCheckup] = useState<Checkup | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [suspendOrg, setSuspendOrg] = useState("");
  const [suspendReason, setSuspendReason] = useState<string>(SUSPENSION_REASONS[0]);
  const [suspendMessage, setSuspendMessage] = useState("");
  const [banEmail, setBanEmail] = useState("");
  const [overrideOrg, setOverrideOrg] = useState("");
  const [overridePlan, setOverridePlan] = useState("TEAM");
  const [overrideNote, setOverrideNote] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await fetchJson<OwnerState>("/api/owner");
      setState(res);
      setLoadFailed(false);
      setNotice(res.settings.noticeBanner);
    } catch (err) {
      // A toast alone left the console showing "Loading…" forever, which reads
      // as a hung page rather than a failed request. The incident controls are
      // the one surface where that matters most: an operator reaching for them
      // is usually already having a bad day.
      setLoadFailed(true);
      toast(err instanceof Error ? err.message : "Could not load platform state.", "error");
    }
  }, [toast]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  async function act(body: Record<string, unknown>, success: string) {
    setBusy(true);
    try {
      await fetchJson("/api/owner", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      toast(success, "success");
      await load();
    } catch (err) {
      toast(err instanceof Error ? err.message : "That did not work.", "error");
    } finally {
      setBusy(false);
    }
  }

  /**
   * "closed" is the heaviest switch on this page and it does not look like it.
   *
   * It reads as "stop new signups". It actually stops every sign-in, including
   * existing paying customers and including you, because the gate sits at the
   * point a session cookie is minted rather than at account creation. Your own
   * way back in is the operator exemption in lib/auth/session.ts, and it is
   * worth knowing that is what you are relying on before you press this.
   */
  async function chooseSignupMode(mode: string) {
    if (mode === "closed") {
      const ok = await confirm({
        title: "Pause all sign-in?",
        body:
          "This stops every sign-in, not just new accounts. Existing customers with expired sessions will be locked out until you turn it back on. You can still get in yourself, because a platform operator is exempt from this gate.",
        confirmLabel: "Pause sign-in",
        danger: true,
      });
      if (!ok) return;
    }
    await act({ action: "signup.mode", mode }, `Signup is now ${mode}.`);
  }

  async function runCheckup() {
    setBusy(true);
    try {
      setCheckup(await fetchJson<Checkup>("/api/owner/checkup"));
    } catch (err) {
      toast(err instanceof Error ? err.message : "The checkup did not run.", "error");
    } finally {
      setBusy(false);
    }
  }

  if (!state) {
    return loadFailed ? (
      <section className="card p-6 sm:p-7 mt-6">
        <h2 className="font-medium">Platform state did not load</h2>
        <p className="mt-1 text-sm text-muted">
          The controls are hidden rather than shown against stale or missing values, because acting
          on a state you cannot see is how the wrong workspace gets suspended.
        </p>
        <button
          type="button"
          onClick={() => void load()}
          className="btn-secondary mt-3 min-h-11 px-4 py-2.5 text-sm"
        >
          Try again
        </button>
      </section>
    ) : (
      <p className="mt-6 text-sm text-muted">Loading…</p>
    );
  }

  const disabled = busy || !canWrite;

  return (
    <div className="mt-8 space-y-8">
      {/* ---------------------------------------------------------- doors */}
      <section className="card p-6 sm:p-7">
        <h2 className="font-medium">Who can sign up</h2>
        <p className="mt-1 text-sm text-muted">
          In force now: <strong>{state.signupMode}</strong>
          {state.settings.signupMode === null
            ? " (from the deployment configuration, not set here)"
            : ""}
          .
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {SIGNUP_MODES.map((mode) => (
            <button
              key={mode}
              onClick={() => void chooseSignupMode(mode)}
              disabled={disabled}
              aria-pressed={state.settings.signupMode === mode}
              className={`min-h-11 rounded-md px-3 py-2 text-sm disabled:opacity-50 ${
                state.settings.signupMode === mode ? "bg-surface-2 font-medium" : "text-muted"
              }`}
            >
              {mode}
            </button>
          ))}
          <button
            onClick={() =>
              void act({ action: "signup.mode", mode: null }, "Back to the deployment default.")
            }
            disabled={disabled}
            className="btn-ghost min-h-11 px-3 py-2 text-sm disabled:opacity-50"
          >
            Use deployment default
          </button>
        </div>
        <p className="mt-2 text-xs text-muted">
          Closed stops new sign-ins entirely, including people who already have an account. Allowlist
          restricts to your configured work domains. Open lets any verified Google account in.
        </p>
      </section>

      {/* ------------------------------------------------------ incidents */}
      <section className="card p-6 sm:p-7">
        <h2 className="font-medium">Incident controls</h2>
        <div className="mt-3 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium">
                Outbound sending {state.settings.sendingHalted ? "is halted" : "is running"}
              </p>
              <p className="text-xs text-muted">
                Stops every send in every workspace, including mail already queued. Queue items stay
                scheduled, so lifting it resumes them.
              </p>
            </div>
            <button
              onClick={async () => {
                if (!state.settings.sendingHalted) {
                  const ok = await confirm({
                    title: "Halt all sending?",
                    body: "Every workspace stops sending immediately, including campaigns mid-run. Nothing is lost: queued mail resumes when you lift this.",
                    confirmLabel: "Halt sending",
                    danger: true,
                  });
                  if (!ok) return;
                }
                await act(
                  { action: "sending.halted", enabled: !state.settings.sendingHalted, reason: "" },
                  state.settings.sendingHalted ? "Sending resumed." : "Sending halted."
                );
              }}
              disabled={disabled}
              className={`min-h-11 px-4 py-2.5 text-sm disabled:opacity-50 ${
                state.settings.sendingHalted ? "btn-primary" : "btn-secondary text-danger"
              }`}
            >
              {state.settings.sendingHalted ? "Resume sending" : "Halt all sending"}
            </button>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
            <div>
              <p className="text-sm font-medium">
                Read-only mode {state.settings.readOnlyMode ? "is on" : "is off"}
              </p>
              <p className="text-xs text-muted">
                Signing in and reading keep working. Launching, importing, and sending do not.
              </p>
            </div>
            <button
              onClick={() =>
                void act(
                  { action: "readonly.mode", enabled: !state.settings.readOnlyMode },
                  state.settings.readOnlyMode ? "Read-only mode off." : "Read-only mode on."
                )
              }
              disabled={disabled}
              className="btn-secondary min-h-11 px-4 py-2.5 text-sm disabled:opacity-50"
            >
              {state.settings.readOnlyMode ? "Turn off" : "Turn on"}
            </button>
          </div>

          <div className="border-t border-border pt-3">
            <p className="text-sm font-medium">Service notice</p>
            <p className="text-xs text-muted">
              Shown to every signed-in customer. Empty removes it.
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <input
                value={notice}
                onChange={(e) => setNotice(e.target.value)}
                maxLength={280}
                placeholder="Sending is paused while we investigate a delivery issue."
                className="min-w-0 flex-1"
              />
              <button
                onClick={() =>
                  void act(
                    { action: "notice.banner", text: notice.trim(), severity: "WARNING" },
                    notice.trim() === "" ? "Notice cleared." : "Notice published."
                  )
                }
                disabled={disabled}
                className="btn-secondary min-h-11 px-4 py-2.5 text-sm disabled:opacity-50"
              >
                Publish
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------- checkup */}
      <section className="card p-6 sm:p-7">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-medium">Security and abuse checkup</h2>
            <p className="mt-1 text-sm text-muted">
              Reads across every workspace, so it runs when you ask rather than on load. Viewing it
              is recorded.
            </p>
          </div>
          <button
            onClick={() => void runCheckup()}
            disabled={busy}
            className="btn-primary min-h-11 px-4 py-2.5 text-sm disabled:opacity-50"
          >
            {busy ? "Running…" : "Run checkup"}
          </button>
        </div>

        {checkup ? (
          <div className="mt-4">
            <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {Object.entries(checkup.counts).map(([key, value]) => (
                <div key={key} className="rounded-lg border border-border p-3">
                  <dt className="text-xs text-muted">{key}</dt>
                  <dd className="mt-0.5 text-lg font-semibold tabular-nums">
                    {value.toLocaleString()}
                  </dd>
                </div>
              ))}
            </dl>

            <p className="mt-4 text-sm">
              {checkup.needsAction} needing action, {checkup.watching} worth watching.
            </p>

            <ul className="mt-3 divide-y divide-border border-y border-border">
              {checkup.risks
                .filter((risk) => risk.verdict !== "OK")
                .map((risk) => (
                  <li key={risk.organizationId} className="py-3">
                    <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                      <span>{risk.name}</span>
                      <span
                        className={`badge text-xs ${
                          risk.verdict === "ACT"
                            ? "bg-danger-soft text-danger"
                            : "bg-warning-soft text-warning"
                        }`}
                      >
                        {risk.verdict}
                      </span>
                      <span className="badge border border-border text-xs text-muted">
                        {risk.sendingMode}
                      </span>
                    </p>
                    <p className="mt-0.5 font-mono text-xs text-muted">{risk.organizationId}</p>
                    <ul className="mt-1 space-y-0.5">
                      {risk.reasons.map((reason, i) => (
                        <li key={i} className="text-xs text-muted">
                          {reason}
                        </li>
                      ))}
                    </ul>
                    <button
                      onClick={() => setSuspendOrg(risk.organizationId)}
                      className="btn-ghost mt-2 min-h-11 px-3 py-2 text-xs"
                    >
                      Fill in suspension below
                    </button>
                  </li>
                ))}
            </ul>
            {checkup.risks.filter((r) => r.verdict !== "OK").length === 0 ? (
              <p className="mt-3 text-sm text-muted">
                Nothing above the thresholds. {checkup.risks.length} workspaces inspected.
              </p>
            ) : null}
          </div>
        ) : null}
      </section>

      {/* ---------------------------------------------------- suspensions */}
      <section className="card p-6 sm:p-7">
        <h2 className="font-medium">Suspend a workspace</h2>
        <p className="mt-1 text-sm text-muted">
          Locks everyone in it out, signs their live sessions out, and stops queued mail. Their own
          admins cannot lift it.
        </p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <input
            value={suspendOrg}
            onChange={(e) => setSuspendOrg(e.target.value)}
            placeholder="organization id"
            className="font-mono"
          />
          <select
            value={suspendReason}
            onChange={(e) => setSuspendReason(e.target.value)}
            className=""
          >
            {SUSPENSION_REASONS.map((reason) => (
              <option key={reason} value={reason}>
                {REASON_LABELS[reason] ?? reason}
              </option>
            ))}
          </select>
        </div>
        <input
          value={suspendMessage}
          onChange={(e) => setSuspendMessage(e.target.value)}
          placeholder="What the customer is told (optional)"
          maxLength={400}
          className="mt-2 w-full"
        />
        <button
          onClick={async () => {
            const ok = await confirm({
              title: `Suspend ${suspendOrg}?`,
              body: "Everyone in this workspace is signed out immediately and mail already queued stops going out. They cannot undo it themselves.",
              confirmLabel: "Suspend workspace",
              danger: true,
            });
            if (!ok) return;
            await act(
              {
                action: "workspace.suspend",
                organizationId: suspendOrg.trim(),
                reason: suspendReason,
                message: suspendMessage.trim(),
                note: "",
              },
              "Workspace suspended."
            );
            setSuspendOrg("");
            setSuspendMessage("");
          }}
          disabled={disabled || suspendOrg.trim() === ""}
          className="btn-secondary mt-3 min-h-11 px-4 py-2.5 text-sm text-danger disabled:opacity-50"
        >
          Suspend
        </button>

        {state.suspensions.length > 0 ? (
          <ul className="mt-4 divide-y divide-border border-y border-border">
            {state.suspensions.map((s) => (
              <li
                key={s.organizationId}
                className="flex flex-wrap items-center justify-between gap-3 py-3"
              >
                <div className="min-w-0">
                  <p className="font-mono text-xs">{s.organizationId}</p>
                  <p className="mt-0.5 text-xs text-muted">
                    {REASON_LABELS[s.reason] ?? s.reason} · {s.suspendedByEmail} ·{" "}
                    <LocalTime value={s.suspendedAt} />
                  </p>
                </div>
                <button
                  onClick={() =>
                    void act(
                      { action: "workspace.unsuspend", organizationId: s.organizationId },
                      "Suspension lifted."
                    )
                  }
                  disabled={disabled}
                  className="btn-ghost min-h-11 px-3 py-2 text-xs disabled:opacity-50"
                >
                  Lift
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-4 text-sm text-muted">No workspaces suspended.</p>
        )}
      </section>

      {/* ----------------------------------------------------------- bans */}
      <section className="card p-6 sm:p-7">
        <h2 className="font-medium">Ban a person</h2>
        <p className="mt-1 text-sm text-muted">
          By email, so signing up again with a fresh account does not get around it. Use this when
          suspending the workspace is not enough.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <input
            value={banEmail}
            onChange={(e) => setBanEmail(e.target.value)}
            inputMode="email"
            placeholder="person@example.com"
            className="min-w-0 flex-1"
          />
          <button
            onClick={async () => {
              const ok = await confirm({
                title: `Ban ${banEmail}?`,
                body: "They are signed out and cannot sign in again, on this or a new workspace, until you lift it.",
                confirmLabel: "Ban",
                danger: true,
              });
              if (!ok) return;
              await act(
                {
                  action: "identity.ban",
                  email: banEmail.trim(),
                  reason: "TERMS_VIOLATION",
                  note: "",
                },
                "Banned."
              );
              setBanEmail("");
            }}
            disabled={disabled || banEmail.trim() === ""}
            className="btn-secondary min-h-11 px-4 py-2.5 text-sm text-danger disabled:opacity-50"
          >
            Ban
          </button>
        </div>
        {state.bans.length > 0 ? (
          <ul className="mt-4 divide-y divide-border border-y border-border">
            {state.bans.map((b) => (
              <li key={b.email} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div>
                  <p className="text-sm">{b.email}</p>
                  <p className="mt-0.5 text-xs text-muted">
                    {REASON_LABELS[b.reason] ?? b.reason} · <LocalTime value={b.bannedAt} />
                  </p>
                </div>
                <button
                  onClick={() =>
                    void act({ action: "identity.unban", email: b.email }, "Unbanned.")
                  }
                  disabled={disabled}
                  className="btn-ghost min-h-11 px-3 py-2 text-xs disabled:opacity-50"
                >
                  Lift
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-4 text-sm text-muted">Nobody banned.</p>
        )}
      </section>

      {/* ------------------------------------------------------- overrides */}
      <section className="card p-6 sm:p-7">
        <h2 className="font-medium">Plan override</h2>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          For a comped, grandfathered, or negotiated workspace. The plan catalog itself stays in
          code, because plan limits gate send caps and seat counts: those are not numbers to edit in
          a form. Price comes from Stripe, so it is never typed twice.
        </p>
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          <input
            value={overrideOrg}
            onChange={(e) => setOverrideOrg(e.target.value)}
            placeholder="organization id"
            className="font-mono"
          />
          <select
            value={overridePlan}
            onChange={(e) => setOverridePlan(e.target.value)}
            className=""
          >
            {state.plans.map((plan) => (
              <option key={plan} value={plan}>
                {plan}
              </option>
            ))}
          </select>
          <input
            value={overrideNote}
            onChange={(e) => setOverrideNote(e.target.value)}
            placeholder="Why (required)"
            className=""
          />
        </div>
        <button
          onClick={async () => {
            await act(
              {
                action: "plan.override",
                organizationId: overrideOrg.trim(),
                plan: overridePlan,
                note: overrideNote.trim(),
              },
              "Override set."
            );
            setOverrideOrg("");
            setOverrideNote("");
          }}
          disabled={disabled || overrideOrg.trim() === "" || overrideNote.trim() === ""}
          className="btn-secondary mt-3 min-h-11 px-4 py-2.5 text-sm disabled:opacity-50"
        >
          Set override
        </button>
        {state.overrides.length > 0 ? (
          <ul className="mt-4 divide-y divide-border border-y border-border">
            {state.overrides.map((o) => (
              <li
                key={o.organizationId}
                className="flex flex-wrap items-center justify-between gap-3 py-3"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium">{o.plan}</p>
                  <p className="font-mono text-xs text-muted">{o.organizationId}</p>
                  <p className="mt-0.5 text-xs text-muted">{o.note}</p>
                </div>
                <button
                  onClick={() =>
                    void act(
                      { action: "plan.override_cleared", organizationId: o.organizationId },
                      "Override cleared."
                    )
                  }
                  disabled={disabled}
                  className="btn-ghost min-h-11 px-3 py-2 text-xs disabled:opacity-50"
                >
                  Clear
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-4 text-sm text-muted">No overrides.</p>
        )}
      </section>

      {/* ----------------------------------------------------------- audit */}
      <section className="card p-6 sm:p-7">
        <h2 className="font-medium">What operators have done</h2>
        <p className="mt-1 text-sm text-muted">
          Append-only, outside every workspace, so it survives a workspace an operator deleted.
        </p>
        {state.audit.length > 0 ? (
          <ul className="mt-3 divide-y divide-border border-y border-border">
            {state.audit.map((entry) => (
              <li key={entry.entryId} className="py-2.5">
                <p className="text-sm">{entry.summary}</p>
                <p className="mt-0.5 text-xs text-muted">
                  {entry.action} · <LocalTime value={entry.at} />
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-sm text-muted">Nothing recorded yet.</p>
        )}
      </section>
    </div>
  );
}
