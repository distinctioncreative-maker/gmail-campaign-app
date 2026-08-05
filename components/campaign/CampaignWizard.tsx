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
import {
  assessPaceRisk,
  PACE_PRESETS,
  type PacePreset,
  type PaceInput,
} from "@/lib/campaigns/paceSafety";
import { buildLaunchSelections, computeListScopedCounts } from "@/lib/campaigns/wizardSelections";
import { TagChips } from "@/components/leads/TagChips";

const STEPS = ["Name", "Leads", "Review", "Email", "Schedule", "Safety check", "Launch"];

interface WizardContact {
  contactId: string;
  fullName: string;
  businessName: string;
  email: string;
  classification: string;
  listIds: string[];
  tags: string[];
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

/** Sourced from lib/campaigns/paceSafety.ts so the wizard, the pace editor,
 * and the server launch check all agree on what a safe pace is. The local
 * copy this replaces described batch mechanics and topped out at a 200/day
 * "Faster" option, which is roughly 250 emails an hour. */
const PRESETS = Object.fromEntries(
  PACE_PRESETS.map((preset) => [
    preset.id,
    { label: preset.label, detail: preset.description, schedule: preset.schedule },
  ])
) as Record<PacePreset["id"], { label: string; detail: string; schedule: PaceInput }>;

type PresetKey = PacePreset["id"] | "custom";

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

  const [preset, setPreset] = useState<PresetKey>("steady");
  const [customPace, setCustomPace] = useState<PaceInput>({
    ...PACE_PRESETS[1].schedule,
  });
  const [draftStrategy, setDraftStrategy] = useState<"SEND" | "DRAFT_ONLY">("SEND");
  const [trackingEnabled, setTrackingEnabled] = useState(true);
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
  const [tagFilter, setTagFilter] = useState("");

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
      listFilter,
      tagFilter,
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
    setListFilter(restored.listFilter ?? "");
    setTagFilter(restored.tagFilter ?? "");
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
      // ?launched=1 turns the landing into the launch moment; the banner
      // strips the flag itself so a refresh does not re-celebrate.
      router.push(`/campaigns/${campaignId}?launched=1`);
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

