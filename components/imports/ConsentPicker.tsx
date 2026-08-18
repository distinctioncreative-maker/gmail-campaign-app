"use client";

import { useId, useState } from "react";
import {
  CONSENT_BASIS_COPY,
  DEFAULT_CONSENT_BASIS,
  SELECTABLE_CONSENT_BASES,
  type ConsentBasis,
} from "@/lib/compliance/consent";

/**
 * The one question this product asks about where a list came from.
 *
 * The design constraint was that it must not feel like a compliance form,
 * because a compliance form gets the first option picked without reading and
 * then the record it produces is worthless. Four things follow from that:
 *
 * **It sits inside the import flow**, immediately above the button that starts
 * the import, rather than in Settings. It is asked once per list, at the moment
 * the answer is actually known, by the person who knows it. Nobody has to go
 * find it.
 *
 * **The common case is preselected.** Business research is what this tool is
 * for, and it is a lawful basis for B2B outreach, not a lesser one. Someone
 * doing the ordinary thing reads one line and continues.
 *
 * **The options describe situations, not law.** "Business research" and the
 * concrete examples underneath it are answerable by a salesperson. "Article
 * 6(1)(f) legitimate interests" is not, and a dropdown nobody understands is
 * answered arbitrarily, which is the failure mode this exists to avoid.
 *
 * **The note is optional and stays collapsed.** Someone recording a specific
 * signup form can say so; nobody is stopped to type prose.
 */
export function ConsentPicker({
  value,
  note,
  onChange,
  onNoteChange,
}: {
  value: ConsentBasis;
  note: string;
  onChange: (basis: ConsentBasis) => void;
  onNoteChange: (note: string) => void;
}) {
  const groupId = useId();
  const [showNote, setShowNote] = useState(false);

  return (
    <fieldset className="mt-5 rounded-xl border border-border p-4">
      <legend className="px-1 text-sm font-medium text-foreground">
        Where did these leads come from?
      </legend>
      <p className="text-xs text-muted">
        Recorded with the import so you can answer it later if a recipient or a provider ever
        asks. It takes one click and you can change it per list.
      </p>

      <div className="mt-3 grid gap-2">
        {SELECTABLE_CONSENT_BASES.map((basis) => {
          const copy = CONSENT_BASIS_COPY[basis];
          const checked = value === basis;
          return (
            <label
              key={basis}
              className={`flex cursor-pointer gap-3 rounded-lg border p-3 transition-colors duration-[--dur-fast] ${
                checked ? "border-info bg-info-soft" : "border-border hover:bg-surface-2"
              }`}
            >
              <input
                type="radio"
                name={groupId}
                value={basis}
                checked={checked}
                onChange={() => onChange(basis)}
                className="mt-0.5"
              />
              <span>
                <span className="block text-sm font-medium text-foreground">{copy.label}</span>
                <span className="mt-0.5 block text-xs text-muted">{copy.meaning}</span>
                {copy.example && (
                  <span className="mt-1 block text-xs text-muted">e.g. {copy.example}</span>
                )}
              </span>
            </label>
          );
        })}
      </div>

      {showNote ? (
        <label className="mt-3 block">
          <span className="text-xs font-medium text-foreground">
            Which one? (optional)
          </span>
          <input
            value={note}
            maxLength={300}
            onChange={(event) => onNoteChange(event.target.value)}
            placeholder="Pricing page form, March 2026 webinar, …"
            className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm"
          />
        </label>
      ) : (
        <button
          type="button"
          onClick={() => setShowNote(true)}
          className="mt-3 text-xs text-muted underline decoration-border underline-offset-4 hover:text-foreground hover:decoration-foreground"
        >
          Add a note about this list
        </button>
      )}
    </fieldset>
  );
}

export { DEFAULT_CONSENT_BASIS };
