"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchJson } from "@/lib/fetchJson";
import { useToast, useConfirm } from "@/components/ui/UIProviders";
import { Icon } from "@/components/ui/Icon";
import { WEBHOOK_EVENTS } from "@/schemas/integration";

/**
 * Webhook subscriptions.
 *
 * Two things this card has to make plain, because getting either wrong is
 * expensive and neither is obvious from the form:
 *
 * **The signing secret matters.** A receiver that ignores it will happily accept
 * a forged reply from anyone who learns the URL, and the URL is not a secret. So
 * the secret is presented as the thing to install, not as a detail.
 *
 * **A delivery can fail quietly.** An endpoint that stopped answering is
 * invisible unless the interface says so, so each subscription shows what came
 * back last, and recent deliveries are listed underneath with the attempt trail.
 */

interface EndpointRow {
  endpointId: string;
  url: string;
  description: string;
  events: string[];
  enabled: boolean;
  disabledReason: string;
  lastDeliveryAt: number | null;
  lastStatus: number | null;
  consecutiveFailures: number;
  createdAt: number;
}

interface DeliveryRow {
  deliveryId: string;
  endpointId: string;
  event: string;
  status: "PENDING" | "DELIVERED" | "RETRYING" | "FAILED";
  lastStatus: number | null;
  attempt: number;
  history: string[];
  createdAt: number;
}

const EVENT_LABELS: Record<string, string> = {
  "reply.received": "Someone replies",
  "email.bounced": "An email bounces",
  "contact.unsubscribed": "Someone unsubscribes",
  "deal.updated": "A deal outcome changes",
};

const STATUS_TONE: Record<DeliveryRow["status"], string> = {
  DELIVERED: "text-success",
  RETRYING: "text-warning",
  FAILED: "text-danger",
  PENDING: "text-muted",
};

const STATUS_LABEL: Record<DeliveryRow["status"], string> = {
  DELIVERED: "Delivered",
  RETRYING: "Retrying",
  FAILED: "Failed",
  PENDING: "Queued",
};

