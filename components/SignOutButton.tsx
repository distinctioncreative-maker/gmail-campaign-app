"use client";

import { useRouter } from "next/navigation";

export function SignOutButton() {
  const router = useRouter();
  return (
    <button
      onClick={async () => {
        await fetch("/api/auth/session", { method: "DELETE" });
        const { signOutGoogle } = await import("@/lib/firebase/client");
        await signOutGoogle();
        router.push("/sign-in");
      }}
      aria-label="Sign out"
      title="Sign out"
      className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
    >
      <span aria-hidden>⎋</span>
    </button>
  );
}
