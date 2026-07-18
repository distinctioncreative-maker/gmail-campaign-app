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
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-md">
        <div className="mb-6 flex items-center justify-center gap-3">
          <span
            aria-hidden
            className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-accent text-lg font-bold text-white shadow-md"
          >
            O
          </span>
          <span className="text-2xl font-semibold tracking-tight text-slate-900">Outreach</span>
        </div>

        <div className="card p-8">
          <h1 className="text-xl font-semibold text-slate-900">Welcome back</h1>
          <p className="mt-2 text-sm text-slate-600">
            Send personal email campaigns through your own Gmail. Your campaigns and
            contacts stay private to you.
          </p>
          <button
            onClick={handleSignIn}
            disabled={busy}
            className="btn-primary mt-7 flex w-full items-center justify-center gap-2 px-4 py-3 disabled:opacity-50"
          >
            <span aria-hidden className="text-base">🔑</span>
            {busy ? "Signing in…" : "Sign in with Google"}
          </button>
          {error && (
            <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">
              {error}
            </p>
          )}
          <p className="mt-6 border-t border-border pt-4 text-xs text-slate-500">
            Sign-in is limited to your company&apos;s Google Workspace accounts.
          </p>
        </div>

        <div className="mt-6 grid grid-cols-3 gap-3 text-center text-xs text-slate-500">
          <div className="card p-3">
            <p className="text-base">✉️</p>
            <p className="mt-1">Sends from your Gmail</p>
          </div>
          <div className="card p-3">
            <p className="text-base">🔒</p>
            <p className="mt-1">Private to you</p>
          </div>
          <div className="card p-3">
            <p className="text-base">🛑</p>
            <p className="mt-1">Stops on reply</p>
          </div>
        </div>
      </div>
    </main>
  );
}
