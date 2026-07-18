"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

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
      <div className="brand-gradient relative hidden overflow-hidden p-12 text-white lg:flex lg:flex-col">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-30"
          style={{
            backgroundImage:
              "radial-gradient(600px 300px at 80% 10%, rgba(255,255,255,.35), transparent 60%), radial-gradient(500px 300px at 10% 90%, rgba(255,255,255,.25), transparent 55%)",
          }}
        />
        <div className="relative flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/20 text-sm font-bold backdrop-blur">
            ML
          </span>
          <span className="text-2xl font-semibold tracking-tight">MassLeader</span>
        </div>

        <div className="relative mt-auto">
          <h2 className="text-3xl font-semibold leading-tight">
            Personal email campaigns,
            <br /> sent from your own Gmail.
          </h2>
          <ul className="mt-8 space-y-4 text-white/90">
            <li className="flex items-center gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/15">✉️</span>
              Sends through your Gmail — replies come to your inbox
            </li>
            <li className="flex items-center gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/15">🔒</span>
              Your leads and campaigns stay private to you
            </li>
            <li className="flex items-center gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/15">🛑</span>
              Follow-ups stop automatically when someone replies
            </li>
          </ul>
        </div>
      </div>

      {/* Sign-in panel */}
      <div className="flex items-center justify-center p-6">
        <div className="w-full max-w-sm animate-rise">
          <div className="mb-6 flex items-center gap-3 lg:hidden">
            <span className="brand-gradient flex h-10 w-10 items-center justify-center rounded-2xl text-xs font-bold text-white shadow-md">
              ML
            </span>
            <span className="text-xl font-semibold tracking-tight text-slate-900">MassLeader</span>
          </div>

          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Welcome back</h1>
          <p className="mt-2 text-sm text-slate-600">
            Sign in with your work Google account to continue.
          </p>

          <button
            onClick={handleSignIn}
            disabled={busy}
            className="btn-primary mt-7 flex w-full items-center justify-center gap-2 px-4 py-3.5 disabled:opacity-50"
          >
            <span aria-hidden className="text-base">🔑</span>
            {busy ? "Signing in…" : "Sign in with Google"}
          </button>
          {error && (
            <p role="alert" className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">
              {error}
            </p>
          )}
          <p className="mt-6 text-xs text-slate-400">
            Sign-in is limited to your company&apos;s Google Workspace accounts.
          </p>
        </div>
      </div>
    </main>
  );
}
