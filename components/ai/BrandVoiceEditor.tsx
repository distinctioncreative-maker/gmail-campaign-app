"use client";

import { useState } from "react";
import { fetchJson } from "@/lib/fetchJson";
import {
  BRAND_TONES,
  BRAND_VOICE_FIELDS,
  EMPTY_BRAND_VOICE,
  brandVoiceCompleteness,
  type BrandTone,
  type BrandVoice,
} from "@/lib/ai/brandVoice";
import { Meter } from "@/components/ui/charts/Meter";

export interface BrandProfileDraft {
  id: string;
  name: string;
  voice: BrandVoice;
  notes: string;
}

/**
 * Teaching the AI what a business sounds like.
 *
 * The screen this replaces was one textarea labelled "Offer, key benefits, and
 * tone" with a worked example of the paragraph you were supposed to write. It
 * asked for homework and gave no signal for when you were finished, so the
 * common outcome was two thin lines, and thin input reads as a weak AI rather
 * than as an empty form.
 *
 * The ordering here is the whole design. The website field comes first and is
 * the primary action, because the fastest correct answer to every question below
 * it is already published on the company's own homepage. Someone who pastes a
 * domain is done in one action. The fields are what that produces, not a wall
 * they have to face first, and they stay fully editable because extraction is
 * never perfect and the person reading it knows their business better than the
 * page does.
 *
 * Two deliberate refusals:
 *
 * **Autofill never touches "never say".** A website cannot know which claims a
 * company forbids. A plausible guess there would read as authoritative and
 * quietly change what the AI is willing to write, so it stays blank and the
 * copy says why.
 *
 * **Nothing saves itself.** Reading a site produces a proposal that is visibly
 * a proposal. Fetching a URL and silently rewriting the whole team's brand
 * memory would be a far larger action than the button implies.
 */
