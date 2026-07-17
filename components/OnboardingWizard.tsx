"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ProfileForm } from "./ProfileForm";
import type { SenderProfile } from "@/schemas/userSettings";

const STEPS = ["Welcome", "Connect Gmail", "Your details", "Sending defaults", "Test", "Ready"];

function initialStep(status: string, gmailConnected: boolean): number {
  if (status === "COMPLETE") return 5;
  if (status === "TEST_PASSED") return 5;
  if (status === "DEFAULTS_SET") return 4;
  if (status === "PROFILE_COMPLETE") return 3;
  if (gmailConnected) return 2;
  return 0;
}

export function OnboardingWizard({
  displayName,
  onboardingStatus,
  gmailConnected,
  connectedEmail,
  profile,
}: {
  displayName: string;
  onboardingStatus: string;
  gmailConnected: boolean;
  connectedEmail: string | null;
  profile: SenderProfile;
}) {
  const router = useRouter();
  const [step, setStep] = useState(() => initialStep(onboardingStatus, gmailConnected));
  const [busy, setBusy] = useState(false);
  const [testSent, setTestSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function advance(status: string, nextStep: number) {
    setBusy(true);
    await fetch("/api/onboarding", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    setBusy(false);
    setStep(nextStep);
    router.refresh();
  }

  async function sendTest() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/templates/test-send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subjectTemplate: "Your Outreach setup test",
          htmlTemplate:
            "<p>Hi {{sender_name}},</p><p>This is your setup test from Outreach. If you can read this, your Gmail connection works.</p><p>{{unsubscribe_text}}</p>",
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Test send failed.");
      setTestSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Test send failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <ol className="flex flex-wrap gap-2 text-xs" aria-label="Setup progress">
        {STEPS.map((s, i) => (
          <li
            key={s}
            className={`rounded-full px-3 py-1 ${
              i < step
                ? "bg-green-100 text-green-700"
                : i === step
                  ? "bg-primary text-white"
                  : "bg-slate-100 text-slate-400"
            }`}
          >
            {s}
          </li>
        ))}
      </ol>

      <div className="mt-6 rounded-2xl bg-white p-8 shadow-sm">
        {error && <p className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}

        {step === 0 && (
          <>
            <h1 className="text-2xl font-semibold">Welcome, {displayName.split(" ")[0]} 👋</h1>
            <ul className="mt-4 space-y-3 text-slate-600">
              <li>✉️ Emails send from <strong>your own Gmail</strong> — replies land in your inbox.</li>
              <li>🔒 Your leads and campaigns are <strong>private to you</strong>.</li>
              <li>🛑 When someone replies, follow-ups to them <strong>stop automatically</strong>.</li>
              <li>👀 You&apos;re responsible for reviewing recipients and messages before sending.</li>
            </ul>
            <button
              onClick={() => setStep(1)}
              className="mt-6 rounded-xl bg-primary px-5 py-2.5 font-medium text-white hover:bg-primary-hover"
            >
              Let&apos;s get set up
            </button>
          </>
        )}

        {step === 1 && (
          <>
            <h1 className="text-2xl font-semibold">Connect your Gmail</h1>
            <p className="mt-3 text-slate-600">
              The app will be able to <strong>send emails as you</strong> and{" "}
              <strong>read replies to your campaign threads</strong>. It cannot delete your
              email or change your account settings. You can disconnect at any time from
              Settings.
            </p>
            {gmailConnected ? (
              <>
                <p className="mt-4 rounded-lg bg-green-50 p-3 text-sm text-green-700">
                  Connected as <strong>{connectedEmail}</strong>
                </p>
                <button
                  onClick={() => setStep(2)}
                  className="mt-4 rounded-xl bg-primary px-5 py-2.5 font-medium text-white hover:bg-primary-hover"
                >
                  Continue
                </button>
              </>
            ) : (
              <a
                href="/api/gmail/connect"
                className="mt-5 inline-block rounded-xl bg-primary px-5 py-2.5 font-medium text-white hover:bg-primary-hover"
              >
                Connect Gmail
              </a>
            )}
          </>
        )}

        {step === 2 && (
          <>
            <h1 className="text-2xl font-semibold">Tell us about you</h1>
            <p className="mt-1 text-sm text-slate-500">
              These details fill in your email signatures and required footer.
            </p>
            <div className="mt-4">
              <ProfileForm
                initial={profile}
                compact
                onSaved={() => void advance("PROFILE_COMPLETE", 3)}
              />
            </div>
          </>
        )}

        {step === 3 && (
          <>
            <h1 className="text-2xl font-semibold">Sending defaults</h1>
            <p className="mt-1 text-sm text-slate-500">
              Safe defaults are pre-filled — most people keep them.
            </p>
            <div className="mt-4">
              <ProfileForm
                initial={profile}
                onSaved={() => void advance("DEFAULTS_SET", 4)}
              />
            </div>
          </>
        )}

        {step === 4 && (
          <>
            <h1 className="text-2xl font-semibold">Send yourself a test</h1>
            <p className="mt-3 text-slate-600">
              We&apos;ll send one test email through your Gmail so you can confirm everything
              looks right.
            </p>
            {!testSent ? (
              <button
                onClick={sendTest}
                disabled={busy}
                className="mt-5 rounded-xl bg-primary px-5 py-2.5 font-medium text-white hover:bg-primary-hover disabled:opacity-50"
              >
                {busy ? "Sending…" : "Send the test email"}
              </button>
            ) : (
              <>
                <p className="mt-4 rounded-lg bg-green-50 p-3 text-sm text-green-700">
                  Test sent! Check the inbox and make sure it looks right.
                </p>
                <button
                  onClick={() => void advance("COMPLETE", 5)}
                  disabled={busy}
                  className="mt-4 rounded-xl bg-primary px-5 py-2.5 font-medium text-white hover:bg-primary-hover disabled:opacity-50"
                >
                  It looked good — finish setup
                </button>
              </>
            )}
          </>
        )}

        {step === 5 && (
          <>
            <h1 className="text-2xl font-semibold">You&apos;re all set 🎉</h1>
            <p className="mt-3 text-slate-600">
              Import your leads and build your first email — campaigns are next.
            </p>
            <div className="mt-5 flex gap-3">
              <Link
                href="/leads"
                className="rounded-xl bg-primary px-5 py-2.5 font-medium text-white hover:bg-primary-hover"
              >
                Import leads
              </Link>
              <Link
                href="/templates"
                className="rounded-xl border border-slate-200 px-5 py-2.5 font-medium text-slate-700 hover:bg-slate-50"
              >
                Create a template
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
