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
        router.push("/");
        router.refresh();
      }}
      aria-label="Sign out"
      title="Sign out"
      className="rounded-lg p-2 text-muted/70 hover:bg-surface-2 hover:text-foreground"
    >
      <span aria-hidden>⎋</span>
    </button>
  );
}
