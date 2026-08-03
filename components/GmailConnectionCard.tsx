"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LocalTime } from "@/components/LocalTime";

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
      <p className="mt-1 text-sm text-muted">
        Campaigns send through your own Gmail account. The app can create and send
        email drafts for you and read replies to your campaign threads. It cannot
        delete your email or change your account settings.
      </p>

      {connectedEmail ? (
        <div className="mt-4">
          <p className="text-sm">
            <span className="font-medium text-success">Connected</span> as{" "}
            <span className="font-medium">{connectedEmail}</span>
          </p>
          {lastRefreshAt && (
            <p className="mt-1 text-xs text-muted">
              Last verified <LocalTime value={lastRefreshAt} />
            </p>
          )}
          <button
            onClick={disconnect}
            disabled={busy}
            className="btn-danger mt-4 px-4 py-2 text-sm"
          >
            {busy ? "Disconnecting…" : "Disconnect Gmail"}
          </button>
        </div>
      ) : (
        <a
          href="/api/gmail/connect"
          className="btn-primary mt-4 px-5 py-2.5"
        >
          Connect Gmail
        </a>
      )}
    </div>
  );
}
