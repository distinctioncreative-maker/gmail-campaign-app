"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchJson } from "@/lib/fetchJson";
import { useToast, useConfirm } from "@/components/ui/UIProviders";
import { Icon } from "@/components/ui/Icon";
import { API_SCOPES } from "@/lib/apiKeys/token";

/**
 * API keys.
 *
 * The whole card is shaped around one constraint: a key is stored only as a
 * hash, so it can be shown exactly once and never again. That is a security
 * property, not a limitation, and the interface has to make it obvious rather
 * than let someone close the panel and lose a credential they thought they
 * could come back for. Hence a full-width reveal that stays until dismissed,
 * with a copy button and an explicit acknowledgement.
 */

interface KeyRow {
  keyId: string;
  name: string;
  display: string;
  environment: "live" | "test";
  scopes: string[];
  scopeSummary: string;
  lastUsedAt: number | null;
  revokedAt: number | null;
  createdAt: number;
}

const SCOPE_LABELS: Record<string, string> = {
  "leads:read": "Read leads",
  "leads:write": "Create and update leads",
  "campaigns:read": "Read campaigns",
  "campaigns:write": "Create and update campaigns",
  "reports:read": "Read reports",
};

export function ApiKeysCard() {
  const toast = useToast();
  const confirm = useConfirm();
  const [keys, setKeys] = useState<KeyRow[] | null>(null);
  const [name, setName] = useState("");
  const [scopes, setScopes] = useState<string[]>(["leads:read"]);
  const [environment, setEnvironment] = useState<"live" | "test">("live");
  const [revealed, setRevealed] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetchJson<{ keys: KeyRow[] }>("/api/api-keys");
      setKeys(res.keys);
    } catch {
      setKeys([]);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  async function create() {
    setBusy(true);
    try {
      const res = await fetchJson<{ secret: string; message: string }>("/api/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), scopes, environment }),
      });
      setRevealed(res.secret);
      setName("");
      await load();
    } catch (err) {
      toast(err instanceof Error ? err.message : "That did not work.", "error");
    } finally {
      setBusy(false);
    }
  }

  async function revoke(row: KeyRow) {
    const ok = await confirm({
      title: `Revoke ${row.name}?`,
      body: "Any integration using this key stops working immediately. This cannot be undone, and the key cannot be restored because it was never stored.",
      confirmLabel: "Revoke key",
      danger: true,
    });
    if (!ok) return;
    setBusy(true);
    try {
      await fetchJson("/api/api-keys", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keyId: row.keyId }),
      });
      toast("Revoked.", "success");
      await load();
    } catch (err) {
      toast(err instanceof Error ? err.message : "That did not work.", "error");
    } finally {
      setBusy(false);
    }
  }

  function toggleScope(scope: string) {
    setScopes((prev) => (prev.includes(scope) ? prev.filter((s) => s !== scope) : [...prev, scope]));
  }

  if (!keys) {
    return (
      <div className="card p-6 sm:p-7">
        <h2 className="font-medium">API keys</h2>
        <p className="mt-2 text-sm text-muted">Loading…</p>
      </div>
    );
  }

  const active = keys.filter((k) => k.revokedAt === null);

  return (
    <div className="card p-6 sm:p-7">
      <h2 className="font-medium">API keys</h2>
      <p className="mt-1 max-w-2xl text-sm text-muted">
        For your own code and integrations. Send a key as{" "}
        <code className="rounded-sm bg-surface-2 px-1 py-0.5 text-xs">Authorization: Bearer</code> to{" "}
        <code className="rounded-sm bg-surface-2 px-1 py-0.5 text-xs">/api/v1/leads</code>.
      </p>

      {revealed ? (
        <div className="alert-success mt-4 rounded-lg border p-4">
          <p className="text-sm font-medium text-foreground">Copy your key now</p>
          <p className="mt-1 text-xs text-muted">
            Cadence stores only a hash of it, so this is the only time it can be shown. If you lose
            it, revoke it and create another.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded-lg border border-border bg-surface px-3 py-2 font-mono text-xs">
              {revealed}
            </code>
            <button
              onClick={() => {
                void navigator.clipboard?.writeText(revealed);
                toast("Copied.", "success");
              }}
              className="btn-secondary min-h-11 px-4 py-2.5 text-sm"
            >
              Copy
            </button>
            <button
              onClick={() => setRevealed(null)}
              className="btn-ghost min-h-11 px-4 py-2.5 text-sm"
            >
              I have saved it
            </button>
          </div>
        </div>
      ) : null}

      {active.length > 0 ? (
        <ul className="mt-4 divide-y divide-border border-y border-border">
          {active.map((row) => (
            <li key={row.keyId} className="flex flex-wrap items-start justify-between gap-3 py-3">
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                  <span className="truncate">{row.name}</span>
                  {row.environment === "test" ? (
                    <span className="badge border border-border text-xs text-muted">Test</span>
                  ) : null}
                </p>
                <p className="mt-0.5 font-mono text-xs text-muted">{row.display}</p>
                <p className="mt-1 text-xs text-muted">
                  {row.scopeSummary}
                  {row.lastUsedAt === null ? ", never used" : ""}
                </p>
              </div>
              <button
                onClick={() => void revoke(row)}
                disabled={busy}
                className="btn-ghost min-h-11 px-3 py-2 text-xs text-danger disabled:opacity-50"
              >
                Revoke
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-4 text-sm text-muted">No keys yet.</p>
      )}

      <div className="mt-5 border-t border-border pt-4">
        <p className="text-sm font-medium">Create a key</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="What is it for? e.g. Zapier"
            className="min-w-0 flex-1"
          />
          <select
            value={environment}
            onChange={(e) => setEnvironment(e.target.value as "live" | "test")}
            className=""
          >
            <option value="live">Live</option>
            <option value="test">Test</option>
          </select>
        </div>

        <fieldset className="mt-3">
          <legend className="text-xs font-medium text-muted">
            What may it do? Grant only what the integration needs.
          </legend>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {API_SCOPES.map((scope) => (
              <label key={scope} className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={scopes.includes(scope)}
                  onChange={() => toggleScope(scope)}
                  className="mt-1"
                />
                <span>
                  {SCOPE_LABELS[scope] ?? scope}
                  <span className="mt-0.5 block font-mono text-xs text-muted">{scope}</span>
                </span>
              </label>
            ))}
          </div>
          {/* Read is not implied by write on purpose: see lib/apiKeys/token.ts. */}
          <p className="mt-2 text-xs text-muted">
            Write access does not include read access. Tick both if the integration needs both.
          </p>
        </fieldset>

        <button
          onClick={() => void create()}
          disabled={busy || name.trim() === "" || scopes.length === 0}
          className="btn-primary mt-4 flex min-h-11 items-center gap-1.5 px-4 py-2.5 text-sm disabled:opacity-50"
        >
          <Icon name="sparkles" size={15} aria-hidden />
          {busy ? "Creating…" : "Create key"}
        </button>
      </div>
    </div>
  );
}
