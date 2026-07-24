"use client";

import { useEffect, useState } from "react";
import { fetchJson } from "@/lib/fetchJson";
import { useToast } from "@/components/ui/UIProviders";

/** One-click starting points. Each fills the prompt box; the user can edit
 * before generating. Occasion presets pair with brand memory to keep emails
 * on-message but seasonally fresh. */
const PRESETS: Array<{ label: string; prompt: string }> = [
  {
    label: "🎉 New Year, New You",
    prompt:
      "A warm “New Year, New You” seasonal email inviting the business owner to start the year strong with fresh working capital. Upbeat and encouraging.",
  },
  {
    label: "📅 Mid-month check-in",
    prompt:
      "A short mid-month check-in to a business owner who hasn't replied yet. Friendly, no pressure, gently re-offer funding and ask if now's a better time.",
  },
  {
    label: "🔁 Re-engage a past client",
    prompt:
      "A friendly note to a business we've funded before. Reference the past relationship warmly and offer funding again for their next move or busy season.",
  },
  {
    label: "☀️ Seasonal offer",
    prompt:
      "A seasonal email tied to the current time of year, positioning fast funding as the way to seize a timely opportunity or prep for a busy stretch.",
  },
  {
    label: "👋 Warm first touch",
    prompt:
      "A warm first-touch intro offering fast, flexible working capital to a busy small-business owner. Human and confident, one clear ask.",
  },
  {
    label: "🚚 Nudge a busy owner",
    prompt:
      "A short follow-up nudge for a busy contractor or trucking owner who hasn't replied. Respect their time, restate the offer in one line.",
  },
];

interface AiStatus {
  enabled: boolean;
  hasBrandMemory: boolean;
}

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

  // Brand memory editor (loaded lazily when the panel opens).
  const [memoryOpen, setMemoryOpen] = useState(false);
  const [brand, setBrand] = useState("");
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
      const r = await fetchJson<{ brandContext: string; canEdit: boolean }>("/api/ai/brand-memory");
      setBrand(r.brandContext);
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

  async function saveBrand() {
    setSavingBrand(true);
    try {
      const res = await fetchJson<{ message?: string }>("/api/ai/brand-memory", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brandContext: brand }),
      });
      setStatus((s) => (s ? { ...s, hasBrandMemory: brand.trim().length > 0 } : s));
      toast(res.message ?? "Brand memory saved.", "success");
      setMemoryOpen(false);
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
        body: JSON.stringify({ prompt: prompt.trim() }),
      });
      onResult(email);
      toast("Draft written — tweak it to taste.", "success");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Couldn't write that — try again.", "error");
    } finally {
      setBusy(false);
    }
  }

  const notConfigured = status?.enabled === false;

  return (
    <div className="mb-4 overflow-hidden rounded-2xl border border-primary/20 bg-primary-soft/40">
      {!open ? (
        <button
          onClick={() => {
            setOpen(true);
            if (!notConfigured) void loadBrand();
          }}
          disabled={status === null}
          className="flex w-full items-center gap-2 p-3 text-left text-sm font-medium text-primary transition hover:bg-primary-soft disabled:opacity-60"
        >
          <span aria-hidden className="text-base">✨</span>
          Write this email with AI
          {notConfigured && (
            <span className="ml-auto rounded-full bg-white px-2 py-0.5 text-[11px] font-medium text-slate-500">
              Setup needed
            </span>
          )}
        </button>
      ) : notConfigured ? (
        <div className="p-4">
          <div className="flex items-center gap-2 text-sm font-medium text-primary">
            <span aria-hidden className="text-base">✨</span> AI email writer
          </div>
          <p className="mt-2 text-sm text-slate-600">
            The AI writer isn&apos;t switched on yet. It writes a full subject + body from one plain
            sentence, and weaves in your saved brand memory so every email stays on-brand.
          </p>
          <div className="mt-3 rounded-xl border border-primary/20 bg-white p-3 text-sm text-slate-600">
            <p className="font-medium text-slate-700">To turn it on (one-time, ~1 minute):</p>
            <ol className="mt-1.5 list-decimal space-y-1 pl-5">
              <li>
                Grab a free key at{" "}
                <a
                  href="https://aistudio.google.com/app/apikey"
                  target="_blank"
                  rel="noreferrer"
                  className="text-primary hover:underline"
                >
                  Google AI Studio
                </a>
                .
              </li>
              <li>
                Add it to the app as <code className="rounded bg-slate-100 px-1">GEMINI_API_KEY</code>{" "}
                and redeploy.
              </li>
              <li>Refresh this page — the writer appears here automatically.</li>
            </ol>
          </div>
          <button onClick={() => setOpen(false)} className="btn-ghost mt-3 px-3 py-2 text-sm">
            Close
          </button>
        </div>
      ) : (
        <div className="p-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-sm font-medium text-primary">
              <span aria-hidden className="text-base">✨</span> Describe the email you want
            </div>
            <button
              onClick={() => void openMemory()}
              className="rounded-full border border-primary/20 bg-white px-2.5 py-1 text-xs font-medium text-primary hover:border-primary"
            >
              {status?.hasBrandMemory ? "🧠 Brand memory: on" : "🧠 Add brand memory"}
            </button>
          </div>

          {memoryOpen && (
            <div className="mt-2 rounded-xl border border-primary/20 bg-white p-3">
              <p className="text-xs font-medium text-slate-700">
                Brand memory — the AI weaves this into every email, freshly each time
              </p>
              <p className="mt-0.5 text-[11px] text-slate-500">
                Put your offer, key benefits, and tone here. Example: “Alpine Funding — working
                capital $10k–$500k, funded in 24–48h, no collateral. Confident and friendly, never
                pushy.”
              </p>
              <textarea
                value={brand}
                onChange={(e) => setBrand(e.target.value)}
                disabled={!canEditBrand}
                rows={4}
                placeholder={
                  canEditBrand
                    ? "Your offer, benefits, tone, and anything the AI should always know…"
                    : "Only a manager or admin can edit brand memory."
                }
                className="mt-2 w-full rounded-lg border border-slate-200 p-2.5 text-sm focus:border-primary focus:outline-none disabled:bg-slate-50 disabled:text-slate-500"
              />
              {canEditBrand && (
                <div className="mt-2 flex items-center gap-2">
                  <button
                    onClick={() => void saveBrand()}
                    disabled={savingBrand}
                    className="btn-primary px-3 py-1.5 text-xs"
                  >
                    {savingBrand ? "Saving…" : "Save brand memory"}
                  </button>
                  <span className="text-[11px] text-slate-400">Applies to your whole team.</span>
                </div>
              )}
            </div>
          )}

          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={2}
            autoFocus
            placeholder="e.g. Warm first-touch offering fast working capital to a busy auto-repair shop owner"
            className="mt-2 w-full rounded-xl border border-primary/20 bg-white p-2.5 text-sm focus:border-primary focus:outline-none"
          />
          <div className="mt-2 flex flex-wrap gap-1.5">
            {PRESETS.map((p) => (
              <button
                key={p.label}
                onClick={() => setPrompt(p.prompt)}
                className="rounded-full border border-primary/20 bg-white px-2.5 py-1 text-xs text-slate-600 hover:border-primary"
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
            <span className="text-xs text-slate-400">
              Uses {"{{firstName}}"}, {"{{businessName}}"}, {"{{signature}}"}.
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