export function WebhooksCard() {
  const toast = useToast();
  const confirm = useConfirm();
  const [endpoints, setEndpoints] = useState<EndpointRow[] | null>(null);
  const [deliveries, setDeliveries] = useState<DeliveryRow[]>([]);
  const [url, setUrl] = useState("");
  const [description, setDescription] = useState("");
  const [events, setEvents] = useState<string[]>(["reply.received"]);
  const [secret, setSecret] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showDeliveries, setShowDeliveries] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetchJson<{ endpoints: EndpointRow[]; deliveries: DeliveryRow[] }>(
        "/api/webhooks"
      );
      setEndpoints(res.endpoints);
      setDeliveries(res.deliveries);
    } catch {
      setEndpoints([]);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  async function create() {
    setBusy(true);
    try {
      const res = await fetchJson<{ signingSecret: string }>("/api/webhooks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim(), description: description.trim(), events }),
      });
      setSecret(res.signingSecret);
      setUrl("");
      setDescription("");
      await load();
    } catch (err) {
      toast(err instanceof Error ? err.message : "That did not work.", "error");
    } finally {
      setBusy(false);
    }
  }

  async function toggle(row: EndpointRow) {
    setBusy(true);
    try {
      await fetchJson("/api/webhooks", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpointId: row.endpointId, enabled: !row.enabled }),
      });
      await load();
    } catch (err) {
      toast(err instanceof Error ? err.message : "That did not work.", "error");
    } finally {
      setBusy(false);
    }
  }

  async function remove(row: EndpointRow) {
    const ok = await confirm({
      title: "Remove this subscription?",
      body: `Cadence stops posting events to ${row.url}. Anything queued for it will not be sent.`,
      confirmLabel: "Remove",
      danger: true,
    });
    if (!ok) return;
    setBusy(true);
    try {
      await fetchJson("/api/webhooks", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpointId: row.endpointId }),
      });
      toast("Removed.", "success");
      await load();
    } catch (err) {
      toast(err instanceof Error ? err.message : "That did not work.", "error");
    } finally {
      setBusy(false);
    }
  }

  async function sendTest(row: EndpointRow) {
    setBusy(true);
    try {
      const res = await fetchJson<{ message: string }>("/api/webhooks/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpointId: row.endpointId }),
      });
      toast(res.message, "success");
      setShowDeliveries(true);
    } catch (err) {
      toast(err instanceof Error ? err.message : "That did not work.", "error");
    } finally {
      setBusy(false);
    }
  }

  function toggleEvent(event: string) {
    setEvents((prev) =>
      prev.includes(event) ? prev.filter((e) => e !== event) : [...prev, event]
    );
  }

  if (!endpoints) {
    return (
      <div className="card p-6">
        <h2 className="font-medium">Webhooks</h2>
        <p className="mt-2 text-sm text-muted">Loading…</p>
      </div>
    );
  }

  return (
    <div className="card p-6">
      <h2 className="font-medium">Webhooks</h2>
      <p className="mt-1 max-w-2xl text-sm text-muted">
        Have Cadence POST to your own service when something happens, so a reply or a bounce reaches
        your CRM without anyone copying it across.
      </p>

      {secret ? (
        <div className="alert-success mt-4 rounded-xl border p-4">
          <p className="text-sm font-medium text-foreground">Install this signing secret</p>
          <p className="mt-1 text-xs text-muted">
            Every delivery carries a{" "}
            <code className="rounded bg-surface-2 px-1 py-0.5">cadence-signature</code> header: an
            HMAC-SHA256 of{" "}
            <code className="rounded bg-surface-2 px-1 py-0.5">timestamp.body</code> using this
            secret, with the timestamp in{" "}
            <code className="rounded bg-surface-2 px-1 py-0.5">cadence-timestamp</code>. Reject
            anything that does not match, and anything older than five minutes. Your URL is not a
            secret, so a receiver that skips this check will accept forged events.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded-lg border border-border bg-surface px-3 py-2 font-mono text-xs">
              {secret}
            </code>
            <button
              onClick={() => {
                void navigator.clipboard?.writeText(secret);
                toast("Copied.", "success");
              }}
              className="btn-secondary min-h-11 px-4 py-2.5 text-sm"
            >
              Copy
            </button>
            <button
              onClick={() => setSecret(null)}
              className="btn-ghost min-h-11 px-4 py-2.5 text-sm"
            >
              Done
            </button>
          </div>
        </div>
      ) : null}

      {endpoints.length > 0 ? (
        <ul className="mt-4 divide-y divide-border border-y border-border">
          {endpoints.map((row) => (
            <li key={row.endpointId} className="py-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                    <span className="truncate font-mono text-xs">{row.url}</span>
                    {row.enabled ? null : (
                      <span className="badge border border-border text-xs text-warning">Off</span>
                    )}
                  </p>
                  {row.description ? (
                    <p className="mt-0.5 text-xs text-muted">{row.description}</p>
                  ) : null}
                  <p className="mt-1 text-xs text-muted">
                    {row.events.map((e) => EVENT_LABELS[e] ?? e).join(", ")}
                  </p>
                  <p className="mt-1 text-xs text-muted">
                    {row.lastDeliveryAt === null
                      ? "No deliveries yet"
                      : `Last delivery returned ${row.lastStatus === null ? "no response" : `HTTP ${row.lastStatus}`}`}
                    {row.consecutiveFailures > 0
                      ? `, ${row.consecutiveFailures} in a row have failed`
                      : ""}
                  </p>
                  {row.disabledReason ? (
                    <p className="mt-1 text-xs text-warning">{row.disabledReason}</p>
                  ) : null}
                </div>
                <div className="flex flex-wrap items-center gap-1">
                  <button
                    onClick={() => void sendTest(row)}
                    disabled={busy}
                    className="btn-ghost min-h-11 px-3 py-2 text-xs disabled:opacity-50"
                  >
                    Send test
                  </button>
                  <button
                    onClick={() => void toggle(row)}
                    disabled={busy}
                    className="btn-ghost min-h-11 px-3 py-2 text-xs disabled:opacity-50"
                  >
                    {row.enabled ? "Turn off" : "Turn on"}
                  </button>
                  <button
                    onClick={() => void remove(row)}
                    disabled={busy}
                    className="btn-ghost min-h-11 px-3 py-2 text-xs text-danger disabled:opacity-50"
                  >
                    Remove
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-4 text-sm text-muted">No endpoints yet.</p>
      )}

      <div className="mt-5 border-t border-border pt-4">
        <p className="text-sm font-medium">Add an endpoint</p>
        <div className="mt-3 space-y-2">
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://hooks.yourcompany.com/cadence"
            inputMode="url"
            className="w-full rounded-xl border border-border bg-surface px-3 py-2.5 text-sm focus:border-primary focus:outline-none"
          />
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What receives it? e.g. HubSpot sync"
            className="w-full rounded-xl border border-border bg-surface px-3 py-2.5 text-sm focus:border-primary focus:outline-none"
          />
        </div>

        <fieldset className="mt-3">
          <legend className="text-xs font-medium text-muted">Send it when:</legend>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {WEBHOOK_EVENTS.map((event) => (
              <label key={event} className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={events.includes(event)}
                  onChange={() => toggleEvent(event)}
                  className="mt-1"
                />
                <span>
                  {EVENT_LABELS[event] ?? event}
                  <span className="mt-0.5 block font-mono text-xs text-muted">{event}</span>
                </span>
              </label>
            ))}
          </div>
          <p className="mt-2 text-xs text-muted">
            https only, and a public hostname. Deliveries are retried for about two hours, then given
            up on.
          </p>
        </fieldset>

        <button
          onClick={() => void create()}
          disabled={busy || url.trim() === "" || events.length === 0}
          className="btn-primary mt-4 flex min-h-11 items-center gap-1.5 px-4 py-2.5 text-sm disabled:opacity-50"
        >
          <Icon name="sparkles" size={15} aria-hidden />
          {busy ? "Saving…" : "Add endpoint"}
        </button>
      </div>

      {deliveries.length > 0 ? (
        <div className="mt-5 border-t border-border pt-4">
          <button
            onClick={() => setShowDeliveries((prev) => !prev)}
            aria-expanded={showDeliveries}
            className="btn-ghost min-h-11 px-2 py-2 text-sm"
          >
            {showDeliveries ? "Hide" : "Show"} recent deliveries ({deliveries.length})
          </button>
          {showDeliveries ? (
            <ul className="mt-2 space-y-2">
              {deliveries.map((row) => (
                <li key={row.deliveryId} className="rounded-lg border border-border p-3">
                  <p className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="font-mono">{row.event}</span>
                    <span className={STATUS_TONE[row.status]}>{STATUS_LABEL[row.status]}</span>
                    <span className="text-muted">
                      attempt {row.attempt}
                      {row.lastStatus === null ? "" : `, HTTP ${row.lastStatus}`}
                    </span>
                  </p>
                  {row.history.length > 0 ? (
                    <ul className="mt-1 space-y-0.5">
                      {row.history.map((line, i) => (
                        <li key={i} className="text-xs text-muted">
                          {line}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