  const availableTags = useMemo(
    () =>
      [...new Set((contacts ?? []).flatMap((contact) => contact.tags ?? []))].sort((a, b) =>
        a.localeCompare(b, undefined, { sensitivity: "base" })
      ),
    [contacts]
  );

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
      if (tagFilter && !c.tags.some((tag) => tag.toLocaleLowerCase() === tagFilter.toLocaleLowerCase()))
        return false;
      if (q && !(`${c.fullName} ${c.businessName} ${c.email} ${c.tags.join(" ")}`.toLowerCase().includes(q)))
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
  }, [contacts, leadSearch, leadFilter, leadSort, listFilter, tagFilter]);

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
      <div className="mb-2 flex items-center justify-between text-xs text-muted">
        <span className="font-medium text-muted">
          Step {step + 1} of {STEPS.length} · {STEPS[step]}
        </span>
        <span>{Math.round(((step + 1) / STEPS.length) * 100)}%</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
        <div
          className="h-full rounded-full bg-success transition-all duration-300"
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
                  ? "bg-success-soft text-success hover:brightness-95"
                  : i === step
                    ? "bg-primary text-primary-contrast"
                    : "bg-surface-2 text-muted"
              }`}
            >
              {i < step && "✓ "}
              {s}
            </button>
          </li>
        ))}
      </ol>

      <div className="mt-5 card animate-rise p-8">
        {error && <p className="alert-danger mb-4 rounded-lg border p-3 text-sm text-danger">{error}</p>}

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
              <Link href="/leads" className="text-foreground underline decoration-border underline-offset-4 hover:decoration-foreground">
                Import them first
              </Link>
              , then come back.
            </p>
            {contacts === null ? (
              <div className="mt-4">
                <SkeletonList rows={5} />
              </div>
            ) : contacts.length === 0 ? (
              <p className="alert-warning mt-4 rounded-lg border p-3 text-sm text-warning">
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
                        className="mt-1 min-h-11 w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm focus:border-primary focus:outline-none sm:max-w-md"
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
                <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                  <input
                    type="search"
                    value={leadSearch}
                    onChange={(e) => setLeadSearch(e.target.value)}
                    placeholder="Search name, business, or email"
                    aria-label="Search leads"
                    className="min-h-11 w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm focus:border-primary focus:outline-none sm:col-span-2 lg:col-span-1"
                  />
                  <select
                    value={leadFilter}
                    onChange={(e) => setLeadFilter(e.target.value as typeof leadFilter)}
                    aria-label="Filter leads"
                    className="min-h-11 w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
                  >
                    <option value="all">All</option>
                    <option value="ready">Ready</option>
                    <option value="used">Used before</option>
                    <option value="excluded">Excluded</option>
                  </select>
                  <select
                    value={tagFilter}
                    onChange={(event) => setTagFilter(event.target.value)}
                    aria-label="Filter leads by tag"
                    className="min-h-11 w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
                  >
                    <option value="">Any tag</option>
                    {availableTags.map((tag) => <option key={tag} value={tag}>{tag}</option>)}
                  </select>
                  <select
                    value={leadSort}
                    onChange={(e) => setLeadSort(e.target.value as typeof leadSort)}
                    aria-label="Sort leads"
                    className="min-h-11 w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
                  >
                    <option value="name">Sort: Name</option>
                    <option value="business">Sort: Business</option>
                    <option value="status">Sort: Status</option>
                  </select>
                  <div className="flex flex-wrap gap-2 text-sm sm:col-span-2 lg:col-span-4 lg:justify-end">
                    <button
                      onClick={() =>
                        setSelected((prev) => new Set([...prev, ...selectableIds(visibleContacts)]))
                      }
                      className="min-h-11 rounded-lg px-3 font-medium text-foreground hover:bg-surface-2"
                    >
                      Select all shown
                    </button>
                    <button
                      onClick={() => {
                        const shown = new Set(visibleContacts.map((c) => c.contactId));
                        setSelected((prev) => new Set([...prev].filter((id) => !shown.has(id))));
                      }}
                      className="min-h-11 rounded-lg px-3 font-medium text-muted hover:bg-surface-2"
                    >
                      Clear shown
                    </button>
                  </div>
                </div>

                <p className="mt-2 text-xs text-muted">
                  Showing {visibleContacts.length} of {contacts.length} · {selected.size} selected
                </p>

                <div className="mt-2 max-h-96 overflow-auto rounded-xl border border-border">
                  <table className="w-full min-w-[48rem] text-left text-sm">
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
                            <td className="min-w-40 px-3 py-2"><TagChips tags={c.tags} limit={2} /></td>
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
                ["Selected", counts.selected, "text-foreground"],
                ["Ready", counts.ready, "text-success"],
                ["Used before", counts.usedBefore, "text-info"],
                ["Excluded for safety", counts.excluded, "text-warning"],
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
              <p className="alert-warning mt-4 rounded-lg border p-3 text-sm text-warning">
                No templates yet: {" "}
                <button
                  onClick={() => setEditing({ templateId: null, initial: null })}
                  className="font-medium text-foreground underline decoration-border underline-offset-4 hover:decoration-foreground"
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
                        selected ? "border-primary bg-surface-2" : "border-border hover:border-primary"
                      }`}
                    >
                      {selected && (
                        <span className="absolute right-3 top-3 flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[10px] font-bold text-primary-contrast">
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
                        className="absolute bottom-3 right-3 flex h-7 w-7 items-center justify-center rounded-lg text-muted hover:bg-surface-2 hover:text-foreground"
                      >
                        <Icon name="edit" size={15} />
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
            {templateIds.length > 1 && (
              <p className="mt-3 rounded-lg bg-surface-2 p-2 text-xs font-medium text-foreground">
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
                      preset === key ? "border-primary bg-surface-2" : "border-border hover:border-primary"
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
                  preset === "custom" ? "border-primary bg-surface-2" : "border-border hover:border-primary"
                }`}
              >
                <p className="font-medium">Custom</p>
                <p className="mt-1 text-xs text-muted">Set the numbers yourself</p>
              </button>
            </div>

            {preset === "custom" && (
              <div className="mt-4 rounded-xl border border-border bg-surface-2/60 p-4">
                <p className="text-sm font-semibold text-foreground">Your sending rules</p>

                {/* Pacing shape first, because it decides which of the fields
                    below actually do anything. */}
                <div className="mt-3 flex flex-wrap gap-2">
                  {([
                    ["SPREAD", "Spread evenly", "Fills the whole window"],
                    ["BURST", "Send in bursts", "Batches, then quiet"],
                  ] as Array<["SPREAD" | "BURST", string, string]>).map(([mode, label, hint]) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => setCustomPace((c) => ({ ...c, pacingMode: mode }))}
                      aria-pressed={(customPace.pacingMode ?? "SPREAD") === mode}
                      className={`rounded-lg border px-3 py-2 text-left text-xs transition ${
                        (customPace.pacingMode ?? "SPREAD") === mode
                          ? "border-primary bg-primary-soft text-primary"
                          : "border-border text-muted hover:bg-surface-2"
                      }`}
                    >
                      <span className="block font-semibold">{label}</span>
                      <span className="block font-normal">{hint}</span>
                    </button>
                  ))}
                </div>

                <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {([
                    ["sendWindowStart", "Window opens", "Local time"],
                    ["sendWindowEnd", "Window closes", "Local time"],
                  ] as Array<[keyof PaceInput, string, string]>).map(([k, label, hint]) => (
                    <label key={k} className="block text-xs font-medium text-muted">
                      {label}
                      <input
                        type="time"
                        value={String(customPace[k])}
                        onChange={(e) =>
                          setCustomPace((c) => ({ ...c, [k]: e.target.value }))
                        }
                        className="mt-1 w-full rounded-lg border border-border px-2.5 py-1.5 text-sm focus:border-primary focus:outline-none"
                      />
                      <span className="mt-0.5 block text-[11px] font-normal text-muted">{hint}</span>
                    </label>
                  ))}
                </div>

                <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                  {([
                    ["dailySendLimit", "Emails per day", "Cap for one day", 1, 2000],
                    ["emailsPerBatch", "Per batch", "Burst mode only", 1, 50],
                    ["minDelaySeconds", "Min gap (sec)", "Burst mode only", 1, 600],
                    ["maxDelaySeconds", "Max gap (sec)", "Burst mode only", 1, 600],
                    ["interBatchDelayMinutes", "Batch gap (min)", "Burst mode only", 0, 240],
                  ] as Array<[keyof PaceInput, string, string, number, number]>).map(
                    ([k, label, hint, min, max]) => (
                      <label key={k} className="block text-xs font-medium text-muted">
                        {label}
                        <input
                          type="number"
                          min={min}
                          max={max}
                          value={Number(customPace[k])}
                          disabled={k !== "dailySendLimit" && (customPace.pacingMode ?? "SPREAD") === "SPREAD"}
                          onChange={(e) =>
                            setCustomPace((c) => ({ ...c, [k]: Math.max(0, Number(e.target.value) || 0) }))
                          }
                          className="mt-1 w-full rounded-lg border border-border px-2.5 py-1.5 text-sm focus:border-primary focus:outline-none"
                        />
                        <span className="mt-0.5 block text-[11px] font-normal text-muted">{hint}</span>
                      </label>
                    )
                  )}
                </div>
                <p className="mt-2 text-xs text-muted">
                  Spread pacing divides the window by your daily limit, so the batch fields above
                  only apply in burst mode. This works out to about{" "}
                  <strong className="text-foreground">
                    {paceRisk.sendsPerHour < 1
                      ? "less than one email an hour"
                      : `${Math.round(paceRisk.sendsPerHour)} emails an hour`}
                  </strong>{" "}
                  while the window is open. You can change all of this later on the campaign page.
                </p>
              </div>
            )}

            {paceRisk.risky && (
              <div className="alert-warning mt-4 rounded-xl border p-4">
                <p className="flex items-center gap-2 text-sm font-semibold text-warning"><Icon name="alert" size={16} aria-hidden /> This pace risks your deliverability</p>
                <ul className="mt-1.5 list-disc space-y-1 pl-5 text-sm text-warning">
                  {paceRisk.reasons.map((r) => (
                    <li key={r}>{r}</li>
                  ))}
                  {benchmarkTip && <li>{benchmarkTip}</li>}
                </ul>
                <p className="mt-1.5 text-xs text-warning">
                  You&apos;ll be asked to confirm this again before launch.
                </p>
              </div>
            )}

            <p className="mt-3 text-xs text-muted">
              Sending happens 9:00 AM to 8:00 PM on weekdays in your timezone (change defaults in
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
                <a href="/sequences/new" target="_blank" className="text-foreground underline decoration-border underline-offset-4 hover:decoration-foreground">
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
                  Track opens and clicks <span className="font-normal text-warning">(on by default)</span>
                  <span className="mt-0.5 block text-xs text-muted">
                    Adds an open pixel and signed link redirects so this campaign can report engagement.{" "}
                    <strong className="font-medium text-warning">Tracking pixels and rewritten links are a
                    deliverability and privacy tradeoff</strong>. Open detection can include privacy
                    preloading. Turn tracking off for sensitive campaigns or when replies are the only
                    signal you need.
                  </span>
                </span>
              </label>
            </div>

            {aiEnabled && (
              <div className="mt-3 rounded-xl border border-info/20 bg-info-soft/55 p-3">
                <label className="flex items-start gap-2 text-sm text-foreground">
                  <input
                    type="checkbox"
                    checked={personalize}
                    onChange={(e) => setPersonalize(e.target.checked)}
                    className="mt-0.5"
                  />
                  <span>
                    <span className="inline-flex items-center gap-1.5"><Icon name="sparkles" size={15} className="text-info" aria-hidden /> Add an AI-personalized opening line to each email</span>
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
              <li className="flex items-start gap-2"><Icon name="check" size={17} className="mt-0.5 shrink-0 text-success" aria-hidden /><span>{counts.selected} will receive this email</span></li>
              {counts.excluded > 0 && (
                <li className="flex items-start gap-2">
                  <Icon name="shield" size={17} className="mt-0.5 shrink-0 text-success" aria-hidden />
                  <span>{counts.excluded} skipped for safety
                  {counts.excludedByReason.length > 0 && (
                    <span className="text-muted">
                      {" "}
                      ({counts.excludedByReason.map((r) => `${r.count} ${r.label.toLowerCase()}`).join(", ")})
                    </span>
                  )}
                  </span>
                </li>
              )}
              <li className="flex items-start gap-2">
                <Icon name={paceRisk.risky ? "alert" : "check"} size={17} className={`mt-0.5 shrink-0 ${paceRisk.risky ? "text-warning" : "text-success"}`} aria-hidden />
                <span>Pace:{" "}
                {preset === "custom"
                  ? `${customPace.dailySendLimit}/day · ${customPace.sendWindowStart} to ${customPace.sendWindowEnd} · about ${Math.round(paceRisk.sendsPerHour)} an hour`
                  : PRESETS[preset].detail}
                {paceRisk.risky && <span className="ml-1 font-medium text-warning">: risky, see above</span>}
                </span>
              </li>
              <li className="flex items-start gap-2"><Icon name="check" size={17} className="mt-0.5 shrink-0 text-success" aria-hidden /><span>Mode: {draftStrategy === "SEND" ? "Send automatically" : "Create drafts only"}</span></li>
              <li className="flex items-start gap-2">
                <Icon name={trackingEnabled ? "alert" : "check"} size={17} className={`mt-0.5 shrink-0 ${trackingEnabled ? "text-warning" : "text-success"}`} aria-hidden />
                <span>Open/click tracking:{" "}
                {trackingEnabled ? "On (adds some deliverability risk)" : "Off"}
                </span>
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
              <div className="alert-warning mt-3 flex items-start gap-2 rounded-lg border p-3 text-sm text-warning">
                <Icon name="shield" size={17} className="mt-0.5 shrink-0" aria-hidden />
                <p>You&apos;re in test mode: these emails go only to your test address, not real
                recipients. Perfect for a practice run.</p>
              </div>
            )}
            {testMode === false && (
              <p className="alert-success mt-3 rounded-lg border p-3 text-sm text-success">
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
