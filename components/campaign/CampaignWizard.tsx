"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { badgeFor } from "@/components/imports/leadBadges";
import { HelpTip } from "@/components/HelpTip";
import { useDraftAutosave } from "@/lib/hooks/useDraftAutosave";
import { RestoreDraftBanner } from "@/components/RestoreDraftBanner";
import { fetchJson } from "@/lib/fetchJson";
import { SkeletonList } from "@/components/ui/Skeleton";
import { SpamCheck } from "@/components/spam/SpamCheck";
import { TemplateEditor } from "@/components/templates/TemplateEditor";
import { Icon } from "@/components/ui/Icon";
import { useConfirm } from "@/components/ui/UIProviders";
import { assessPaceRisk } from "@/lib/campaigns/paceSafety";
import { buildLaunchSelections, computeListScopedCounts } from "@/lib/campaigns/wizardSelections";

const STEPS = ["Name", "Leads", "Review", "Email", "Schedule", "Safety check", "Launch"];

interface WizardContact {
  contactId: string;
  fullName: string;
  businessName: string;
  email: string;
  classification: string;
  listIds: string[];
  lastCampaignName: string | null;
  lastCampaignAt: number | null;
}

interface WizardLeadList {
  listId: string;
  name: string;
  count: number;
}

interface WizardTemplate {
  templateId: string;
  name: string;
  subjectTemplate: string;
  active: boolean;
}

interface WizardSequence {
  sequenceId: string;
  name: string;
  steps: unknown[];
}

const PRESETS = {
  conservative: {
    label: "Conservative",
    detail: "3 per batch · 10–20s apart · 5 min between batches · 50/day",
    schedule: { emailsPerBatch: 3, minDelaySeconds: 10, maxDelaySeconds: 20, interBatchDelayMinutes: 5, dailySendLimit: 50 },
  },
  balanced: {
    label: "Balanced",
    detail: "5 per batch · 5–10s apart · 2 min between batches · 100/day",
    schedule: { emailsPerBatch: 5, minDelaySeconds: 5, maxDelaySeconds: 10, interBatchDelayMinutes: 2, dailySendLimit: 100 },
  },
  faster: {
    label: "Faster",
    detail: "10 per batch · 3–6s apart · 1 min between batches · 200/day",
    schedule: { emailsPerBatch: 10, minDelaySeconds: 3, maxDelaySeconds: 6, interBatchDelayMinutes: 1, dailySendLimit: 200 },
  },
} as const;

type PresetKey = keyof typeof PRESETS | "custom";

