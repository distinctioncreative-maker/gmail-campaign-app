"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { fetchJson } from "@/lib/fetchJson";
import { useToast } from "@/components/ui/UIProviders";
import { Icon, type IconName } from "@/components/ui/Icon";
import { formatDealValue, parseDealValue } from "@/lib/campaigns/outcomes";
import type { DealStatus } from "@/schemas/campaign";

/**
 * Record what a reply turned into.
 *
 * This is the only place the product learns whether outreach earned anything,
 * so the bar to using it has to be very low: three buttons, one click, no
 * dialog. The value field appears only on a win, and stays optional, because
 * a rep who does not know the number must still be able to record the win.
 *
 * Colour follows the accent rule in docs/brand.md. Green is reserved for the
 * win, blue marks a meeting as in progress, and a loss is neutral rather than
 * red: losing a deal is a normal outcome, not an error state.
 */
const OPTIONS: Array<{
  value: DealStatus;
  label: string;
  short: string;
  icon: IconName;
  active: string;
}> = [
  {
    value: "MEETING_BOOKED",
    label: "Meeting booked",
    short: "Meeting",
    icon: "clock",
    active: "border-primary bg-primary-soft text-primary",
  },
  {
    value: "WON",
    label: "Won",
    short: "Won",
    icon: "check",
    active: "border-success bg-success-soft text-success",
  },
  {
    value: "LOST",
    label: "Lost",
    short: "Lost",
    icon: "x",
    active: "border-border bg-surface-2 text-muted",
  },
];

export function OutcomeControl({
  campaignId,
  recipientId,
  status,
  valueCents,
  currency = "USD",
}: {
  campaignId: string;
  recipientId: string;
  status: DealStatus | null;
  valueCents: number | null;
  currency?: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [current, setCurrent] = useState<DealStatus | null>(status);
  const [value, setValue] = useState<number | null>(valueCents);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  async function save(next: DealStatus | null, nextValue: number | null) {
    // Optimistic: the rep is triaging a list and should never wait on a
    // round trip to see their own click land.
    const prevStatus = current;
    const prevValue = value;
    setCurrent(next);
    setValue(next === "WON" ? nextValue : null);
    setBusy(true);
    try {
      await fetchJson(
        `/api/campaigns/${campaignId}/recipients/${recipientId}/outcome`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            dealStatus: next,
            dealValueCents: next === "WON" ? nextValue : null,
            dealNote: "",
          }),
        }
      );
      // Refresh so the KPI tiles above the list and the reports page pick up
      // the new totals without a manual reload.
      router.refresh();
    } catch (err) {
      setCurrent(prevStatus);
      setValue(prevValue);
      toast(err instanceof Error ? err.message : "Couldn't save that outcome.", "error");
    } finally {
      setBusy(false);
    }
  }

  function choose(option: DealStatus) {
    // Clicking the active option clears it, which is the undo for a mis-click.
    if (option === current) {
      setEditing(false);
      void save(null, null);
      return;
    }
    if (option === "WON") {
      setDraft(value !== null ? String(value / 100) : "");
      setEditing(true);
    }
    void save(option, option === "WON" ? value : null);
  }

  function commitValue() {
    setEditing(false);
    const parsed = parseDealValue(draft);
    if (parsed !== value) void save("WON", parsed);
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <div className="flex items-center gap-1" role="group" aria-label="Outcome">
        {OPTIONS.map((option) => {
          const active = current === option.value;
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => choose(option.value)}
              disabled={busy}
              aria-pressed={active}
              title={active ? `${option.label}. Click to clear.` : option.label}
              // 44px on a phone, compact on a desktop row. Triaging replies is
              // the most likely thing a rep does from a phone, and a 32px
              // target next to two others is how the wrong outcome gets
              // recorded against a deal.
              className={`inline-flex min-h-11 items-center gap-1 rounded-md border px-2.5 py-1 text-xs font-medium transition disabled:opacity-50 sm:min-h-8 sm:px-2 ${
                active
                  ? option.active
                  : "border-border text-muted hover:bg-surface-2 hover:text-foreground"
              }`}
            >
              <Icon name={option.icon} size={12} aria-hidden />
              {option.short}
            </button>
          );
        })}
      </div>

      {current === "WON" &&
        (editing ? (
          <span className="inline-flex items-center gap-1">
            <label className="sr-only" htmlFor={`deal-value-${recipientId}`}>
              Deal value
            </label>
            <input
              ref={inputRef}
              id={`deal-value-${recipientId}`}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={commitValue}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitValue();
                if (e.key === "Escape") setEditing(false);
              }}
              inputMode="decimal"
              placeholder="Value"
              className="h-11 w-24 px-2 py-0 text-xs sm:h-8"
            />
          </span>
        ) : (
          <button
            type="button"
            onClick={() => {
              setDraft(value !== null ? String(value / 100) : "");
              setEditing(true);
            }}
            className="inline-flex min-h-11 items-center rounded-md px-2 py-1 text-xs font-medium text-success transition hover:bg-surface-2 sm:min-h-8 sm:px-1.5"
          >
            {/* An unrecorded value is not zero, and must not read as zero. */}
            {value !== null ? formatDealValue(value, currency) : "Add value"}
          </button>
        ))}
    </div>
  );
}
