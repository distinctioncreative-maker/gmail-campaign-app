"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchJson } from "@/lib/fetchJson";
import { useToast, useConfirm } from "@/components/ui/UIProviders";
import { Icon } from "@/components/ui/Icon";

/**
 * The inbox pool.
 *
 * One warmed Gmail account tops out near 150 real sends a day, which was the
 * hard ceiling on what any customer could achieve. This is where they lift it.
 *
 * The card leads with total capacity rather than a list of addresses, because
 * the number a customer is actually trying to change is "how much can I send",
 * and every row below explains its own contribution to it. Each row uses the
 * exact assessment the send path uses, so the page cannot call an inbox ready
 * while the worker skips it.
 */

interface InboxRow {
  connectionId: string;
  connectedEmail: string;
  label: string;
  status: "CONNECTED" | "NEEDS_RECONNECT" | "REVOKED";
  paused: boolean;
  primary: boolean;
  lifetimeSends: number;
  sentToday: number;
  sentCount: number;
  bounceCount: number;
  dailyLimit: number | null;
  usable: boolean;
  skipReason: string | null;
  dailyCap: number | null;
  remaining: number | null;
  detail: string;
}

interface PoolResponse {
  inboxes: InboxRow[];
  capacity: { usableInboxes: number; remainingToday: number; dailyCeiling: number };
}