export function CampaignWizard() {
  const router = useRouter();
  const confirm = useConfirm();
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  const [contacts, setContacts] = useState<WizardContact[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [leadLists, setLeadLists] = useState<WizardLeadList[]>([]);
  // "" ⇒ all leads; otherwise a saved lead list is the source.
  const [listFilter, setListFilter] = useState<string>("");

  const [templates, setTemplates] = useState<WizardTemplate[] | null>(null);
  // Ordered selection; first = primary. 2+ ⇒ A/B rotation.
  const [templateIds, setTemplateIds] = useState<string[]>([]);
  const primaryTemplateId = templateIds[0] ?? null;
  const [preview, setPreview] = useState<{ subject: string; html: string } | null>(null);

  function toggleTemplate(id: string) {
    setTemplateIds((prev) =>
      prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]
    );
  }

  // Inline template creation/editing right in the wizard, instead of sending
  // the user to /templates and back. null = grid view; otherwise the full
  // TemplateEditor renders in place (templateId null = brand new template).
  const [editing, setEditing] = useState<{
    templateId: string | null;
    initial: { name: string; subjectTemplate: string; htmlTemplate: string; type: string } | null;
  } | null>(null);
  const [editLoading, setEditLoading] = useState(false);

  async function refetchTemplates() {
    const tBody = await fetch("/api/templates").then((r) => r.json());
    setTemplates((tBody.templates ?? []).filter((t: WizardTemplate) => t.active));
  }

  async function openEditTemplate(tid: string) {
    setEditLoading(true);
    try {
      const full = await fetch(`/api/templates/${tid}`).then((r) => r.json());
      setEditing({
        templateId: tid,
        initial: {
          name: full.template.name,
          subjectTemplate: full.template.subjectTemplate,
          htmlTemplate: full.template.htmlTemplate,
          type: full.template.type,
        },
      });
    } finally {
      setEditLoading(false);
    }
  }

  async function handleTemplateSaved(saved: { templateId: string; name: string; subjectTemplate: string; htmlTemplate: string; type: string }) {
    await refetchTemplates();
    setTemplateIds((prev) => (prev.includes(saved.templateId) ? prev : [...prev, saved.templateId]));
    setEditing(null);
    void loadPreview(saved.templateId);
  }

  const [sequences, setSequences] = useState<WizardSequence[]>([]);
  const [sequenceId, setSequenceId] = useState<string | null>(null);

  const [preset, setPreset] = useState<PresetKey>("balanced");
  const [customPace, setCustomPace] = useState({
    emailsPerBatch: 5,
    minDelaySeconds: 5,
    maxDelaySeconds: 10,
    interBatchDelayMinutes: 2,
    dailySendLimit: 100,
  });
  const [draftStrategy, setDraftStrategy] = useState<"SEND" | "DRAFT_ONLY">("SEND");
  const [trackingEnabled, setTrackingEnabled] = useState(false);
  // Data-backed addition to the pace-risk warning below, once the
  // anonymized cross-user benchmarks have a surfaced daily-limit bucket.
  const [benchmarkTip, setBenchmarkTip] = useState<string | null>(null);
  const [personalize, setPersonalize] = useState(false);
  const [aiEnabled, setAiEnabled] = useState(false);
  const [priorPolicy, setPriorPolicy] = useState("ONLY_NEW");
  const [confirmText, setConfirmText] = useState("");
  const [testMode, setTestMode] = useState<boolean | null>(null);

  // Lead picker (step 2) controls.
  const [leadSearch, setLeadSearch] = useState("");
  const [leadFilter, setLeadFilter] = useState<"all" | "ready" | "used" | "excluded">("all");
  const [leadSort, setLeadSort] = useState<"name" | "business" | "status">("name");

  const { restored, clear, dismissRestored } = useDraftAutosave(
    "draft.campaign.new",
    {
      step,
      name,
      description,
      selected: [...selected],
      templateIds,
      sequenceId,
      preset,
      customPace,
      draftStrategy,
      trackingEnabled,
      priorPolicy,
    }
  );

  function applyRestored() {
    if (!restored) return;
    setStep(restored.step);
    setName(restored.name);
    setDescription(restored.description);
    setSelected(new Set(restored.selected));
    setTemplateIds(restored.templateIds ?? []);
    setSequenceId(restored.sequenceId);
    setPreset(restored.preset);
    if (restored.customPace) setCustomPace(restored.customPace);
    setDraftStrategy(restored.draftStrategy);
    if (typeof restored.trackingEnabled === "boolean") setTrackingEnabled(restored.trackingEnabled);
    setPriorPolicy(restored.priorPolicy);
    dismissRestored();
  }

  useEffect(() => {
    void (async () => {
      const [cRes, tRes] = await Promise.all([fetch("/api/contacts"), fetch("/api/templates")]);
      const cBody = await cRes.json();
      const tBody = await tRes.json();
      const list: WizardContact[] = cBody.contacts ?? [];
      setContacts(list);
      setSelected(
        new Set(
          list
            .filter((c) => ["NEW", "EXISTING_NOT_CONTACTED"].includes(c.classification))
            .map((c) => c.contactId)
        )
      );
      setTemplates((tBody.templates ?? []).filter((t: WizardTemplate) => t.active));
      const sRes = await fetch("/api/sequences");
      const sBody = await sRes.json();
      setSequences(sBody.sequences ?? []);
      const llRes = await fetch("/api/lead-lists");
      if (llRes.ok) setLeadLists((await llRes.json()).lists ?? []);
      const aiRes = await fetch("/api/templates/generate");
      if (aiRes.ok) setAiEnabled(Boolean((await aiRes.json()).enabled));
      const mRes = await fetch("/api/sending-mode");
      if (mRes.ok) setTestMode((await mRes.json()).testMode);
      const bRes = await fetch("/api/deliverability/benchmarks");
      if (bRes.ok) {
        const best = (await bRes.json()).snapshot?.dimensions?.find(
          (d: { dimension: string }) => d.dimension === "dailySendLimit"
        )?.buckets?.[0];
        if (best) {
          setBenchmarkTip(
            `Data from ${best.campaigns} anonymized campaigns shows ${best.bucket}/day gets the best reply rate (${best.avgReplyRate.toFixed(1)}%).`
          );
        }
      }
    })();
  }, []);

  const counts = useMemo(
    () => ({ ...computeListScopedCounts(contacts ?? [], listFilter), selected: selected.size }),
    [contacts, selected, listFilter]
  );

  const effectivePace = preset === "custom" ? customPace : PRESETS[preset].schedule;
  const paceRisk = useMemo(() => assessPaceRisk(effectivePace), [effectivePace]);

  async function loadPreview(tid: string) {
    const template = templates?.find((t) => t.templateId === tid);
    if (!template) return;
    const full = await fetch(`/api/templates/${tid}`).then((r) => r.json());
    const res = await fetch("/api/templates/preview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        subjectTemplate: full.template.subjectTemplate,
        htmlTemplate: full.template.htmlTemplate,
        contactId: [...selected][0] ?? null,
      }),
    });
    if (res.ok) setPreview(await res.json());
  }

  /**
   * Gate an actually risky pace behind an explicit, informative confirmation
   * so no one launches a spam-flagged pace by accident.
   */
  async function confirmAndLaunch() {
    if (paceRisk.risky) {
      const ok = await confirm({
        title: "This pace risks your deliverability",
        body: `${paceRisk.reasons.join(" ")}${benchmarkTip ? ` ${benchmarkTip}` : ""} Sending this fast can get flagged as spam and hurt the sender reputation you've built. Continue at this pace anyway?`,
        danger: true,
        confirmLabel: "Yes, send at this pace",
      });
      if (!ok) return;
    }
    await launch(true, paceRisk.risky);
  }

  async function launch(startNow: boolean, acceptedPaceRisk = false) {
    setBusy(true);
    setError(null);
    try {
      const createBody = await fetchJson<{ campaign: { campaignId: string } }>(
        "/api/campaigns",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name,
            description,
            initialTemplateId: primaryTemplateId,
            templateRotation: templateIds.length > 1 ? templateIds : [],
            sequenceId,
            schedule: preset === "custom" ? customPace : PRESETS[preset].schedule,
            priorContactPolicy: priorPolicy,
            draftStrategy,
            trackingEnabled,
            sourceListId: listFilter || null,
            acceptPaceRisk: acceptedPaceRisk,
          }),
        }
      );
      const campaignId = createBody.campaign.campaignId;

      await fetchJson(`/api/campaigns/${campaignId}/launch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          selections: buildLaunchSelections(contacts ?? [], selected),
          startNow,
          personalize,
          confirmText: confirmText || undefined,
          acceptPaceRisk: acceptedPaceRisk,
        }),
      });

      clear();
      router.push(`/campaigns/${campaignId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setBusy(false);
    }
  }

  function toggleContact(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // Pick a saved lead list as the campaign source: narrows the picker to that
  // list and auto-selects everyone in it who is safe to email.
  function chooseList(listId: string) {
    setListFilter(listId);
    const list = contacts ?? [];
    const inScope = listId ? list.filter((c) => c.listIds.includes(listId)) : list;
    setSelected(
      new Set(inScope.filter((c) => badgeFor(c.classification).selectable).map((c) => c.contactId))
    );
  }

  // Filtered + sorted view of the contacts in the lead picker.
  const visibleContacts = useMemo(() => {
    const list = contacts ?? [];
    const q = leadSearch.trim().toLowerCase();
    const isExcluded = (c: WizardContact) =>
      ["EMAIL_OPT_OUT", "UNSUBSCRIBED", "BOUNCED", "SUPPRESSED", "INVALID"].includes(
        c.classification
      );
    const isUsed = (c: WizardContact) =>
      ["CONTACTED_BEFORE", "REPLIED_BEFORE"].includes(c.classification);

    const filtered = list.filter((c) => {
      if (listFilter && !c.listIds.includes(listFilter)) return false;
      if (q && !(`${c.fullName} ${c.businessName} ${c.email}`.toLowerCase().includes(q)))
        return false;
      if (leadFilter === "ready") return !isExcluded(c) && !isUsed(c);
      if (leadFilter === "used") return isUsed(c);
      if (leadFilter === "excluded") return isExcluded(c);
      return true;
    });

    return [...filtered].sort((a, b) => {
      if (leadSort === "business") return a.businessName.localeCompare(b.businessName);
      if (leadSort === "status") return a.classification.localeCompare(b.classification);
      return (a.fullName || a.email).localeCompare(b.fullName || b.email);
    });
  }, [contacts, leadSearch, leadFilter, leadSort, listFilter]);

  function selectableIds(list: WizardContact[]): string[] {
    return list.filter((c) => badgeFor(c.classification).selectable).map((c) => c.contactId);
  }

  const nextDisabled =
    (step === 0 && name.trim() === "") ||
    (step === 1 && selected.size === 0) ||
    (step === 3 && templateIds.length === 0);

  return (
    <div className="mx-auto max-w-4xl">
      {restored && (
        <RestoreDraftBanner
          what="campaign"
          onRestore={applyRestored}
          onDiscard={() => {
            clear();
            dismissRestored();
          }}
        />
      )}
      <div className="mb-2 flex items-center justify-between text-xs text-muted/70">
        <span className="font-medium text-muted">
          Step {step + 1} of {STEPS.length} · {STEPS[step]}
        </span>
        <span>{Math.round(((step + 1) / STEPS.length) * 100)}%</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
        <div
          className="h-full rounded-full brand-gradient transition-all duration-300"
          style={{ width: `${((step + 1) / STEPS.length) * 100}%` }}
        />
      </div>
      <ol className="mt-3 hidden flex-wrap gap-1.5 text-xs sm:flex" aria-label="Campaign steps">
        {STEPS.map((s, i) => (
          <li key={s}>
            <button
              type="button"
              onClick={() => i <= step && setStep(i)}
              disabled={i > step}
              className={`rounded-full px-3 py-1 transition ${
                i < step
                  ? "bg-green-100 text-green-700 hover:bg-green-200"
                  : i === step
                    ? "bg-primary text-white"
                    : "bg-surface-2 text-muted/70"
              }`}
            >
              {i < step && "✓ "}
              {s}
            </button>
          </li>
        ))}
      </ol>

      <div className="mt-5 card animate-rise p-8">
        {error && <p className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}

        {step === 0 && (
          <>
            <h2 className="text-xl font-semibold">Name your campaign</h2>
            <label className="mt-4 block text-sm font-medium text-foreground">
              Campaign name
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. July new leads: Central region"
                className="mt-1 w-full rounded-xl border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none"
              />
            </label>
            <label className="mt-4 block text-sm font-medium text-foreground">
              Notes (optional)
              <input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="mt-1 w-full rounded-xl border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none"
              />
            </label>
          </>
        )}

        {step === 1 && (
          <>
            <h2 className="text-xl font-semibold">Choose your leads</h2>
            <p className="mt-1 text-sm text-muted">
              Need more leads?{" "}
              <Link href="/leads" className="text-primary hover:underline">
                Import them first
              </Link>
              , then come back.
            </p>
            {contacts === null ? (
              <div className="mt-4">
                <SkeletonList rows={5} />
              </div>
            ) : contacts.length === 0 ? (
              <p className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-700">
                You have no contacts yet: import leads first.
              </p>
            ) : (
              <>
                {leadLists.length > 0 && (
                  <div className="mt-4 rounded-xl border border-border bg-surface-2/60 p-3">
                    <label className="block text-sm font-medium text-foreground">
                      Start from a lead list
                      <HelpTip text="Pick one of your saved lists to use it as the source for this campaign. Everyone in the list who is safe to email gets selected automatically. Choose “All leads” to browse everything." />
                      <select
                        value={listFilter}
                        onChange={(e) => chooseList(e.target.value)}
                        className="mt-1 w-full rounded-xl border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none sm:max-w-md"
                      >
                        <option value="">All leads ({contacts.length})</option>
                        {leadLists.map((l) => (
                          <option key={l.listId} value={l.listId}>
                            {l.name} ({l.count})
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                )}
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <input
                    type="search"
                    value={leadSearch}
                    onChange={(e) => setLeadSearch(e.target.value)}
                    placeholder="Search name, business, or email"
                    aria-label="Search leads"
                    className="w-56 rounded-xl border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none"
                  />
                  <select
                    value={leadFilter}
                    onChange={(e) => setLeadFilter(e.target.value as typeof leadFilter)}
                    aria-label="Filter leads"
                    className="rounded-xl border border-border px-2 py-2 text-sm"
                  >
                    <option value="all">All</option>
                    <option value="ready">Ready</option>
                    <option value="used">Used before</option>
                    <option value="excluded">Excluded</option>
                  </select>
                  <select
                    value={leadSort}
                    onChange={(e) => setLeadSort(e.target.value as typeof leadSort)}
                    aria-label="Sort leads"
                    className="rounded-xl border border-border px-2 py-2 text-sm"
                  >
                    <option value="name">Sort: Name</option>
                    <option value="business">Sort: Business</option>
                    <option value="status">Sort: Status</option>
                  </select>
                  <div className="ml-auto flex gap-2 text-sm">
                    <button
                      onClick={() =>
                        setSelected((prev) => new Set([...prev, ...selectableIds(visibleContacts)]))
                      }
                      className="rounded-lg px-3 py-1.5 font-medium text-primary hover:bg-primary-soft"
                    >
                      Select all shown
                    </button>
                    <button
                      onClick={() => {
                        const shown = new Set(visibleContacts.map((c) => c.contactId));
                        setSelected((prev) => new Set([...prev].filter((id) => !shown.has(id))));
                      }}
                      className="rounded-lg px-3 py-1.5 font-medium text-muted hover:bg-surface-2"
                    >
                      Clear shown
                    </button>
                  </div>
                </div>

                <p className="mt-2 text-xs text-muted">
                  Showing {visibleContacts.length} of {contacts.length} · {selected.size} selected
                </p>

                <div className="mt-2 max-h-96 overflow-y-auto rounded-xl border border-border">
                  <table className="w-full text-left text-sm">
                    <tbody>
                      {visibleContacts.map((c) => {
                        const badge = badgeFor(c.classification);
                        return (
                          <tr key={c.contactId} className="border-b border-border last:border-0">
                            <td className="px-3 py-2">
                              <input
                                type="checkbox"
                                aria-label={`Include ${c.fullName || c.email}`}
                                checked={selected.has(c.contactId)}
                                disabled={!badge.selectable}
                                onChange={() => toggleContact(c.contactId)}
                              />
                            </td>
                            <td className="px-3 py-2 font-medium">{c.fullName || "Not available"}</td>
                            <td className="px-3 py-2 text-muted">{c.businessName}</td>
                            <td className="px-3 py-2 text-muted">{c.email}</td>
                            <td className="px-3 py-2">
                              <span className={`rounded-full px-2 py-0.5 text-xs ${badge.className}`}>
                                {badge.label}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </>
        )}

        {step === 2 && (
          <>
            <h2 className="text-xl font-semibold">Review your list</h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-4">
              {[
                ["Selected", counts.selected, "text-primary"],
                ["Ready", counts.ready, "text-green-600"],
                ["Used before", counts.usedBefore, "text-blue-600"],
                ["Excluded for safety", counts.excluded, "text-amber-600"],
              ].map(([label, value, color]) => (
                <div key={label as string} className="rounded-xl border border-border p-4 text-center">
                  <p className={`text-2xl font-semibold ${color}`}>{value}</p>
                  <p className="mt-1 text-xs text-muted">{label}</p>
                </div>
              ))}
            </div>
            <label className="mt-6 block text-sm font-medium text-foreground">
              People you contacted before
              <HelpTip text="If a lead is already in one of your past campaigns, this decides whether to email them again. 'Only new people' is safest and avoids annoying repeat contacts." />
              <select
                value={priorPolicy}
                onChange={(e) => setPriorPolicy(e.target.value)}
                className="mt-1 w-full rounded-xl border border-border px-3 py-2 text-sm"
              >
                <option value="ONLY_NEW">Skip them: only email new people (recommended)</option>
                <option value="EXCLUDE_RECENT">Skip anyone contacted in the last 30 days</option>
                <option value="INCLUDE_AFTER_WARNING">Include the ones I ticked, I understand</option>
              </select>
            </label>
            <p className="mt-3 text-xs text-muted">
              Opted-out, unsubscribed, and bounced people are always excluded: that can&apos;t be
              overridden.
            </p>
          </>
        )}

        {step === 3 && editing && (
          <>
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold">
                {editing.templateId ? "Edit template" : "New template"}
              </h2>
              <button
                onClick={() => setEditing(null)}
                className="text-sm font-medium text-muted hover:text-foreground"
              >
                ← Back to templates
              </button>
            </div>
            <p className="mt-1 text-sm text-muted">
              Write it right here: saving drops you back into this campaign with the template
              picked, no need to leave and come back.
            </p>
            <div className="mt-4">
              <TemplateEditor
                templateId={editing.templateId}
                initial={editing.initial}
                onSaved={handleTemplateSaved}
              />
            </div>
          </>
        )}

        {step === 3 && !editing && (
          <>
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-xl font-semibold">Choose the email</h2>
                <p className="mt-1 text-sm text-muted">
                  Pick one template: or select two or more to <strong>A/B test</strong>. When you pick
                  several, the app rotates them across your recipients and shows which gets more replies.
                </p>
              </div>
              <button
                onClick={() => setEditing({ templateId: null, initial: null })}
                className="btn-secondary shrink-0 px-3 py-2 text-sm"
              >
                + New template
              </button>
            </div>
            {templates === null || editLoading ? (
              <div className="mt-4">
                <SkeletonList rows={3} />
              </div>
            ) : templates.length === 0 ? (
              <p className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-700">
                No templates yet: {" "}
                <button
                  onClick={() => setEditing({ templateId: null, initial: null })}
                  className="font-medium text-primary hover:underline"
                >
                  create one right here
                </button>
                .
              </p>
            ) : (
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {templates.map((t) => {
                  const idx = templateIds.indexOf(t.templateId);
                  const selected = idx >= 0;
                  return (
                    <button
                      key={t.templateId}
                      onClick={() => {
                        toggleTemplate(t.templateId);
                        if (!selected) void loadPreview(t.templateId);
                      }}
                      className={`relative rounded-xl border p-4 text-left transition ${
                        selected ? "border-primary bg-primary-soft" : "border-border hover:border-primary"
                      }`}
                    >
                      {selected && (
                        <span className="absolute right-3 top-3 flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[10px] font-bold text-white">
                          {idx === 0 ? "A" : idx === 1 ? "B" : idx === 2 ? "C" : idx + 1}
                        </span>
                      )}
                      <p className="pr-14 font-medium">{t.name}</p>
                      <p className="mt-1 line-clamp-1 pr-14 text-sm text-muted">{t.subjectTemplate}</p>
                      <span
                        role="button"
                        tabIndex={0}
                        onClick={(e) => {
                          e.stopPropagation();
                          void openEditTemplate(t.templateId);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.stopPropagation();
                            e.preventDefault();
                            void openEditTemplate(t.templateId);
                          }
                        }}
                        aria-label={`Edit ${t.name}`}
                        className="absolute bottom-3 right-3 flex h-7 w-7 items-center justify-center rounded-lg text-muted/70 hover:bg-surface-2 hover:text-primary"
                      >
                        <Icon name="edit" size={15} />
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
            {templateIds.length > 1 && (
              <p className="mt-3 rounded-lg bg-primary-soft p-2 text-xs font-medium text-primary">
                A/B test: {templateIds.length} templates will be rotated evenly across recipients.
              </p>
            )}
            {preview && (
              <div className="mt-5 rounded-xl border border-border p-4">
                <p className="text-sm">
                  <span className="text-muted">Preview subject:</span>{" "}
                  <span className="font-medium">{preview.subject}</span>
                </p>
                <iframe
                  title="Campaign email preview"
                  sandbox=""
                  className="mt-3 h-64 w-full rounded-lg border-0 bg-surface-2"
                  srcDoc={`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><base target="_blank"><style>body{margin:0;padding:12px;font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#1d1d1f;font-size:14px;line-height:1.5;word-break:break-word}img{max-width:100%}</style></head><body>${preview.html}</body></html>`}
                />
              </div>
            )}
          </>
        )}

        {step === 4 && (
          <>
            <h2 className="text-xl font-semibold">Pace and schedule</h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {(Object.entries(PRESETS) as Array<[keyof typeof PRESETS, (typeof PRESETS)[keyof typeof PRESETS]]>).map(
                ([key, p]) => (
                  <button
                    key={key}
                    onClick={() => setPreset(key)}
                    className={`rounded-xl border p-4 text-left transition ${
                      preset === key ? "border-primary bg-primary-soft" : "border-border hover:border-primary"
                    }`}
                  >
                    <p className="font-medium">{p.label}</p>
                    <p className="mt-1 text-xs text-muted">{p.detail}</p>
                  </button>
                )
              )}
              <button
                onClick={() => setPreset("custom")}
                className={`rounded-xl border p-4 text-left transition ${
                  preset === "custom" ? "border-primary bg-primary-soft" : "border-border hover:border-primary"
                }`}
              >
                <p className="font-medium">Custom</p>
                <p className="mt-1 text-xs text-muted">Set the numbers yourself</p>
              </button>
            </div>

            {preset === "custom" && (
              <div className="mt-4 rounded-xl border border-border bg-surface-2/60 p-4">
                <p className="text-sm font-semibold text-foreground">Your sending rules</p>
                <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                  {([
                    ["dailySendLimit", "Emails per day", "Cap for one day", 1, 2000],
                    ["emailsPerBatch", "Per batch", "Emails per burst", 1, 50],
                    ["minDelaySeconds", "Min gap (sec)", "Between emails", 1, 600],
                    ["maxDelaySeconds", "Max gap (sec)", "Between emails", 1, 600],
                    ["interBatchDelayMinutes", "Batch gap (min)", "Between batches", 0, 240],
                  ] as Array<[keyof typeof customPace, string, string, number, number]>).map(
                    ([k, label, hint, min, max]) => (
                      <label key={k} className="block text-xs font-medium text-muted">
                        {label}
                        <input
                          type="number"
                          min={min}
                          max={max}
                          value={customPace[k]}
                          onChange={(e) =>
                            setCustomPace((c) => ({ ...c, [k]: Math.max(0, Number(e.target.value) || 0) }))
                          }
                          className="mt-1 w-full rounded-lg border border-border px-2.5 py-1.5 text-sm focus:border-primary focus:outline-none"
                        />
                        <span className="mt-0.5 block text-[11px] font-normal text-muted/70">{hint}</span>
                      </label>
                    )
                  )}
                </div>
                <p className="mt-2 text-xs text-muted">
                  Higher numbers send faster but can hurt deliverability: Gmail limits how much you
                  can send per day. You can change all of this later on the campaign page.
                </p>
              </div>
            )}

            {paceRisk.risky && (
              <div className="alert-warning mt-4 rounded-xl border p-4">
                <p className="text-sm font-semibold text-warning">⚠️ This pace risks your deliverability</p>
                <ul className="mt-1.5 list-disc space-y-1 pl-5 text-sm text-warning">
                  {paceRisk.reasons.map((r) => (
                    <li key={r}>{r}</li>
                  ))}
                  {benchmarkTip && <li>{benchmarkTip}</li>}
                </ul>
                <p className="mt-1.5 text-xs text-amber-700">
                  You&apos;ll be asked to confirm this again before launch.
                </p>
              </div>
            )}

            <p className="mt-3 text-xs text-muted">
              Sending happens 9:00 AM–8:00 PM on weekdays in your timezone (change defaults in
              Settings). Unsent emails automatically roll to the next allowed time.
            </p>
            <div className="mt-6 border-t border-border pt-5">
              <label className="block text-sm font-medium text-foreground">
                Automatic follow-ups
                <select
                  value={sequenceId ?? ""}
                  onChange={(e) => setSequenceId(e.target.value || null)}
                  className="mt-1 w-full rounded-xl border border-border px-3 py-2 text-sm"
                >
                  <option value="">No follow-ups</option>
                  {sequences.map((s) => (
                    <option key={s.sequenceId} value={s.sequenceId}>
                      {s.name} ({s.steps.length} follow-up{s.steps.length === 1 ? "" : "s"})
                    </option>
                  ))}
                </select>
              </label>
              <p className="mt-1 text-xs text-muted">
                Follow-ups stop automatically when someone replies.{" "}
                <a href="/sequences/new" target="_blank" className="text-primary hover:underline">
                  Build a sequence
                </a>
              </p>
            </div>

            <div className="mt-5">
              <label className="flex items-center gap-2 text-sm text-foreground">
                <input
                  type="checkbox"
                  checked={draftStrategy === "DRAFT_ONLY"}
                  onChange={(e) => setDraftStrategy(e.target.checked ? "DRAFT_ONLY" : "SEND")}
                />
                Create Gmail drafts only: I&apos;ll review and send them myself
                <HelpTip text="Instead of sending automatically, the app prepares each email as a draft in your Gmail. You open and send them yourself. Good for extra control on important lists." />
              </label>
            </div>

            <div className="alert-warning mt-3 rounded-xl border p-3">
              <label className="flex items-start gap-2 text-sm text-foreground">
                <input
                  type="checkbox"
                  checked={trackingEnabled}
                  onChange={(e) => setTrackingEnabled(e.target.checked)}
                  className="mt-0.5"
                />
                <span>
                  Track opens and clicks <span className="font-normal text-amber-700">(optional)</span>
                  <span className="mt-0.5 block text-xs text-muted">
                    Adds an invisible open pixel and rewrites links to measure clicks. Off by default.{" "}
                    <strong className="font-medium text-amber-700">Tracking pixels and rewritten links are a
                    known deliverability risk</strong> and can lower inbox placement. Leave this off unless
                    you specifically need open/click numbers for this campaign.
                  </span>
                </span>
              </label>
            </div>

            {aiEnabled && (
              <div className="mt-3 rounded-xl border border-primary/20 bg-primary-soft/40 p-3">
                <label className="flex items-start gap-2 text-sm text-foreground">
                  <input
                    type="checkbox"
                    checked={personalize}
                    onChange={(e) => setPersonalize(e.target.checked)}
                    className="mt-0.5"
                  />
                  <span>
                    ✨ Add an AI-personalized opening line to each email
                    <span className="mt-0.5 block text-xs text-muted">
                      Writes one tailored sentence per lead based on their business, added to the top
                      of the first email. Best for focused lists: capped at the first 150 recipients
                      to keep it fast. Add <code className="rounded bg-surface px-1">{"{{ai_opener}}"}</code>{" "}
                      in your template to place it yourself; otherwise it goes up top.
                    </span>
                  </span>
                </label>
              </div>
            )}
          </>
        )}

        {step === 5 && (
          <>
            <h2 className="text-xl font-semibold">Safety check</h2>
            <ul className="mt-4 space-y-2 text-sm text-foreground">
              <li>✅ {counts.selected} will receive this email</li>
              {counts.excluded > 0 && (
                <li>
                  ✅ {counts.excluded} skipped for safety
                  {counts.excludedByReason.length > 0 && (
                    <span className="text-muted">
                      {" "}
                      ({counts.excludedByReason.map((r) => `${r.count} ${r.label.toLowerCase()}`).join(", ")})
                    </span>
                  )}
                </li>
              )}
              <li>
                {paceRisk.risky ? "⚠️" : "✅"} Pace:{" "}
                {preset === "custom"
                  ? `${customPace.emailsPerBatch} per batch · ${customPace.minDelaySeconds}–${customPace.maxDelaySeconds}s apart · ${customPace.interBatchDelayMinutes} min between batches · ${customPace.dailySendLimit}/day`
                  : PRESETS[preset].detail}
                {paceRisk.risky && <span className="ml-1 font-medium text-amber-700">: risky, see above</span>}
              </li>
              <li>✅ Mode: {draftStrategy === "SEND" ? "Send automatically" : "Create drafts only"}</li>
              <li>
                {trackingEnabled ? "⚠️" : "✅"} Open/click tracking:{" "}
                {trackingEnabled ? "On (adds some deliverability risk)" : "Off"}
              </li>
            </ul>

            <div className="mt-4 rounded-xl bg-surface-2 p-4 text-sm text-muted">
              <p className="font-medium text-foreground">How replies are handled automatically</p>
              <ul className="mt-1.5 list-disc space-y-1 pl-5">
                <li>Any reply stops follow-ups for that person: you take the conversation over in Gmail.</li>
                <li>
                  Someone is only marked <strong>unsubscribed</strong> (and added to your
                  do-not-email list) when they explicitly ask: e.g. “unsubscribe” or “remove me
                  from your list”. Questions and normal replies never trigger it.
                </li>
                <li>If one is ever flagged wrong, the campaign page has an Undo next to that person.</li>
              </ul>
            </div>

            {preview && (
              <div className="mt-5 rounded-xl border border-border p-4">
                <SpamCheck subject={preview.subject} html={preview.html} />
              </div>
            )}
            {counts.selected > 100 && (
              <label className="mt-4 block text-sm font-medium text-foreground">
                This is a large campaign: type <strong>SEND</strong> to confirm
                <input
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value)}
                  className="mt-1 w-40 rounded-xl border border-border px-3 py-2 text-sm"
                />
              </label>
            )}
          </>
        )}

        {step === 6 && (
          <>
            <h2 className="text-xl font-semibold">Ready to go</h2>
            <p className="mt-2 text-sm text-muted">
              {counts.selected} emails will be {draftStrategy === "SEND" ? "sent" : "drafted"}{" "}
              at the pace you chose.
            </p>
            {testMode === true && (
              <p className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-warning">
                🛡️ You&apos;re in test mode: these emails go only to your test address, not real
                recipients. Perfect for a practice run.
              </p>
            )}
            {testMode === false && (
              <p className="mt-3 rounded-lg bg-green-50 p-3 text-sm text-success">
                ● Live mode: these emails will be sent to real recipients.
              </p>
            )}
            <div className="mt-5 flex flex-wrap gap-3">
              <button
                onClick={() => void confirmAndLaunch()}
                disabled={busy}
                className="btn-primary px-5 py-2.5"
              >
                {busy ? "Starting…" : "Start now"}
              </button>
              <button
                onClick={() => router.push("/campaigns")}
                disabled={busy}
                className="rounded-xl border border-border px-5 py-2.5 font-medium text-foreground hover:bg-surface-2 disabled:opacity-50"
              >
                Save for later
              </button>
            </div>
          </>
        )}

        {step < 6 && (
          <div className="mt-8 flex justify-between border-t border-border pt-4">
            <button
              onClick={() => setStep((s) => Math.max(0, s - 1))}
              disabled={step === 0}
              className="rounded-xl px-4 py-2 text-sm text-muted hover:bg-surface-2 disabled:opacity-0"
            >
              ← Back
            </button>
            <button
              onClick={() => setStep((s) => s + 1)}
              disabled={nextDisabled}
              className="btn-primary px-6 py-2 text-sm disabled:opacity-50"
            >
              Continue →
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
