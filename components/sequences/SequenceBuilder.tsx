"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useDraftAutosave } from "@/lib/hooks/useDraftAutosave";
import { RestoreDraftBanner } from "@/components/RestoreDraftBanner";
import { AiSequenceWriter, type GeneratedStep } from "@/components/sequences/AiSequenceWriter";

interface Step {
  delayValue: number;
  delayUnit: "MINUTES" | "HOURS" | "DAYS" | "BUSINESS_DAYS";
  bodyMode: "SAME" | "TEMPLATE" | "CUSTOM";
  templateId: string | null;
  customHtml: string;
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
  bodyMode: "SAME",
  templateId: null,
  customHtml: "<p>Hi {{first_name}},</p><p></p>",
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

  const { restored, clear, dismissRestored } = useDraftAutosave(
    `draft.sequence.${sequenceId ?? "new"}`,
    { name, description, steps, oooPolicy }
  );

  function applyRestored() {
    if (!restored) return;
    setName(restored.name);
    setDescription(restored.description);
    setSteps(restored.steps);
    setOooPolicy(restored.oooPolicy);
    dismissRestored();
  }

  function updateStep(i: number, patch: Partial<Step>) {
    setSteps((prev) => prev.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
  }

  // Replace the steps with an AI-drafted sequence (each becomes an editable
  // custom step the user can still tweak).
  function applyGenerated(gen: GeneratedStep[]) {
    setSteps(
      gen.slice(0, 10).map((g) => ({
        delayValue: g.waitDays,
        delayUnit: "BUSINESS_DAYS" as const,
        bodyMode: "CUSTOM" as const,
        templateId: null,
        customHtml: g.html,
        subjectMode: "CUSTOM" as const,
        customSubject: g.subject,
        sameThread: true,
        enabled: true,
      }))
    );
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
      clear();
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
      {restored && (
        <RestoreDraftBanner
          what="sequence"
          onRestore={applyRestored}
          onDiscard={() => {
            clear();
            dismissRestored();
          }}
        />
      )}
      {error && <p className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}

      <div className="card p-6">
        <label className="block text-sm font-medium text-slate-700">
          Sequence name
          <input value={name} onChange={(e) => setName(e.target.value)} className={`w-full ${input}`} placeholder="e.g. Two-touch follow-up" />
        </label>
        <label className="mt-4 block text-sm font-medium text-slate-700">
          Description (optional)
          <input value={description} onChange={(e) => setDescription(e.target.value)} className={`w-full ${input}`} />
        </label>
      </div>

      <div className="mt-4">
        <AiSequenceWriter onResult={applyGenerated} />
      </div>

      <div className="mt-4 card p-6">
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

            <div className="mt-3">
              <p className="text-sm font-medium text-slate-700">What to send</p>
              <div className="mt-1 flex flex-wrap gap-2">
                {(
                  [
                    ["SAME", "Reuse the first email"],
                    ["TEMPLATE", "Pick a saved template"],
                    ["CUSTOM", "Write it here"],
                  ] as Array<[Step["bodyMode"], string]>
                ).map(([mode, label]) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => updateStep(i, { bodyMode: mode })}
                    className={`rounded-lg px-3 py-1.5 text-xs font-medium ${
                      step.bodyMode === mode
                        ? "bg-primary text-white"
                        : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {step.bodyMode === "TEMPLATE" && (
              <label className="mt-3 block text-sm font-medium text-slate-700">
                Template
                <select
                  value={step.templateId ?? ""}
                  onChange={(e) => updateStep(i, { templateId: e.target.value || null })}
                  className={`w-full ${input}`}
                >
                  <option value="">Choose a template…</option>
                  {templates.map((t) => (
                    <option key={t.templateId} value={t.templateId}>{t.name}</option>
                  ))}
                </select>
              </label>
            )}

            {step.bodyMode === "CUSTOM" && (
              <label className="mt-3 block text-sm font-medium text-slate-700">
                Follow-up message
                <span className="block text-xs font-normal text-slate-500">
                  Write it here. Use placeholders like {"{{first_name}}"} and {"{{signature}}"} —
                  basic HTML is allowed.
                </span>
                <textarea
                  value={step.customHtml}
                  onChange={(e) => updateStep(i, { customHtml: e.target.value })}
                  rows={6}
                  placeholder={"Hi {{first_name}},\n\nJust circling back…\n\n{{signature}}"}
                  className={`w-full font-mono ${input}`}
                />
              </label>
            )}

            <div className="mt-3">
              <label className="text-sm font-medium text-slate-700">
                Subject line
                <select
                  value={step.subjectMode}
                  onChange={(e) => updateStep(i, { subjectMode: e.target.value as Step["subjectMode"] })}
                  className={`block w-full ${input}`}
                >
                  <option value="RE">Reply in same thread (Re:)</option>
                  <option value="KEEP">Keep original subject</option>
                  <option value="CUSTOM">Custom subject</option>
                </select>
              </label>
              {step.subjectMode === "CUSTOM" && (
                <input
                  value={step.customSubject}
                  onChange={(e) => updateStep(i, { customSubject: e.target.value })}
                  placeholder="Custom subject line"
                  className={`mt-2 w-full ${input}`}
                />
              )}
            </div>

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

      <div className="mt-4 card p-6">
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
