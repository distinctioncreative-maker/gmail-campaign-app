"use client";

import { useEffect, useState } from "react";
import { fetchJson } from "@/lib/fetchJson";
import { BrandVoiceEditor, type BrandProfileDraft } from "@/components/ai/BrandVoiceEditor";
import { EMPTY_BRAND_VOICE } from "@/lib/ai/brandVoice";
import { useToast } from "@/components/ui/UIProviders";
import { Icon } from "@/components/ui/Icon";

/** One-click starting points. Each fills the prompt box; the user can edit
 * before generating. Occasion presets pair with brand memory to keep emails
 * on-message but seasonally fresh. */
const PRESETS: Array<{ label: string; prompt: string }> = [
  {
    label: "New Year, New You",
    prompt:
      "A warm “New Year, New You” seasonal email inviting the business owner to start the year strong with fresh working capital. Upbeat and encouraging.",
  },
  {
    label: "Mid-month check-in",
    prompt:
      "A short mid-month check-in to a business owner who hasn't replied yet. Friendly, no pressure, gently re-offer funding and ask if now's a better time.",
  },
  {
    label: "Re-engage a past client",
    prompt:
      "A friendly note to a business we've funded before. Reference the past relationship warmly and offer funding again for their next move or busy season.",
  },
  {
    label: "Seasonal offer",
    prompt:
      "A seasonal email tied to the current time of year, positioning fast funding as the way to seize a timely opportunity or prep for a busy stretch.",
  },
  {
    label: "Warm first touch",
    prompt:
      "A warm first-touch intro offering fast, flexible working capital to a busy small-business owner. Human and confident, one clear ask.",
  },
  {
    label: "Nudge a busy owner",
    prompt:
      "A short follow-up nudge for a busy contractor or trucking owner who hasn't replied. Respect their time, restate the offer in one line.",
  },
];

interface AiStatus {
  enabled: boolean;
  hasBrandMemory: boolean;
}

/**
 * The editor owns the shape now. `content` is not part of it: the server compiles
 * that from the structured voice, so a client that also held a copy would be
 * holding a value able to disagree with the fields it was derived from.
 */
type BrandProfile = BrandProfileDraft;

/**
 * "Write with AI" panel for the template editor. Describe the email in plain
 * language; it fills the subject + body, weaving in the org's saved brand
 * memory. Hidden entirely when the AI writer isn't configured on the server.
 */
