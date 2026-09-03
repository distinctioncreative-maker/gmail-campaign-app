"use client";

import { useEffect, useState } from "react";
import { fetchJson } from "@/lib/fetchJson";

/**
 * Which inboxes a campaign sends from.
 *
 * Hidden entirely when there is only one connected inbox. A choice with one
 * option is not a choice, and putting it in the wizard would add a step to
 * every single-inbox account's setup in exchange for nothing.
 *
 * "All ready inboxes" is the default and is stored as an empty list rather than
 * as every current id. That distinction matters: a customer who connects a
 * fourth inbox next month expects their running campaigns to use it, and a
 * snapshot of ids taken at creation would silently exclude it forever.
 */

interface InboxOption {
  connectionId: string;
  connectedEmail: string;
  label: string;
  usable: boolean;
  detail: string;
  dailyCap: number | null;
}

export function SenderPicker({
  value,
  onChange,
}: {
  value: string[];
  onChange: (next: string[]) => void;
}) {
  const [inboxes, setInboxes] = useState<InboxOption[] | null>(null);
  const [capacity, setCapacity] = useState<{ dailyCeiling: number; usableInboxes: number } | null>(
    null
  );

  useEffect(() => {
    fetchJson<{ inboxes: InboxOption[]; capacity: { dailyCeiling: number; usableInboxes: number } }>(
      "/api/gmail/inboxes"
    )
      .then((res) => {
        setInboxes(res.inboxes);
        setCapacity(res.capacity);
      })
      .catch(() => setInboxes([]));
  }, []);

  // One inbox, or none: nothing worth asking about.
  if (!inboxes || inboxes.length <= 1) return null;

  const usingAll = value.length === 0;

  function toggle(connectionId: string) {
    // Turning the last one off means "all" rather than "none": a campaign with
    // no sender cannot send, and nobody clicking a checkbox means that.
    const next = value.includes(connectionId)
      ? value.filter((id) => id !== connectionId)
      : [...value, connectionId];
    onChange(next);
  }

  return (
    <div className="mt-3 rounded-lg border border-border p-3">
      <p className="text-sm font-medium text-foreground">Send from</p>
      <p className="mt-0.5 text-sm text-muted">
        {capacity
          ? `${capacity.usableInboxes} ready ${capacity.usableInboxes === 1 ? "inbox" : "inboxes"}, up to ${capacity.dailyCeiling.toLocaleString()} sends a day between them.`
          : "Sends rotate across the inboxes you pick, using the one that has sent least today."}
      </p>

      <label className="mt-3 flex items-start gap-2 text-sm">
        <input
          type="radio"
          name="sender-scope"
          checked={usingAll}
          onChange={() => onChange([])}
          className="mt-1"
        />
        <span>
          All ready inboxes
          <span className="mt-0.5 block text-xs text-muted">
            Recommended. Includes any inbox you connect later.
          </span>
        </span>
      </label>

      <label className="mt-2 flex items-start gap-2 text-sm">
        <input
          type="radio"
          name="sender-scope"
          checked={!usingAll}
          onChange={() => onChange([inboxes.find((i) => i.usable)?.connectionId ?? inboxes[0].connectionId])}
          className="mt-1"
        />
        <span>
          Only these
          <span className="mt-0.5 block text-xs text-muted">
            If a chosen inbox cannot send, this campaign waits rather than using a different address.
          </span>
        </span>
      </label>

      {!usingAll ? (
        <div className="mt-3 space-y-2 border-t border-border pt-3">
          {inboxes.map((inbox) => (
            <label key={inbox.connectionId} className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                checked={value.includes(inbox.connectionId)}
                onChange={() => toggle(inbox.connectionId)}
                className="mt-1"
              />
              <span className="min-w-0">
                <span className="block truncate">{inbox.label || inbox.connectedEmail}</span>
                <span className="mt-0.5 block text-xs text-muted">{inbox.detail}</span>
              </span>
            </label>
          ))}
          {value.length === 0 ? (
            <p className="text-sm text-warning">
              Pick at least one inbox, or choose all ready inboxes above.
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
