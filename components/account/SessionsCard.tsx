"use client";

import { useState } from "react";
import { fetchJson } from "@/lib/fetchJson";
import { useConfirm, useToast } from "@/components/ui/UIProviders";
import { LocalTime } from "@/components/LocalTime";

/**
 * Sign out everywhere.
 *
 * The copy carries the honest limitation rather than hiding it. Firebase does
 * not expose the session cookies it has issued, so there is no device list to
 * show, and a card that displayed "1 active session" would be inventing a number
 * someone might rely on. It says what it does know: when the account last signed
 * in, when it last revoked, and that the button ends everything including this
 * browser.
 */
export function SessionsCard({
  lastLoginAt,
  sessionsRevokedAt,
}: {
  lastLoginAt: number | null;
  sessionsRevokedAt: number | null;
}) {
  const toast = useToast();
  const confirm = useConfirm();
  const [busy, setBusy] = useState(false);
  const [revokedAt, setRevokedAt] = useState<number | null>(sessionsRevokedAt);

  async function revoke() {
    const ok = await confirm({
      title: "Sign out everywhere?",
      body: "Every browser and device signed in to this account is signed out, including this one. You will need to sign in again.",
      confirmLabel: "Sign out everywhere",
      danger: true,
    });
    if (!ok) return;
    setBusy(true);
    try {
      const res = await fetchJson<{ sessionsRevokedAt: number }>("/api/account/sessions", {
        method: "POST",
      });
      setRevokedAt(res.sessionsRevokedAt);
      toast("Signed out everywhere. Redirecting to sign-in.", "success");
      // The cookie is gone and every stored one is now invalid, so staying on a
      // dashboard page would only produce failing requests.
      window.location.href = "/sign-in";
    } catch (err) {
      toast(err instanceof Error ? err.message : "That did not work.", "error");
      setBusy(false);
    }
  }

  return (
    <div className="card p-6">
      <h2 className="font-medium">Signed-in devices</h2>
      <p className="mt-1 max-w-2xl text-sm text-muted">
        A sign-in lasts five days on each browser. If you signed in somewhere you no longer control,
        or someone has a copy of your laptop, end every session at once.
      </p>
      <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-xs text-muted">Last sign-in</dt>
          <dd className="mt-0.5">
            {lastLoginAt === null ? "Not recorded" : <LocalTime value={lastLoginAt} />}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted">Last signed out everywhere</dt>
          <dd className="mt-0.5">
            {revokedAt === null ? "Never" : <LocalTime value={revokedAt} />}
          </dd>
        </div>
      </dl>
      <p className="mt-4 text-xs text-muted">
        Cadence cannot list the individual devices, so this is all or nothing. Signing out everywhere
        also signs out this browser.
      </p>
      <button
        onClick={() => void revoke()}
        disabled={busy}
        className="btn-secondary mt-4 min-h-11 px-4 py-2.5 text-sm disabled:opacity-50"
      >
        {busy ? "Signing out…" : "Sign out everywhere"}
      </button>
    </div>
  );
}
