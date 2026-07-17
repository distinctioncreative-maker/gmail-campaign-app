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
      <div className="w-full max-w-md rounded-2xl bg-white p-10 shadow-lg">
        <h1 className="text-2xl font-semibold text-slate-900">Outreach</h1>
        <p className="mt-2 text-slate-600">
          Send personal email campaigns through your own Gmail. Your campaigns and
          contacts are private to you.
        </p>
        <button
          onClick={handleSignIn}
          disabled={busy}
          className="mt-8 w-full rounded-xl bg-primary px-4 py-3 font-medium text-white transition hover:bg-primary-hover disabled:opacity-50"
        >
          {busy ? "Signing in…" : "Sign in with Google"}
        </button>
        {error && (
          <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">
            {error}
          </p>
        )}
        <p className="mt-6 text-xs text-slate-500">
          Sign-in is limited to your company&apos;s Google Workspace accounts.
        </p>
      </div>
    </main>
  );
}
