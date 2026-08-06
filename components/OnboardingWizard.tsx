"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ProfileForm } from "./ProfileForm";
import type { SenderProfile } from "@/schemas/userSettings";
import type { WorkspaceProfile } from "@/schemas/user";
import { Icon, type IconName } from "@/components/ui/Icon";

/**
 * Five steps, down from seven.
 *
 * "Your details" and "Sending defaults" both rendered the same ProfileForm,
 * once compact and once full, so the second was a second pass over a form the
 * user had just filled in. They are one step now.
 *
 * The test send stopped being a gate. It is genuinely worth doing, but it sat
 * between a new user and a working app, and Home already carries a first-win
 * checklist that tracks exactly this. Offering it and letting them move on
 * respects that the checklist will ask again.
 */
const STEPS = ["Welcome", "Workspace", "Connect Gmail", "Your details", "Ready"];

const USE_CASES: Array<{
  value: WorkspaceProfile["primaryUseCase"];
  label: string;
  detail: string;
  icon: IconName;
}> = [
  { value: "SALES", label: "Sales outreach", detail: "Create qualified conversations", icon: "chart" },
  { value: "AGENCY", label: "Agency campaigns", detail: "Run focused client outreach", icon: "team" },
  { value: "RECRUITING", label: "Recruiting", detail: "Reach and follow up with candidates", icon: "users" },
  { value: "FUNDRAISING", label: "Fundraising", detail: "Build investor conversations", icon: "reply" },
  { value: "PARTNERSHIPS", label: "Partnerships", detail: "Develop strategic relationships", icon: "repeat" },
  { value: "CUSTOMER_SUCCESS", label: "Customer success", detail: "Keep customer communication moving", icon: "check" },
  { value: "OTHER", label: "Another workflow", detail: "Adapt Cadence to your process", icon: "sparkles" },
];

/**
 * The persisted onboarding status keeps its old six values, because they are
 * written to Firestore and half-finished accounts already carry them. Only the
 * mapping to a screen changed: PROFILE_COMPLETE and DEFAULTS_SET both land on
 * the single details step, and anyone who had reached the old test step is
 * already done.
 */
function initialStep(
  status: string,
  gmailConnected: boolean,
  workspaceConfigured: boolean
): number {
  if (status === "COMPLETE" || status === "TEST_PASSED" || status === "DEFAULTS_SET") return 4;
  if (status === "PROFILE_COMPLETE") return 3;
  if (gmailConnected || status === "GMAIL_CONNECTED") return 3;
  if (workspaceConfigured) return 2;
  return 0;
}

function SetupPreview() {
  const stages = [
    { icon: "users" as const, label: "Audience" },
    { icon: "sparkles" as const, label: "Draft" },
    { icon: "clock" as const, label: "Pace" },
    { icon: "reply" as const, label: "Reply" },
  ];
  return (
    <div className="onboarding-preview mt-7" aria-label="Cadence workflow preview">
      <div className="onboarding-signal" aria-hidden />
      {stages.map((stage, index) => (
        <div key={stage.label} className="relative z-10 flex flex-1 flex-col items-center gap-2 text-center">
          <span
            className="onboarding-node flex h-11 w-11 items-center justify-center rounded-xl border border-border bg-surface text-foreground shadow-sm"
            style={{ animationDelay: `${index * 180}ms` }}
            aria-hidden
          >
            <Icon name={stage.icon} size={19} />
          </span>
          <span className="text-[11px] font-semibold text-muted">{stage.label}</span>
        </div>
      ))}
    </div>
  );
}

