"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { fetchJson } from "@/lib/fetchJson";
import { useToast } from "@/components/ui/UIProviders";

/**
 * Runs an on-demand reply + bounce scan across the user's mailbox and refreshes
 * the analytics so newly-detected replies show up immediately — for when a real
 * reply came in but the periodic sweep hasn't reconciled it yet.
 */
export function ScanRepliesButton() {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  async function scan() {
    setBusy(true);
    try {
      const res = await fetchJson<{ message?: string }>("/api/replies/scan", { method: "POST" });
      toast(res.message ?? "Checked for replies.", "success");
      router.refresh();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not scan for replies.", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <button onClick={() => void scan()} disabled={busy} className="btn-secondary px-4 py-2 text-sm">
      {busy ? "Scanning…" : "Scan for replies"}
    </button>
  );
}
