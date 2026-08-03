"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Logo, LogoMark, APP_NAME } from "@/components/ui/Logo";
import { Icon, type IconName } from "@/components/ui/Icon";

function GoogleGIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
      <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.9c1.7-1.57 2.68-3.87 2.68-6.62Z" />
      <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.9-2.26c-.81.54-1.85.86-3.06.86-2.35 0-4.34-1.59-5.05-3.72H.94v2.33A9 9 0 0 0 9 18Z" />
      <path fill="#FBBC05" d="M3.95 10.7A5.4 5.4 0 0 1 3.67 9c0-.59.1-1.17.28-1.7V4.97H.94A9 9 0 0 0 0 9c0 1.45.35 2.83.94 4.03l3.01-2.33Z" />
      <path fill="#EA4335" d="M9 3.58c1.32 0 2.51.46 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .94 4.97l3.01 2.33C4.66 5.17 6.65 3.58 9 3.58Z" />
    </svg>
  );
}

export default function SignInPage() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSignIn() {
    setBusy(true);
    setError(null);
    try {
      const { signInWithGoogle } = await import("@/lib/firebase/client");
      const idToken = await signInWithGoogle();
      const res = await fetch("/api/auth/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken }),
      });
      if (!res.ok) {
        const body = (await res.json()) as { error?: string };
        throw new Error(body.error ?? "Sign-in failed. Please try again.");
      }
      router.push("/home");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign-in failed. Please try again.");
      setBusy(false);
    }
  }

  return (
    <main className="grid min-h-screen lg:grid-cols-2">
      {/* Brand panel */}
      <div className="brand-gradient relative hidden overflow-hidden p-12 text-brand-contrast lg:flex lg:flex-col">
        <div className="aurora" aria-hidden>
          <span className="aurora-blob b1" />
          <span className="aurora-blob b2" />
          <span className="aurora-blob b3" />
        </div>
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage:
              "radial-gradient(600px 300px at 80% 10%, rgba(255,255,255,.18), transparent 60%), radial-gradient(500px 300px at 10% 90%, rgba(255,255,255,.14), transparent 55%)",
          }}
        />

        <Link href="/" className="relative flex items-center gap-3 transition-opacity hover:opacity-80">
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-surface/15 text-brand-contrast backdrop-blur">
            <LogoMark size={26} className="[--brand-from:#fff] [--brand-to:#fff]" />
          </span>
          <span className="text-2xl font-semibold tracking-tight">{APP_NAME}</span>
        </Link>

        <div className="relative mt-auto">
          <h2 className="text-[2rem] font-semibold leading-[1.15] tracking-tight">
            Personal email campaigns,
            <br /> sent from your own Gmail.
          </h2>
          <ul className="mt-8 space-y-4 text-brand-contrast/90">
            {([
              ["mail", "Sends through your Gmail: replies come to your inbox"],
              ["shield", "Clears the deliverability gate before every send"],
              ["reply", "Follow-ups stop automatically when someone replies"],
            ] as Array<[IconName, string]>).map(([icon, label]) => (
              <li key={label} className="flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-surface/15 text-brand-contrast">
                  <Icon name={icon} size={18} />
                </span>
                {label}
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Sign-in panel */}
      <div className="relative flex items-center justify-center bg-surface-2 p-6">
        <div className="w-full max-w-sm animate-rise">
          <div className="mb-8 flex justify-center lg:hidden">
            <Logo size={26} />
          </div>

          <div className="rounded-2xl border border-border bg-surface p-8 shadow-lg">
            <h1 className="text-[1.75rem] font-semibold tracking-tight text-foreground">Welcome back</h1>
            <p className="mt-2 text-sm text-muted">Sign in with your work Google account to continue.</p>

            <button
              onClick={handleSignIn}
              disabled={busy}
              className="btn-secondary mt-7 w-full px-4 py-3.5 text-[15px] disabled:opacity-50"
            >
              {busy ? (
                "Signing in…"
              ) : (
                <>
                  <GoogleGIcon />
                  Continue with Google
                </>
              )}
            </button>
            {error && (
              <p role="alert" className="mt-4 rounded-xl bg-danger-soft p-3 text-sm text-danger">
                {error}
              </p>
            )}
            <p className="mt-6 text-xs text-muted">
              Sign-in is limited to your company&apos;s Google Workspace accounts.
            </p>
            <p className="mt-3 text-xs leading-relaxed text-muted">
              By continuing, you agree to the{" "}
              <Link href="/terms" className="font-medium text-foreground underline decoration-border underline-offset-4 hover:decoration-foreground">
                Managed Pilot Terms
              </Link>{" "}
              and acknowledge the{" "}
              <Link href="/privacy" className="font-medium text-foreground underline decoration-border underline-offset-4 hover:decoration-foreground">
                Privacy Notice
              </Link>{" "}
              and{" "}
              <Link href="/acceptable-use" className="font-medium text-foreground underline decoration-border underline-offset-4 hover:decoration-foreground">
                Acceptable Use Policy
              </Link>
              .
            </p>
          </div>

          <p className="mt-6 text-center text-sm text-muted">
            New here?{" "}
            <Link href="/" className="font-medium text-foreground underline decoration-border underline-offset-4 hover:decoration-foreground">
              See what Cadence does →
            </Link>
          </p>
        </div>
      </div>
    </main>
  );
}
