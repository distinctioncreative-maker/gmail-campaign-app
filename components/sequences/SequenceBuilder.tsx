"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface Step {
  delayValue: number;
  delayUnit: "MINUTES" | "HOURS" | "DAYS" | "BUSINESS_DAYS";
  templateId: string | null;
  subjectMode: "KEEP" | "RE" | "CUSTOM";
  customSubject: string;
  sameThread: boolean;
  enabled: boolean;
}

interface TemplateOption {
  templateId: string;
  name: string;
}

const emptyStep = (): Step => ({
  delayValue: 2,
  delayUnit: "BUSINESS_DAYS",
  templateId: null,
  subjectMode: "RE",
  customSubject: "",
  sameThread: true,
  enabled: true,
});

export function SequenceBuilder({
  sequenceId,
  initial,
  templates,
}: {
  sequenceId: string | null;
  initial: {
    name: string;
    description: string;
    outOfOfficePolicy: string;
    stopOnReply: boolean;
    stopOnBounce: boolean;
    stopOnUnsubscribe: boolean;
    steps: Step[];
  } | null;
  templates: TemplateOption[];
}) {
  const router = useRouter();
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [steps, setSteps] = useState<Step[]>(initial?.steps ?? [emptyStep()]);
  const [oooPolicy, setOooPolicy] = useState(initial?.outOfOfficePolicy ?? "PAUSE_DAYS");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function updateStep(i: number, patch: Partial<Step>) {
    setSteps((prev) => prev.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
  }

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(sequenceId ? `/api/sequences/${sequenceId}` : "/api/sequences", {
        method: sequenceId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name || "Untitled sequence",
          description,
          outOfOfficePolicy: oooPolicy,
          stopOnReply: true,
          stopOnBounce: true,
          stopOnUnsubscribe: true,
          steps,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Could not save the sequence.");
      router.push("/sequences");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the sequence.");
      setBusy(false);
    }
  }

  const input =
    "mt-1 rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-primary focus:outline-none";

  return (
    <div className="max-w-2xl">
      {error && <p className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}

      <div className="rounded-2xl bg-white p-6 shadow-sm">
        <label className="block text-sm font-medium text-slate-700">
          Sequence name
          <input value={name} onChange={(e) => setName(e.target.value)} className={`w-full ${input}`} placeholder="e.g. Two-touch follow-up" />
        </label>
        <label className="mt-4 block text-sm font-medium text-slate-700">
          Description (optional)
          <input value={description} onChange={(e) => setDescription(e.target.value)} className={`w-full ${input}`} />
        </label>
      </div>

      <div className="mt-4 rounded-2xl bg-white p-6 shadow-sm">
        <div className="mb-4 rounded-lg bg-slate-50 p-3 text-sm text-slate-600">
          📧 Initial email is sent first. Then:
        </div>
        {steps.map((step, i) => (
          <div key={i} className="mb-4 rounded-xl border border-slate-200 p-4">
            <div className="flex items-center justify-between">
              <p className="font-medium">Follow-up {i + 1}</p>
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-1 text-xs text-slate-500">
                  <input
                    type="checkbox"
                    checked={step.enabled}
                    onChange={(e) => updateStep(i, { enabled: e.target.checked })}
                  />
                  Enabled
                </label>
                <button
                  onClick={() => setSteps((prev) => prev.filter((_, idx) => idx !== i))}
                  className="text-xs text-red-600 hover:underline"
                >
                  Remove
                </button>
              </div>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
              <span className="text-slate-500">Wait</span>
              <input
                type="number"
                min={0}
                value={step.delayValue}
                onChange={(e) => updateStep(i, { delayValue: Number(e.target.value) })}
                className={`w-20 ${input}`}
              />
              <select
                value={step.delayUnit}
                onChange={(e) => updateStep(i, { delayUnit: e.target.value as Step["delayUnit"] })}
                className={input}
              >
                <option value="BUSINESS_DAYS">business days</option>
                <option value="DAYS">days</option>
                <option value="HOURS">hours</option>
                <option value="MINUTES">minutes</option>
              </select>
              <span className="text-slate-500">then send:</span>
            </div>

            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="text-sm font-medium text-slate-700">
                Email template
                <select
                  value={step.templateId ?? ""}
                  onChange={(e) => updateStep(i, { templateId: e.target.value || null })}
                  className={`w-full ${input}`}
                >
                  <option value="">Same as initial email</option>
                  {templates.map((t) => (
                    <option key={t.templateId} value={t.templateId}>{t.name}</option>
                  ))}
                </select>
              </label>
              <label className="text-sm font-medium text-slate-700">
                Subject line
                <select
                  value={step.subjectMode}
                  onChange={(e) => updateStep(i, { subjectMode: e.target.value as Step["subjectMode"] })}
                  className={`w-full ${input}`}
                >
                  <option value="RE">Reply in same thread (Re:)</option>
                  <option value="KEEP">Keep original subject</option>
                  <option value="CUSTOM">Custom subject</option>
                </select>
              </label>
            </div>

            {step.subjectMode === "CUSTOM" && (
              <input
                value={step.customSubject}
                onChange={(e) => updateStep(i, { customSubject: e.target.value })}
                placeholder="Custom subject line"
                className={`mt-2 w-full ${input}`}
              />
            )}

            <label className="mt-3 flex items-center gap-2 text-sm text-slate-600">
              <input
                type="checkbox"
                checked={step.sameThread}
                onChange={(e) => updateStep(i, { sameThread: e.target.checked })}
              />
              Send in the same email thread
            </label>
          </div>
        ))}

        {steps.length < 10 && (
          <button
            onClick={() => setSteps((prev) => [...prev, emptyStep()])}
            className="rounded-xl border border-dashed border-slate-300 px-4 py-2 text-sm text-slate-600 hover:border-primary"
          >
            + Add a follow-up
          </button>
        )}
      </div>

      <div className="mt-4 rounded-2xl bg-white p-6 shadow-sm">
        <h3 className="font-medium">Stop rules</h3>
        <p className="mt-1 text-sm text-slate-500">
          Follow-ups always stop when someone replies, unsubscribes, or bounces. These can&apos;t
          be turned off — they keep you safe.
        </p>
        <label className="mt-4 block text-sm font-medium text-slate-700">
          If someone is out of office
          <select value={oooPolicy} onChange={(e) => setOooPolicy(e.target.value)} className={`w-full ${input}`}>
            <option value="PAUSE_DAYS">Pause follow-ups until they&apos;re back (recommended)</option>
            <option value="CONTINUE">Keep the schedule as-is</option>
            <option value="STOP">Stop follow-ups to them</option>
          </select>
        </label>
      </div>

      <button
        onClick={save}
        disabled={busy || steps.length === 0}
        className="mt-6 rounded-xl bg-primary px-5 py-2.5 font-medium text-white hover:bg-primary-hover disabled:opacity-50"
      >
        {busy ? "Saving…" : sequenceId ? "Save changes" : "Save sequence"}
      </button>
    </div>
  );
}