export function InboxPoolCard() {
  const toast = useToast();
  const confirm = useConfirm();
  const [data, setData] = useState<PoolResponse | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await fetchJson<PoolResponse>("/api/gmail/inboxes"));
    } catch {
      setData({ inboxes: [], capacity: { usableInboxes: 0, remainingToday: 0, dailyCeiling: 0 } });
    }
  }, []);

  useEffect(() => {
    // Fetching, not deriving. The pool includes today's per-inbox counters and
    // the same live assessment the send path runs, so it cannot be computed
    // from props.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  async function patch(connectionId: string, body: Record<string, unknown>) {
    setBusy(connectionId);
    try {
      await fetchJson("/api/gmail/inboxes", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ connectionId, ...body }),
      });
      await load();
    } catch (err) {
      toast(err instanceof Error ? err.message : "That did not save.", "error");
    } finally {
      setBusy(null);
    }
  }

  async function remove(row: InboxRow) {
    const ok = await confirm({
      title: `Remove ${row.label || row.connectedEmail}?`,
      body: "Its sending history and warmup progress are removed with it. Campaigns that named it as a sender will fall back to their other inboxes.",
      confirmLabel: "Remove inbox",
      danger: true,
    });
    if (!ok) return;
    setBusy(row.connectionId);
    try {
      await fetchJson("/api/gmail/inboxes", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ connectionId: row.connectionId }),
      });
      toast("Inbox removed.", "success");
      await load();
    } catch (err) {
      toast(err instanceof Error ? err.message : "That did not work.", "error");
    } finally {
      setBusy(null);
    }
  }

  async function disconnect(row: InboxRow) {
    const ok = await confirm({
      title: `Disconnect ${row.label || row.connectedEmail}?`,
      body: "Cadence's access to this mailbox is revoked with Google. Sending history and warmup progress are kept, so reconnecting later resumes rather than restarts.",
      confirmLabel: "Disconnect",
      danger: true,
    });
    if (!ok) return;
    setBusy(row.connectionId);
    try {
      await fetchJson("/api/gmail/disconnect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ connectionId: row.connectionId }),
      });
      toast("Disconnected.", "success");
      await load();
    } catch (err) {
      toast(err instanceof Error ? err.message : "That did not work.", "error");
    } finally {
      setBusy(null);
    }
  }

  if (!data) {
    return (
      <div className="card p-6">
        <h2 className="font-medium">Sending inboxes</h2>
        <p className="mt-2 text-sm text-muted">Loading…</p>
      </div>
    );
  }

  const { inboxes, capacity } = data;

  return (
    <div className="card p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-medium">Sending inboxes</h2>
          <p className="mt-1 text-sm text-muted">
            {inboxes.length === 0
              ? "Connect a Gmail account to start sending."
              : capacity.usableInboxes === 0
                ? "No inbox can send right now. Each one below says why."
                : `${capacity.usableInboxes} ${capacity.usableInboxes === 1 ? "inbox" : "inboxes"} ready, ${capacity.remainingToday.toLocaleString()} sends left today.`}
          </p>
        </div>
        <a href="/api/gmail/connect" className="btn-secondary min-h-11 px-4 py-2.5 text-sm">
          {inboxes.length === 0 ? "Connect Gmail" : "Connect another inbox"}
        </a>
      </div>

      {inboxes.length > 1 ? (
        <p className="mt-3 text-xs text-muted">
          Sends rotate across your ready inboxes, always picking the one that has sent least today.
          Adding an inbox does not change how much a campaign sends: it lets you raise a campaign&apos;s
          daily limit without any single address sending more than is safe.
        </p>
      ) : null}

      <ul className="mt-4 divide-y divide-border border-y border-border">
        {inboxes.map((row) => (
          <li key={row.connectionId} className="py-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                  <span className="truncate">{row.label || row.connectedEmail}</span>
                  {row.primary ? (
                    <span className="badge border border-border text-xs text-muted">Default</span>
                  ) : null}
                  {row.usable ? (
                    <span className="badge alert-success border text-xs text-success">Ready</span>
                  ) : (
                    <span className="badge alert-warning border text-xs text-warning">
                      {row.status === "CONNECTED" ? "Not sending" : "Needs attention"}
                    </span>
                  )}
                </p>
                {row.label ? (
                  <p className="mt-0.5 truncate text-xs text-muted">{row.connectedEmail}</p>
                ) : null}
                <p className="mt-1 text-xs text-muted">{row.detail}</p>
                <p className="mt-0.5 text-xs text-muted">
                  {row.lifetimeSends.toLocaleString()} sent all time
                  {row.sentCount > 0
                    ? `, ${((row.bounceCount / row.sentCount) * 100).toFixed(1)}% bounced`
                    : ""}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {row.status !== "CONNECTED" ? (
                  <a href="/api/gmail/connect" className="btn-secondary min-h-11 px-3 py-2 text-xs">
                    Reconnect
                  </a>
                ) : (
                  <>
                    {!row.primary ? (
                      <button
                        onClick={() => void patch(row.connectionId, { makePrimary: true })}
                        disabled={busy === row.connectionId}
                        className="btn-ghost min-h-11 px-3 py-2 text-xs disabled:opacity-50"
                      >
                        Make default
                      </button>
                    ) : null}
                    <button
                      onClick={() => void patch(row.connectionId, { paused: !row.paused })}
                      disabled={busy === row.connectionId}
                      className="btn-ghost min-h-11 px-3 py-2 text-xs disabled:opacity-50"
                    >
                      {row.paused ? "Resume" : "Pause"}
                    </button>
                    <button
                      onClick={() => void disconnect(row)}
                      disabled={busy === row.connectionId}
                      className="btn-ghost min-h-11 px-3 py-2 text-xs text-danger disabled:opacity-50"
                    >
                      Disconnect
                    </button>
                  </>
                )}
                {inboxes.length > 1 ? (
                  <button
                    onClick={() => void remove(row)}
                    disabled={busy === row.connectionId}
                    className="btn-ghost min-h-11 px-2 py-2 text-xs text-muted disabled:opacity-50"
                    aria-label={`Remove ${row.connectedEmail}`}
                  >
                    <Icon name="trash" size={15} aria-hidden />
                  </button>
                ) : null}
              </div>
            </div>

            <div className="mt-3 flex flex-wrap items-end gap-3">
              <label className="text-xs">
                <span className="block text-muted">Name</span>
                <input
                  defaultValue={row.label}
                  onBlur={(e) => {
                    if (e.target.value !== row.label) {
                      void patch(row.connectionId, { label: e.target.value });
                    }
                  }}
                  placeholder={row.connectedEmail}
                  className="mt-1 w-48 rounded-lg border border-border bg-surface px-2 py-1.5 text-xs focus:border-primary focus:outline-none"
                />
              </label>
              <label className="text-xs">
                <span className="block text-muted">Daily limit for this inbox</span>
                <input
                  type="number"
                  min={1}
                  max={2000}
                  defaultValue={row.dailyLimit ?? ""}
                  onBlur={(e) => {
                    const raw = e.target.value.trim();
                    const next = raw === "" ? null : Number(raw);
                    if (next !== row.dailyLimit && (next === null || Number.isFinite(next))) {
                      void patch(row.connectionId, { dailyLimit: next });
                    }
                  }}
                  placeholder="No extra limit"
                  className="mt-1 w-40 rounded-lg border border-border bg-surface px-2 py-1.5 text-xs focus:border-primary focus:outline-none"
                />
              </label>
            </div>
          </li>
        ))}
      </ul>

      {inboxes.length > 0 ? (
        <p className="mt-4 text-xs text-muted">
          A per-inbox limit only ever lowers the ceiling. Warmup and your plan still apply, and a new
          inbox ramps up over its first four weeks however high you set this.
        </p>
      ) : null}
    </div>
  );
}
