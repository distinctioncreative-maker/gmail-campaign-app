"use client";

import { useRouter } from "next/navigation";

export function SignOutButton() {
  const router = useRouter();
  return (
    <button
      onClick={async () => {
        await fetch("/api/auth/session", { method: "DELETE" });
        router.push("/sign-in");
      }}
      className="mt-2 w-full rounded-lg px-2 py-1.5 text-left text-sm text-slate-500 hover:bg-slate-100"
    >
      Sign out
    </button>
  );
}
