"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function GmailConnectionCard({
  connectedEmail,
  lastRefreshAt,
}: {
  connectedEmail: string | null;
  lastRefreshAt: number | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function disconnect() {
    if (!confirm("Disconnect Gmail? Scheduled sending will stop until you reconnect.")) return;
    setBusy(true);
    await fetch("/api/gmail/disconnect", { method: "POST" });
    setBusy(false);
    router.refresh();
  }

  return (
    <div className="card p-6">
      <h2 className="font-medium">Gmail connection</h2>
      <p className="mt-1 text-sm text-slate-600">
        Campaigns send through your own Gmail account. The app can create and send
        email drafts for you and read replies to your campaign threads. It cannot
        delete your email or change your account settings.
      </p>

      {connectedEmail ? (
        <div className="mt-4">
          <p className="text-sm">
            <span className="font-medium text-green-600">Connected</span> as{" "}
            <span className="font-medium">{connectedEmail}</span>
          </p>
          {lastRefreshAt && (
            <p className="mt-1 text-xs text-slate-500">
              Last verified {new Date(lastRefreshAt).toLocaleString()}
            </p>
          )}
          <button
            onClick={disconnect}
            disabled={busy}
            className="mt-4 rounded-xl border border-red-200 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
          >
            {busy ? "Disconnecting…" : "Disconnect Gmail"}
          </button>
        </div>
      ) : (
        <a
          href="/api/gmail/connect"
          className="mt-4 inline-block rounded-xl bg-primary px-5 py-2.5 font-medium text-white hover:bg-primary-hover"
        >
          Connect Gmail
        </a>
      )}
    </div>
  );
}