export function OnboardingWizard({
  displayName,
  onboardingStatus,
  gmailConnected,
  connectedEmail,
  profile,
  workspaceName: initialWorkspaceName,
  workspaceProfile,
  canConfigureWorkspace,
}: {
  displayName: string;
  onboardingStatus: string;
  gmailConnected: boolean;
  connectedEmail: string | null;
  profile: SenderProfile;
  workspaceName: string;
  workspaceProfile: WorkspaceProfile;
  canConfigureWorkspace: boolean;
}) {
  const router = useRouter();
  const [step, setStep] = useState(() =>
    initialStep(onboardingStatus, gmailConnected, workspaceProfile.configuredAt !== null)
  );
  const [busy, setBusy] = useState(false);
  const [testSent, setTestSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [workspaceName, setWorkspaceName] = useState(initialWorkspaceName);
  const [industry, setIndustry] = useState(workspaceProfile.industry);
  const [teamSize, setTeamSize] = useState(workspaceProfile.teamSize);
  const [monthlyEmailGoal, setMonthlyEmailGoal] = useState(workspaceProfile.monthlyEmailGoal);
  const [primaryUseCase, setPrimaryUseCase] = useState(workspaceProfile.primaryUseCase);

  async function advance(status: string, nextStep: number) {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? "Could not save setup progress.");
      }
      setStep(nextStep);
      router.refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not save setup progress.");
    } finally {
      setBusy(false);
    }
  }

  async function saveWorkspace() {
    if (!canConfigureWorkspace) {
      setStep(2);
      return;
    }
    if (!workspaceName.trim()) {
      setError("Enter a workspace name.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/onboarding/workspace", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceName: workspaceName.trim(),
          industry: industry.trim(),
          teamSize,
          monthlyEmailGoal,
          primaryUseCase,
        }),
      });
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "Could not save workspace preferences.");
      setStep(2);
      router.refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not save workspace preferences.");
    } finally {
      setBusy(false);
    }
  }

  async function sendTest() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/templates/test-send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subjectTemplate: "Your Cadence setup test",
          htmlTemplate:
            "<p>Hi {{sender_name}},</p><p>This is your setup test from Cadence. If you can read this, your Gmail connection works.</p><p>{{unsubscribe_text}}</p>",
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Test send failed.");
      setTestSent(true);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Test send failed.");
    } finally {
      setBusy(false);
    }
  }

  function startTour() {
    window.dispatchEvent(new Event("outreach:start-tour"));
    router.push("/home");
  }

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-5 flex items-center justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-foreground">Workspace setup</p>
          <p className="mt-1 text-sm text-muted">A guided path to your first safe test campaign.</p>
        </div>
        <span className="rounded-full border border-border bg-surface px-3 py-1.5 text-xs font-medium text-muted">
          {step + 1} of {STEPS.length}
        </span>
      </div>

      <div className="h-1.5 overflow-hidden rounded-full bg-surface-2" aria-hidden>
        <div
          className="bg-success h-full rounded-full transition-[width] duration-500"
          style={{ width: `${((step + 1) / STEPS.length) * 100}%` }}
        />
      </div>
      <ol className="mt-3 grid grid-cols-4 gap-1 text-[10px] sm:grid-cols-7 sm:text-xs" aria-label="Setup progress">
        {STEPS.map((label, index) => (
          <li
            key={label}
            aria-current={index === step ? "step" : undefined}
            className={`min-h-8 rounded-lg px-2 py-2 text-center font-medium ${
              index < step
                ? "bg-success-soft text-success"
                : index === step
                  ? "bg-surface-2 text-foreground"
                  : "text-muted"
            }`}
          >
            {label}
          </li>
        ))}
      </ol>

      <div className="mt-5 card overflow-hidden">
        <div className="p-6 sm:p-9">
          {error && <p role="alert" className="alert-danger mb-5 rounded-xl border p-3 text-sm text-danger">{error}</p>}

          {step === 0 && (
            <div className="grid items-center gap-8 lg:grid-cols-[1.05fr_0.95fr]">
              <div>
                <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-surface-2 text-foreground" aria-hidden>
                  <Icon name="sparkles" size={21} />
                </span>
                <h1 className="mt-5 text-3xl font-semibold tracking-tight sm:text-4xl">
                  Welcome, {displayName.split(" ")[0]}. Let&apos;s shape your workspace.
                </h1>
                <p className="mt-4 max-w-xl text-base leading-7 text-muted">
                  A few answers help Cadence organize your team, tailor guidance, and recommend a
                  responsible starting pace. They never bypass Gmail, plan, or safety limits.
                </p>
                <button onClick={() => setStep(1)} className="btn-primary mt-6 min-h-11 px-5 py-2.5">
                  Personalize my setup
                </button>
              </div>
              <div className="rounded-2xl border border-border bg-surface-2 p-5 sm:p-6">
                <p className="text-xs font-semibold uppercase tracking-[0.15em] text-info">Your first workflow</p>
                <SetupPreview />
                <div className="mt-6 grid gap-2 text-sm text-muted">
                  <p className="flex items-center gap-2"><Icon name="shield" size={16} className="text-success" /> Test mode stays on during setup.</p>
                  <p className="flex items-center gap-2"><Icon name="check" size={16} className="text-success" /> You approve the audience and message.</p>
                  <p className="flex items-center gap-2"><Icon name="reply" size={16} className="text-success" /> Replies return to your Gmail thread.</p>
                </div>
              </div>
            </div>
          )}

          {step === 1 && (
            <>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-foreground">Workspace profile</p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight">Make Cadence fit the way you work.</h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-muted">
                {canConfigureWorkspace
                  ? "These shared settings help tailor onboarding and future recommendations. Planned volume is context, not a promise or automatic send cap."
                  : `You are joining ${initialWorkspaceName}. An administrator controls shared workspace settings; your personal Gmail and sender profile come next.`}
              </p>

              {canConfigureWorkspace ? (
                <div className="mt-7 space-y-6">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <label className="text-sm font-medium text-foreground">
                      Workspace name
                      <input
                        value={workspaceName}
                        onChange={(event) => setWorkspaceName(event.target.value)}
                        maxLength={80}
                        className="mt-1 min-h-11 w-full rounded-xl border border-border bg-surface px-3 py-2 text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-border"
                      />
                    </label>
                    <label className="text-sm font-medium text-foreground">
                      Industry
                      <input
                        value={industry}
                        onChange={(event) => setIndustry(event.target.value)}
                        maxLength={80}
                        placeholder="Financial services, software, recruiting..."
                        className="mt-1 min-h-11 w-full rounded-xl border border-border bg-surface px-3 py-2 text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-border"
                      />
                    </label>
                    <label className="text-sm font-medium text-foreground">
                      People using this workspace
                      <select
                        value={teamSize}
                        onChange={(event) => setTeamSize(event.target.value as WorkspaceProfile["teamSize"])}
                        className="mt-1 min-h-11 w-full rounded-xl border border-border bg-surface px-3 py-2 text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-border"
                      >
                        <option value="JUST_ME">Just me</option>
                        <option value="2_5">2 to 5 people</option>
                        <option value="6_20">6 to 20 people</option>
                        <option value="21_50">21 to 50 people</option>
                        <option value="51_PLUS">51 or more people</option>
                      </select>
                    </label>
                    <label className="text-sm font-medium text-foreground">
                      Planned outreach per month
                      <select
                        value={monthlyEmailGoal}
                        onChange={(event) => setMonthlyEmailGoal(event.target.value as WorkspaceProfile["monthlyEmailGoal"])}
                        className="mt-1 min-h-11 w-full rounded-xl border border-border bg-surface px-3 py-2 text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-border"
                      >
                        <option value="UNDER_500">Fewer than 500 emails</option>
                        <option value="500_2000">500 to 2,000 emails</option>
                        <option value="2001_10000">2,001 to 10,000 emails</option>
                        <option value="10000_PLUS">More than 10,000 emails</option>
                        <option value="NOT_SURE">Not sure yet</option>
                      </select>
                    </label>
                  </div>

                  <fieldset>
                    <legend className="text-sm font-medium text-foreground">Primary workflow</legend>
                    <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                      {USE_CASES.map((useCase) => {
                        const selected = primaryUseCase === useCase.value;
                        return (
                          <label
                            key={useCase.value}
                            className={`flex min-h-20 cursor-pointer items-start gap-3 rounded-xl border p-3 transition ${
                              selected
                                ? "border-border bg-surface-2"
                                : "border-border bg-surface hover:border-border"
                            }`}
                          >
                            <input
                              type="radio"
                              name="primaryUseCase"
                              value={useCase.value}
                              checked={selected}
                              onChange={() => setPrimaryUseCase(useCase.value)}
                              className="sr-only"
                            />
                            <Icon name={useCase.icon} size={18} className={selected ? "text-foreground" : "text-muted"} />
                            <span>
                              <span className="block text-sm font-medium text-foreground">{useCase.label}</span>
                              <span className="mt-0.5 block text-xs leading-5 text-muted">{useCase.detail}</span>
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  </fieldset>
                </div>
              ) : (
                <div className="mt-6 rounded-xl border border-border bg-surface-2 p-5">
                  <p className="font-medium text-foreground">{initialWorkspaceName}</p>
                  <p className="mt-1 text-sm text-muted">Your account remains private to this workspace and its assigned team structure.</p>
                </div>
              )}

              <div className="mt-7 flex flex-wrap gap-3">
                <button onClick={() => void saveWorkspace()} disabled={busy} className="btn-primary min-h-11 px-5 py-2.5 disabled:opacity-50">
                  {busy ? "Saving..." : canConfigureWorkspace ? "Save and connect Gmail" : "Continue to Gmail"}
                </button>
                <button onClick={() => setStep(0)} className="btn-ghost min-h-11 px-4 py-2.5">Back</button>
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-foreground">Connection</p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight">Connect your Gmail.</h1>
              <p className="mt-3 max-w-2xl leading-7 text-muted">
                Cadence can send approved messages as you and read replies to campaign threads.
                It cannot delete email or change account settings. Disconnect at any time in Settings.
              </p>
              {gmailConnected ? (
                <>
                  <p className="alert-success mt-5 rounded-xl border p-4 text-sm text-success">
                    Connected as <strong>{connectedEmail}</strong>
                  </p>
                  <button onClick={() => setStep(3)} className="btn-primary mt-5 min-h-11 px-5 py-2.5">Continue</button>
                </>
              ) : (
                <a href="/api/gmail/connect" className="btn-primary mt-5 min-h-11 px-5 py-2.5">Connect Gmail securely</a>
              )}
            </>
          )}

          {step === 3 && (
            <>
              <h1 className="text-3xl font-semibold tracking-tight">Set your sender identity.</h1>
              <p className="mt-2 text-sm leading-6 text-muted">
                These details personalize your messages and provide the business-address footer that
                campaign launch requires. Sending defaults are set here too, and every one of them
                can be changed per campaign later.
              </p>
              {/* One pass over the full form. This used to be two steps, both
                  rendering this same component, so the second asked a user to
                  look again at a form they had just completed. */}
              <div className="mt-5">
                {/* Straight to COMPLETE. The test send used to be the step
                    that set it, and it is optional now, so gating completion on
                    it would leave every account permanently mid-onboarding. */}
                <ProfileForm initial={profile} onSaved={() => void advance("COMPLETE", 4)} />
              </div>
            </>
          )}

          {step === 4 && (
            <div className="grid items-center gap-8 lg:grid-cols-[1fr_0.9fr]">
              <div>
                <span className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-success-soft text-success" aria-hidden>
                  <Icon name="check" size={24} />
                </span>
                <h1 className="mt-5 text-3xl font-semibold tracking-tight">Your workspace is ready.</h1>
                <p className="mt-3 max-w-xl leading-7 text-muted">
                  Three starter templates are already waiting in Templates, written to pass the
                  spam check and the launch requirements. Edit one, bring in a small list, and send
                  a test campaign to yourself.
                </p>
                {/* The test send used to be a step of its own, standing between
                    a new user and a working app. It is offered here and the
                    first-win checklist on Home asks again, so nobody is held up
                    and nobody forgets. */}
                {!testSent ? (
                  <button
                    onClick={() => void sendTest()}
                    disabled={busy}
                    className="btn-secondary mt-5 min-h-11 px-5 py-2.5 text-sm disabled:opacity-50"
                  >
                    {busy ? "Sending..." : "Send yourself a test email now"}
                  </button>
                ) : (
                  <p className="alert-success mt-5 rounded-xl border p-3 text-sm text-success">
                    Test sent. Check your inbox, links, signature, and footer.
                  </p>
                )}
                <div className="mt-6 flex flex-wrap gap-3">
                  <button onClick={startTour} className="btn-primary min-h-11 px-5 py-2.5">Start interactive tour</button>
                  <Link href="/templates" className="btn-secondary min-h-11 px-5 py-2.5">See my templates</Link>
                  <Link href="/leads" className="btn-ghost min-h-11 px-4 py-2.5">Import leads</Link>
                </div>
              </div>
              <div className="rounded-2xl border border-border bg-surface-2 p-6">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-info">First success milestone</p>
                <ol className="mt-4 space-y-4 text-sm">
                  {[
                    "Edit one of your three starter templates",
                    "Import and review a relevant lead list",
                    "Run a test-mode campaign",
                    "Review results before requesting live sending",
                  ].map((item, index) => (
                    <li key={item} className="flex items-start gap-3 text-muted">
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-surface-2 text-xs font-semibold text-foreground">{index + 1}</span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ol>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
