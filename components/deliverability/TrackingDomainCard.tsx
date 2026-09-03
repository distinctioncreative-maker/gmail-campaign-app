"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchJson } from "@/lib/fetchJson";
import { useToast, useConfirm } from "@/components/ui/UIProviders";
import { Icon } from "@/components/ui/Icon";

/**
 * Your own tracking domain.
 *
 * Lives on Deliverability rather than Settings because that is where the rest of
 * the reputation work is, and this is reputation work: without it every
 * customer's tracked links carry one hostname shared by the whole platform, so
 * one sender's problem becomes everyone's.
 *
 * The card states that plainly rather than selling the feature. A customer who
 * does not understand why the shared domain is a risk will not bother with a
 * DNS record, and then the risk stays.
 */

type Status = "NONE" | "PENDING" | "VERIFIED" | "FAILED";

interface Dns {
  type: string;
  name: string;
  value: string;
  ttl: string;
}

interface DomainState {
  domain: { host: string; status: Status; verifiedAt: number | null; lastCheckedAt: number | null };
  summary: string;
  dns: Dns | null;
  suggestion: Dns;
}

export function TrackingDomainCard({ isAdmin }: { isAdmin: boolean }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [state, setState] = useState<DomainState | null>(null);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetchJson<DomainState>("/api/tracking-domain");
      setState(res);
      setInput(res.domain.host);
    } catch {
      setState(null);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  async function save() {
    setBusy(true);
    try {
      const res = await fetchJson<{ message: string; verified: boolean }>("/api/tracking-domain", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ host: input }),
      });
      toast(res.message, res.verified ? "success" : "info");
      await load();
    } catch (err) {
      toast(err instanceof Error ? err.message : "That did not save.", "error");
    } finally {
      setBusy(false);
    }
  }

  async function recheck() {
    setBusy(true);
    try {
      const res = await fetchJson<{ message: string; verified: boolean }>("/api/tracking-domain", {
        method: "POST",
      });
      toast(res.message, res.verified ? "success" : "info");
      await load();
    } catch (err) {
      toast(err instanceof Error ? err.message : "That did not work.", "error");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    const ok = await confirm({
      title: "Stop using your own tracking domain?",
      body: "New sends go back to Cadence's shared domain. Links in emails already delivered still point at your domain, so leave the CNAME in place while recent campaigns are being read or those links will stop working.",
      confirmLabel: "Use the shared domain",
      danger: true,
    });
    if (!ok) return;
    setBusy(true);
    try {
      const res = await fetchJson<{ message: string }>("/api/tracking-domain", { method: "DELETE" });
      toast(res.message, "success");
      await load();
    } catch (err) {
      toast(err instanceof Error ? err.message : "That did not work.", "error");
    } finally {
      setBusy(false);
    }
  }

  if (!state) {
    return (
      <div className="card p-6 sm:p-7">
        <h2>Tracking domain</h2>
        <p className="mt-2 text-muted">Loading…</p>
      </div>
    );
  }

  const { domain, dns, suggestion } = state;
  const shown = dns ?? suggestion;
  const verified = domain.status === "VERIFIED";

  return (
    <div className="card p-6 sm:p-7">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2>Tracking domain</h2>
          <p className="mt-1 max-w-2xl text-muted">{state.summary}</p>
        </div>
        <span
          className={`badge border text-xs ${
            verified
              ? "alert-success text-success"
              : domain.status === "FAILED"
                ? "alert-danger text-danger"
                : domain.status === "PENDING"
                  ? "alert-warning text-warning"
                  : "border-border text-muted"
          }`}
        >
          {verified
            ? "Verified"
            : domain.status === "PENDING"
              ? "Waiting on DNS"
              : domain.status === "FAILED"
                ? "Not pointing at us"
                : "Shared domain"}
        </span>
      </div>

      {!verified ? (
        <p className="mt-3 max-w-2xl text-sm text-muted">
          Without your own domain, every tracked link in your email uses one hostname shared by every
          Cadence customer. If another sender gets that hostname flagged, your mail contains a
          flagged domain too. A single CNAME record moves your links onto your own reputation.
        </p>
      ) : null}

      {!isAdmin ? (
        <p className="mt-4 text-muted">Only an admin can change this.</p>
      ) : (
        <>
          <label className="mt-4 block text-sm">
            <span className="font-medium">Subdomain you control</span>
            <div className="mt-1.5 flex flex-wrap gap-2">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="track.yourcompany.com"
                autoComplete="off"
                spellCheck={false}
                className="min-w-0 flex-1"
              />
              <button
                onClick={() => void save()}
                disabled={busy || input.trim() === "" || input.trim() === domain.host}
                className="btn-primary min-h-11 px-4 py-2.5 text-sm disabled:opacity-50"
              >
                {busy ? "Checking…" : domain.host ? "Change" : "Add"}
              </button>
            </div>
            <span className="mt-1.5 block text-xs text-muted">
              Use a subdomain, not your main domain. Your website is unaffected.
            </span>
          </label>

          <div className="mt-4 rounded-lg border border-border bg-surface-2 p-3">
            <p className="text-sm font-medium text-foreground">
              Add this record at your DNS provider
            </p>
            <dl className="mt-2 grid gap-2 text-xs sm:grid-cols-4">
              {[
                ["Type", shown.type],
                ["Name", shown.name],
                ["Value", shown.value],
                ["TTL", shown.ttl],
              ].map(([label, value]) => (
                <div key={label} className="min-w-0">
                  <dt className="text-muted">{label}</dt>
                  <dd className="mt-0.5 truncate font-mono text-foreground" title={value}>
                    {value || "not available"}
                  </dd>
                </div>
              ))}
            </dl>
            {!dns ? (
              <p className="mt-2 text-sm text-muted">
                This is an example. Add your subdomain above and the exact record appears here.
              </p>
            ) : null}
          </div>

          {domain.host ? (
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                onClick={() => void recheck()}
                disabled={busy}
                className="btn-secondary flex min-h-11 items-center gap-1.5 px-4 py-2.5 text-sm disabled:opacity-50"
              >
                <Icon name="repeat" size={15} aria-hidden />
                Check DNS again
              </button>
              <button
                onClick={() => void remove()}
                disabled={busy}
                className="btn-ghost min-h-11 px-4 py-2.5 text-sm text-danger disabled:opacity-50"
              >
                Use the shared domain
              </button>
            </div>
          ) : null}

          {verified ? (
            <p className="mt-4 text-sm text-muted">
              Your unsubscribe links deliberately stay on Cadence&apos;s domain. They are legally
              required to keep working, and removing your CNAME later would break every one already
              delivered.
            </p>
          ) : null}
        </>
      )}
    </div>
  );
}