export function AiEmailWriter({
  onResult,
}: {
  onResult: (email: { subject: string; html: string }) => void;
}) {
  const toast = useToast();
  const [status, setStatus] = useState<AiStatus | null>(null);
  const [open, setOpen] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);

  // Brand memory profiles (loaded lazily when the panel opens).
  const [memoryOpen, setMemoryOpen] = useState(false);
  const [profiles, setProfiles] = useState<BrandProfile[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [brandLoaded, setBrandLoaded] = useState(false);
  const [canEditBrand, setCanEditBrand] = useState(false);
  const [savingBrand, setSavingBrand] = useState(false);


  useEffect(() => {
    fetchJson<AiStatus>("/api/templates/generate")
      .then(setStatus)
      .catch(() => setStatus({ enabled: false, hasBrandMemory: false }));
  }, []);

  async function loadBrand() {
    if (brandLoaded) return;
    try {
      const r = await fetchJson<{ profiles: BrandProfile[]; canEdit: boolean }>("/api/ai/brand-memory");
      setProfiles(r.profiles);
      setSelectedId(r.profiles[0]?.id ?? null);
      setCanEditBrand(r.canEdit);
    } catch {
      /* non-fatal */
    } finally {
      setBrandLoaded(true);
    }
  }

  async function openMemory() {
    await loadBrand();
    setMemoryOpen((v) => !v);
  }

  function updateSelected(patch: Partial<BrandProfile>) {
    setProfiles((prev) => prev.map((p) => (p.id === selectedId ? { ...p, ...patch } : p)));
  }

  function addProfile() {
    const id = `new-${Date.now()}`;
    setProfiles((prev) => [
      ...prev,
      { id, name: "New brand", voice: { ...EMPTY_BRAND_VOICE }, notes: "" },
    ]);
    setSelectedId(id);
  }

  function deleteSelected() {
    if (!selectedId) return;
    const next = profiles.filter((p) => p.id !== selectedId);
    setProfiles(next);
    setSelectedId(next[0]?.id ?? null);
  }

  async function saveBrand() {
    setSavingBrand(true);
    try {
      const res = await fetchJson<{ profiles: BrandProfile[]; message?: string }>("/api/ai/brand-memory", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          profiles: profiles.map((p) => ({
            ...(p.id.startsWith("new-") ? {} : { id: p.id }),
            name: p.name,
            voice: p.voice,
            notes: p.notes,
          })),
        }),
      });
      setProfiles(res.profiles);
      setSelectedId((cur) => res.profiles.find((p) => p.id === cur)?.id ?? res.profiles[0]?.id ?? null);
      setStatus((s) => (s ? { ...s, hasBrandMemory: res.profiles.length > 0 } : s));
      toast(res.message ?? "Brand memory saved.", "success");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Couldn't save that.", "error");
    } finally {
      setSavingBrand(false);
    }
  }

  async function generate() {
    if (prompt.trim().length < 3) return;
    setBusy(true);
    try {
      const email = await fetchJson<{ subject: string; html: string }>("/api/templates/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: prompt.trim(), profileId: selectedId }),
      });
      onResult(email);
      toast("Draft written: tweak it to taste.", "success");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Couldn't write that: try again.", "error");
    } finally {
      setBusy(false);
    }
  }

  // AI is an admin-gated feature: render nothing until we've confirmed it's on
  // for this org, so the writer is simply absent when disabled.
  if (status?.enabled !== true) return null;

  return (
    <div className="mb-4 overflow-hidden rounded-lg border border-info/20 bg-info-soft/55">
      {!open ? (
        <button
          onClick={() => {
            setOpen(true);
            void loadBrand();
          }}
          className="flex w-full items-center gap-2 p-3 text-left text-sm font-medium text-info transition hover:bg-info-soft disabled:opacity-60"
        >
          <Icon name="sparkles" size={16} aria-hidden />
          Write this email with AI
        </button>
      ) : (
        <div className="p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-sm font-medium text-info">
              <Icon name="sparkles" size={16} aria-hidden /> Describe the email you want
            </div>
            <div className="flex items-center gap-1.5">
              {profiles.length > 0 && (
                <label className="flex items-center gap-1 text-xs text-muted">
                  <span className="hidden sm:inline">Brand</span>
                  <select
                    value={selectedId ?? ""}
                    onChange={(e) => setSelectedId(e.target.value)}
                    className="rounded-full border border-info/20 bg-surface px-2 py-1 text-xs font-medium text-foreground focus:border-info focus:outline-none"
                  >
                    {profiles.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {(canEditBrand || profiles.length > 0) && (
                <button
                  onClick={() => void openMemory()}
                  className="rounded-full border border-info/20 bg-surface px-2.5 py-1 text-xs font-medium text-info hover:border-info"
                >
                  {profiles.length === 0 ? "Add brand memory" : canEditBrand ? "Edit" : "View"}
                </button>
              )}
            </div>
          </div>

          {memoryOpen && (
            <div className="mt-2">
              <BrandVoiceEditor
                profiles={profiles}
                selectedId={selectedId}
                canEdit={canEditBrand}
                onChange={updateSelected}
                onSelect={setSelectedId}
                onAdd={addProfile}
                onDelete={deleteSelected}
                onSave={() => void saveBrand()}
                saving={savingBrand}
              />
            </div>
          )}

          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={2}
            autoFocus
            placeholder="e.g. Warm first-touch offering fast working capital to a busy auto-repair shop owner"
            className="mt-2 w-full rounded-md border border-info/20 bg-surface p-2.5 text-sm focus:border-info focus:outline-none"
          />
          <div className="mt-2 flex flex-wrap gap-1.5">
            {PRESETS.map((p) => (
              <button
                key={p.label}
                onClick={() => setPrompt(p.prompt)}
                className="rounded-full border border-info/20 bg-surface px-2.5 py-1 text-xs text-muted hover:border-info"
              >
                {p.label}
              </button>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              onClick={() => void generate()}
              disabled={busy || prompt.trim().length < 3}
              className="btn-primary px-4 py-2 text-sm"
            >
              {busy ? "Writing…" : "Write it"}
            </button>
            <button onClick={() => setOpen(false)} className="btn-ghost px-3 py-2 text-sm">
              Close
            </button>
            <span className="text-xs text-muted">
              Uses {"{{firstName}}"}, {"{{businessName}}"}, {"{{signature}}"}.
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
