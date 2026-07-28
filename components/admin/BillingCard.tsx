"use client";

import { useEffect, useState } from "react";
import { fetchJson } from "@/lib/fetchJson";
import { useToast } from "@/components/ui/UIProviders";

interface BillingState {
  configured: boolean;
  plan: string;
  planName: string;
  status: string;
  hasSubscription: boolean;
}

const STATUS_LABEL: Record<string, string> = {
  none: "No subscription",
  trialing: "Trialing",
  active: "Active",
  past_due: "Payment due",
  canceled: "Canceled",
};

/** Plan + subscription management. Shows upgrade paths when Stripe is
 * configured; otherwise a "coming soon" note (matches the public pricing). */
export function BillingCard() {
  const toast = useToast();
  const [state, setState] = useState<BillingState | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    fetchJson<BillingState>("/api/billing")
      .then(setState)
      .catch(() => setState(null));
  }, []);

  async function checkout(plan: "STARTER" | "TEAM") {
    setBusy(plan);
    try {
      const res = await fetchJson<{ url: string }>("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan }),
      });
      window.location.href = res.url;
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not start checkout.", "error");
      setBusy(null);
    }
  }

  async function manage() {
    setBusy("manage");
    try {
      const res = await fetchJson<{ url: string }>("/api/billing/portal", { method: "POST" });
      window.location.href = res.url;
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not open billing.", "error");
      setBusy(null);
    }
  }

  if (!state) return <div className="card p-6 text-sm text-muted">Loading…</div>;

  return (
    <div className="card p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-medium">Plan &amp; billing</h2>
          <p className="mt-1 text-sm text-muted">
            Current plan: <strong>{state.planName}</strong>
            {state.status !== "none" && (
              <span className="text-muted"> · {STATUS_LABEL[state.status] ?? state.status}</span>
            )}
          </p>
        </div>
        {state.hasSubscription && (
          <button onClick={() => void manage()} disabled={busy === "manage"} className="btn-secondary px-4 py-2 text-sm disabled:opacity-50">
            {busy === "manage" ? "Opening…" : "Manage billing"}
          </button>
        )}
      </div>

      {!state.configured ? (
        <p className="mt-4 rounded-lg bg-surface-2 p-3 text-sm text-muted">
          Paid plans open at launch. You&apos;re on <strong>{state.planName}</strong> for now with full access.
        </p>
      ) : (
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <PlanTile
            name="Starter"
            price="$29 / seat · mo"
            blurb="Solo rep, higher daily volume, all the essentials."
            onPick={() => void checkout("STARTER")}
            busy={busy === "STARTER"}
          />
          <PlanTile
            name="Team"
            price="$24 / seat · mo"
            blurb="Shared team, roles, leaderboards, highest volume."
            featured
            onPick={() => void checkout("TEAM")}
            busy={busy === "TEAM"}
          />
        </div>
      )}
    </div>
  );
}

function PlanTile({
  name, price, blurb, featured = false, busy, onPick,
}: {
  name: string; price: string; blurb: string; featured?: boolean; busy: boolean; onPick: () => void;
}) {
  return (
    <div className={`rounded-xl border p-4 ${featured ? "border-primary bg-primary-soft/40" : "border-border"}`}>
      <div className="flex items-baseline justify-between">
        <span className="font-medium">{name}</span>
        <span className="text-sm text-muted">{price}</span>
      </div>
      <p className="mt-1 text-xs text-muted">{blurb}</p>
      <button onClick={onPick} disabled={busy} className="btn-primary mt-3 w-full px-4 py-2 text-sm disabled:opacity-50">
        {busy ? "Starting…" : `Choose ${name}`}
      </button>
    </div>
  );
}
