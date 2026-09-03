"use client";

import { useId } from "react";

/**
 * What this file's opt-out column means.
 *
 * The question exists because two different facts share one word. A person who
 * clicked unsubscribe on your email asked YOU to stop, and that is a promise
 * this product keeps absolutely. A column reading "Opt Out" in a CRM export is
 * a third party's claim about a different system: usually a newsletter, often a
 * product the exporting company sold, sometimes a box a rep ticked in 2019 for
 * a reason nobody wrote down. Treating the second as though it were the first
 * silently deletes leads the customer has every right to contact.
 *
 * Three things follow from that:
 *
 * **It only appears when the file has the column and marks somebody.** A
 * control offering a choice about nothing is clutter, and clutter is how the
 * important controls stop being read.
 *
 * **Respecting it is the default, and the default is never pre-overridden.**
 * The safe answer requires no action. Choosing the other one is a deliberate
 * act, which is the property that makes the record worth anything.
 *
 * **The reason is required, and it is not a formality.** It is the sentence
 * that answers "why did you email these people" months later, written by the
 * person who knew, on the day they knew it. That is the whole reason to ask.
 *
 * What this cannot do is stated on screen rather than buried here: it never
 * reaches an unsubscribe, a bounce, or a complaint. Those are different records
 * with different reason codes and nothing in this flow can write to them.
 */
export function OptOutColumnChoice({
  markedCount,
  ignoring,
  reason,
  onChange,
  onReasonChange,
  disabled = false,
}: {
  /** How many rows in this file the column marks. */
  markedCount: number;
  ignoring: boolean;
  reason: string;
  onChange: (ignoring: boolean) => void;
  onReasonChange: (reason: string) => void;
  disabled?: boolean;
}) {
  const groupId = useId();

  return (
    <section
      aria-labelledby={`${groupId}-title`}
      className="mb-4 rounded-lg border border-border bg-surface-2 p-4"
    >
      <h3 id={`${groupId}-title`} className="font-medium text-foreground">
        This file marks {markedCount} {markedCount === 1 ? "person" : "people"} as opted out
      </h3>
      <p className="mt-1.5 text-sm text-muted">
        What that column means depends on where the file came from. Cadence will not guess.
      </p>

      <div className="mt-4 flex flex-col gap-2">
        <label
          className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition ${
            ignoring ? "border-border bg-surface" : "border-foreground bg-surface"
          }`}
        >
          <input
            type="radio"
            name={`${groupId}-choice`}
            checked={!ignoring}
            disabled={disabled}
            onChange={() => onChange(false)}
            className="mt-1"
          />
          <span className="min-w-0">
            <span className="block font-medium text-foreground">
              Respect it, do not email them
            </span>
            <span className="mt-0.5 block text-sm text-muted">
              They are imported and added to your do-not-email list, so no campaign can reach
              them.
            </span>
          </span>
        </label>

        <label
          className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition ${
            ignoring ? "border-foreground bg-surface" : "border-border bg-surface"
          }`}
        >
          <input
            type="radio"
            name={`${groupId}-choice`}
            checked={ignoring}
            disabled={disabled}
            onChange={() => onChange(true)}
            className="mt-1"
          />
          <span className="min-w-0">
            <span className="block font-medium text-foreground">
              That column means something else here
            </span>
            <span className="mt-0.5 block text-sm text-muted">
              They are imported normally. Anyone who unsubscribed from your email, bounced, or
              complained stays blocked either way. This choice cannot reach them.
            </span>
          </span>
        </label>
      </div>

      {ignoring && (
        <div className="mt-3">
          <label
            htmlFor={`${groupId}-reason`}
            className="block font-medium text-foreground"
          >
            What does it mean?
          </label>
          <input
            id={`${groupId}-reason`}
            value={reason}
            disabled={disabled}
            onChange={(e) => onReasonChange(e.target.value)}
            placeholder="Newsletter opt-out from our old ESP, not a request to us"
            maxLength={300}
            className="mt-1.5 w-full"
          />
          <p className="mt-1.5 text-sm text-muted">
            Recorded in your activity log with this import. This is the answer to “why did you
            email these people”, and the day to write it is today.
          </p>
        </div>
      )}
    </section>
  );
}