export function BrandVoiceEditor({
  profiles,
  selectedId,
  canEdit,
  onChange,
  onSelect,
  onAdd,
  onDelete,
  onSave,
  saving,
}: {
  profiles: BrandProfileDraft[];
  selectedId: string | null;
  canEdit: boolean;
  onChange: (patch: Partial<BrandProfileDraft>) => void;
  onSelect: (id: string) => void;
  onAdd: () => void;
  onDelete: () => void;
  onSave: () => void;
  saving: boolean;
}) {
  const selected = profiles.find((p) => p.id === selectedId) ?? null;
  const [siteUrl, setSiteUrl] = useState("");
  const [reading, setReading] = useState(false);
  const [readError, setReadError] = useState<string | null>(null);
  const [readFrom, setReadFrom] = useState<string | null>(null);
  const [unfilled, setUnfilled] = useState<string[]>([]);
  const [showNotes, setShowNotes] = useState(false);

  const voice = selected?.voice ?? EMPTY_BRAND_VOICE;
  const completeness = brandVoiceCompleteness(voice);
  const started = completeness > 0;

  function setVoice(patch: Partial<BrandVoice>) {
    if (!selected) return;
    onChange({ voice: { ...selected.voice, ...patch } });
  }

  function toggleTone(tone: BrandTone) {
    const has = voice.tones.includes(tone);
    setVoice({
      tones: has ? voice.tones.filter((t) => t !== tone) : [...voice.tones, tone],
    });
  }

  async function readSite() {
    if (!siteUrl.trim() || !selected) return;
    setReading(true);
    setReadError(null);
    setUnfilled([]);
    try {
      const result = await fetchJson<{
        voice: BrandVoice;
        unfilled: string[];
        readFrom: string;
      }>("/api/ai/brand-memory/suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: siteUrl }),
      });
      /**
       * Merged, not replaced. Anything already written wins over anything read
       * from a page: a person who typed their own offer and then pasted a URL to
       * fill the rest would not expect their sentence overwritten, and `avoid` is
       * never suggested at all so it could only ever be lost here.
       */
      setVoice({
        offer: voice.offer.trim() || result.voice.offer,
        audience: voice.audience.trim() || result.voice.audience,
        proof: voice.proof.trim() || result.voice.proof,
        tones: voice.tones.length > 0 ? voice.tones : result.voice.tones,
      });
      setReadFrom(result.readFrom);
      setUnfilled(result.unfilled);
    } catch (err) {
      setReadError(err instanceof Error ? err.message : "Could not read that site.");
    } finally {
      setReading(false);
    }
  }

  if (!selected) {
    return (
      <div className="rounded-xl border border-dashed border-border p-4 text-center">
        <p className="text-sm text-muted">
          {canEdit
            ? "Teach the AI what your business sounds like, so every draft comes back on-brand."
            : "No brand voice has been set up yet. Only an admin can add one."}
        </p>
        {canEdit && (
          <button type="button" onClick={onAdd} className="btn-primary mt-3 px-3 py-1.5 text-xs">
            Set up brand voice
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border p-4">
      {/* Profile switcher, shown only when there is a choice to make. */}
      {(profiles.length > 1 || canEdit) && (
        <div className="mb-4 flex flex-wrap items-center gap-1.5">
          {profiles.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => onSelect(p.id)}
              className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors duration-[--dur-fast] ${
                p.id === selectedId
                  ? "bg-info-soft text-info"
                  : "text-muted hover:bg-surface-2"
              }`}
            >
              {p.name || "Untitled"}
            </button>
          ))}
          {canEdit && profiles.length < 12 && (
            <button
              type="button"
              onClick={onAdd}
              className="rounded-full border border-dashed border-info/40 px-2.5 py-1 text-xs font-medium text-info hover:bg-info-soft"
            >
              + Add brand
            </button>
          )}
        </div>
      )}

      {canEdit && (
        <input
          value={selected.name}
          onChange={(e) => onChange({ name: e.target.value })}
          placeholder="Brand name"
          className="mb-4 w-full rounded-lg border border-border px-2.5 py-1.5 text-sm font-medium focus:border-info focus:outline-none"
        />
      )}

      {/* The fast path, first and visually primary. Someone who pastes a domain
          never has to read the questions below. */}
      {canEdit && (
        <div className="rounded-lg bg-surface-2 p-3">
          <label className="block text-xs font-medium text-foreground">
            {started ? "Read your website again" : "Start with your website"}
          </label>
          <p className="mt-0.5 text-xs text-muted">
            {started
              ? "Fills anything still blank. Nothing you have written gets overwritten."
              : "Paste your address and the answers below get filled in for you. You can edit anything after."}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <input
              value={siteUrl}
              onChange={(e) => setSiteUrl(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void readSite();
                }
              }}
              placeholder="yourcompany.com"
              className="min-w-0 flex-1 rounded-lg border border-border px-2.5 py-1.5 text-sm focus:border-info focus:outline-none"
            />
            <button
              type="button"
              onClick={() => void readSite()}
              disabled={reading || !siteUrl.trim()}
              className="btn-primary shrink-0 px-3 py-1.5 text-xs"
            >
              {reading ? "Reading…" : "Read site"}
            </button>
          </div>
          {readError && <p className="mt-2 text-xs text-danger">{readError}</p>}
          {readFrom && !readError && (
            <p className="mt-2 text-xs text-success">
              Read {readFrom}. Check it over before saving.
            </p>
          )}
          {unfilled.length > 0 && (
            <p className="mt-1 text-xs text-muted">
              The page did not say enough to answer everything, so some fields are still
              blank rather than guessed.
            </p>
          )}
        </div>
      )}

      <div className="mt-4 space-y-4">
        {BRAND_VOICE_FIELDS.map((field) => (
          <label key={field.key} className="block">
            <span className="text-sm font-medium text-foreground">{field.question}</span>
            <span className="mt-0.5 block text-xs text-muted">
              {field.hint}
              {/* Said at the point of the question rather than in a help doc:
                  this is the one field a website genuinely cannot answer. */}
              {field.key === "avoid" && " Reading your site never fills this in."}
            </span>
            <textarea
              value={voice[field.key]}
              onChange={(e) => setVoice({ [field.key]: e.target.value } as Partial<BrandVoice>)}
              disabled={!canEdit}
              rows={2}
              placeholder={canEdit ? field.placeholder : ""}
              className="mt-1.5 w-full rounded-lg border border-border p-2.5 text-sm focus:border-info focus:outline-none disabled:bg-surface-2 disabled:text-muted"
            />
          </label>
        ))}

        <div>
          <span className="text-sm font-medium text-foreground">How should it sound?</span>
          <span className="mt-0.5 block text-xs text-muted">Pick one or two.</span>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {BRAND_TONES.map((tone) => {
              const on = voice.tones.includes(tone);
              return (
                <button
                  key={tone}
                  type="button"
                  disabled={!canEdit}
                  onClick={() => toggleTone(tone)}
                  aria-pressed={on}
                  className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-colors duration-[--dur-fast] disabled:opacity-60 ${
                    on
                      ? "border-info bg-info-soft text-info"
                      : "border-border text-muted hover:bg-surface-2"
                  }`}
                >
                  {tone}
                </button>
              );
            })}
          </div>
        </div>

        {/* Collapsed, because it is the escape hatch rather than the path. The
            structured questions cover what the model needs; this exists for the
            genuinely unusual, and for the text carried over from the old single
            box so nothing anyone wrote is lost. */}
        {showNotes || selected.notes.trim() ? (
          <label className="block">
            <span className="text-sm font-medium text-foreground">Anything else</span>
            <span className="mt-0.5 block text-xs text-muted">
              Anything the questions above do not cover.
            </span>
            <textarea
              value={selected.notes}
              onChange={(e) => onChange({ notes: e.target.value })}
              disabled={!canEdit}
              rows={3}
              className="mt-1.5 w-full rounded-lg border border-border p-2.5 text-sm focus:border-info focus:outline-none disabled:bg-surface-2 disabled:text-muted"
            />
          </label>
        ) : (
          canEdit && (
            <button
              type="button"
              onClick={() => setShowNotes(true)}
              className="text-xs text-muted underline decoration-border underline-offset-4 hover:text-foreground hover:decoration-foreground"
            >
              Add anything else
            </button>
          )
        )}
      </div>

      {/* Progress, so "am I done?" has an answer. The old box had none, which is
          most of why people stopped after two lines. */}
      <div className="mt-5 flex items-center gap-3">
        <Meter
          value={Math.round(completeness * 100)}
          tone={completeness >= 0.6 ? "good" : "progress"}
          className="flex-1"
        />
        <span className="shrink-0 text-xs tabular-nums text-muted">
          {completeness >= 1
            ? "Complete"
            : completeness >= 0.6
              ? "Good enough to write well"
              : "Add a little more"}
        </span>
      </div>

      {canEdit && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onSave}
            disabled={saving}
            className="btn-primary px-3 py-1.5 text-xs"
          >
            {saving ? "Saving…" : "Save brand voice"}
          </button>
          {profiles.length > 1 && (
            <button
              type="button"
              onClick={onDelete}
              className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-muted hover:bg-surface-2"
            >
              Delete this brand
            </button>
          )}
          <span className="text-xs text-muted">Applies to your whole team.</span>
        </div>
      )}
    </div>
  );
}
