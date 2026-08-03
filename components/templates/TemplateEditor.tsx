"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { STARTER_LAYOUTS } from "./starterLayouts";
import { useDraftAutosave } from "@/lib/hooks/useDraftAutosave";
import { RestoreDraftBanner } from "@/components/RestoreDraftBanner";
import { SpamCheck } from "@/components/spam/SpamCheck";
import { AiEmailWriter } from "./AiEmailWriter";
import { AiEmailTools } from "./AiEmailTools";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { sanitizeEmailHtml } from "@/lib/sanitize/html";
import {
  appendMissingCommercialFooter,
  missingCommercialEmailPlaceholders,
} from "@/lib/campaigns/compliance";

const PLACEHOLDER_MENU: Array<{ token: string; label: string }> = [
  { token: "{{first_name}}", label: "First name" },
  { token: "{{last_name}}", label: "Last name" },
  { token: "{{full_name}}", label: "Full name" },
  { token: "{{business_name}}", label: "Business name" },
  { token: "{{email}}", label: "Lead email" },
  { token: "{{phone}}", label: "Lead phone" },
  { token: "{{region}}", label: "Region" },
  { token: "{{requested_amount}}", label: "Requested amount" },
  { token: "{{lead_source}}", label: "Lead source" },
  { token: "{{sender_name}}", label: "Your name" },
  { token: "{{sender_title}}", label: "Your title" },
  { token: "{{sender_phone}}", label: "Your phone" },
  { token: "{{sender_email}}", label: "Your email" },
  { token: "{{company_name}}", label: "Company name" },
  { token: "{{company_website}}", label: "Company website" },
  { token: "{{physical_address}}", label: "Company address" },
  { token: "{{unsubscribe_text}}", label: "Unsubscribe text" },
  { token: "{{ai_opener}}", label: "AI opener (if enabled)" },
  { token: "{{signature}}", label: "My signature" },
];

type Mode = "visual" | "starter" | "html" | "gmail";

interface DraftSummary {
  draftId: string;
  subject: string;
  snippet: string;
}

export interface SavedTemplate {
  templateId: string;
  name: string;
  subjectTemplate: string;
  htmlTemplate: string;
  type: string;
}

export function TemplateEditor({
  templateId,
  initial,
  onSaved,
}: {
  templateId: string | null;
  initial: { name: string; subjectTemplate: string; htmlTemplate: string; type: string } | null;
  /**
   * When provided, a successful save calls this instead of redirecting to
   * /templates: lets a caller (e.g. the campaign wizard) embed the editor
   * inline and stay put on save rather than navigating the user away.
   */
  onSaved?: (template: SavedTemplate) => void;
}) {
  const router = useRouter();
  const editorRef = useRef<HTMLDivElement>(null);
  const lastVisualInputRef = useRef<string | null>(null);
  const subjectInputRef = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<Mode>(
    initial?.type === "PASTED_HTML" ? "html" : "visual"
  );
  const [name, setName] = useState(initial?.name ?? "");
  const [subject, setSubject] = useState(initial?.subjectTemplate ?? "");
  const [html, setHtml] = useState(initial?.htmlTemplate ?? "<p>Hi {{first_name}},</p><p></p>");
  const [preview, setPreview] = useState<{ subject: string; html: string; unresolved: string[] } | null>(null);
  const [mobilePreview, setMobilePreview] = useState(false);
  const [rightTab, setRightTab] = useState<"preview" | "spam">("preview");
  const [drafts, setDrafts] = useState<DraftSummary[] | null>(null);
  const [draftSearch, setDraftSearch] = useState("");
  const [busy, setBusy] = useState(false);
  // Tracks which of Save/Preview/Send-test is in flight, so only that one
  // button shows a spinner instead of the whole toolbar going ambiguous.
  const [pendingAction, setPendingAction] = useState<"save" | "preview" | "test" | null>(null);
  const [justSucceeded, setJustSucceeded] = useState<"preview" | "test" | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cssWarnings, setCssWarnings] = useState<string[]>([]);
  const [autoComplianceFooter, setAutoComplianceFooter] = useState(true);

  const { restored, clear, dismissRestored } = useDraftAutosave(
    `draft.template.${templateId ?? "new"}`,
    { name, subject, html, mode }
  );

  // Keep the visual editor's DOM in sync when html changes from outside it.
  useEffect(() => {
    if (mode === "visual" && editorRef.current) {
      // A contentEditable owns its selection while the user is typing. Do not
      // rewrite innerHTML for state that came from this same editor, because a
      // DOM replacement moves the caret to the beginning. External changes
      // such as AI output, draft restore, and mode switches still sync here.
      if (lastVisualInputRef.current === html) {
        lastVisualInputRef.current = null;
        return;
      }
      const safeHtml = sanitizeEmailHtml(html);
      if (editorRef.current.innerHTML !== safeHtml) {
        editorRef.current.innerHTML = safeHtml;
      }
    }
  }, [mode, html]);

  function syncFromEditor() {
    if (!editorRef.current) return;
    const nextHtml = editorRef.current.innerHTML;
    lastVisualInputRef.current = nextHtml;
    setHtml(nextHtml);
  }

  function preparedCommercialHtml(): string {
    const safeHtml = sanitizeEmailHtml(html);
    if (autoComplianceFooter) {
      return appendMissingCommercialFooter(safeHtml);
    }
    const missing = missingCommercialEmailPlaceholders(safeHtml);
    if (missing.length > 0) {
      throw new Error(
        `Add ${missing.map((field) => `{{${field}}}`).join(" and ")} before continuing. Commercial outreach must include a valid postal address and a clear opt-out.`
      );
    }
    return safeHtml;
  }

  function exec(command: string, value?: string) {
    editorRef.current?.focus();
    document.execCommand(command, false, value);
    syncFromEditor();
  }

  function insertHtmlAtCursor(snippet: string) {
    editorRef.current?.focus();
    document.execCommand("insertHTML", false, sanitizeEmailHtml(snippet));
    syncFromEditor();
  }

  function safeWebUrl(value: string): string | null {
    try {
      const url = new URL(value);
      return ["http:", "https:"].includes(url.protocol) ? url.toString() : null;
    } catch {
      return null;
    }
  }

  function insertPlaceholder(token: string) {
    if (mode === "visual") insertHtmlAtCursor(token);
    else setHtml((h) => h + token);
  }

  /** Insert a {{placeholder}} into the subject line at the cursor, same as
   *  the body editor's "Insert placeholder" menu: subjects support the
   *  exact same tokens end to end (render + launch validation both cover
   *  subjectTemplate), this was previously the only field without a menu. */
  function insertSubjectPlaceholder(token: string) {
    const el = subjectInputRef.current;
    const start = el?.selectionStart ?? subject.length;
    const end = el?.selectionEnd ?? subject.length;
    const next = subject.slice(0, start) + token + subject.slice(end);
    setSubject(next);
    requestAnimationFrame(() => {
      el?.focus();
      const caret = start + token.length;
      el?.setSelectionRange(caret, caret);
    });
  }

  async function loadDrafts(q = "") {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/gmail/drafts?q=${encodeURIComponent(q)}`);
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Could not load your Gmail drafts.");
      setDrafts(body.drafts);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load your Gmail drafts.");
    } finally {
      setBusy(false);
    }
  }

  async function importDraft(draftId: string) {
    setBusy(true);
    try {
      const res = await fetch("/api/gmail/drafts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ draftId }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Could not import that draft.");
      setSubject(body.draft.subject);
      setHtml(sanitizeEmailHtml(body.draft.htmlBody));
      if (!name) setName(body.draft.subject);
      setMode("visual");
      setNotice(
        "Draft imported: you can now personalize it with placeholders. Your signature " +
          "is already part of this draft, so don’t add {{signature}}; we won’t append one."
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not import that draft.");
    } finally {
      setBusy(false);
    }
  }

  async function refreshPreview() {
    setBusy(true);
    setPendingAction("preview");
    setError(null);
    try {
      const res = await fetch("/api/templates/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subjectTemplate: subject || "(no subject)",
          htmlTemplate: preparedCommercialHtml(),
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Preview failed.");
      setPreview(body);
      setJustSucceeded("preview");
      setTimeout(() => setJustSucceeded((cur) => (cur === "preview" ? null : cur)), 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Preview failed.");
    } finally {
      setBusy(false);
      setPendingAction(null);
    }
  }

  async function sendTest() {
    setBusy(true);
    setPendingAction("test");
    setError(null);
    try {
      const res = await fetch("/api/templates/test-send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subjectTemplate: subject,
          htmlTemplate: preparedCommercialHtml(),
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Test send failed.");
      setNotice(`Test email sent to ${body.sentTo}. Check your inbox.`);
      setJustSucceeded("test");
      setTimeout(() => setJustSucceeded((cur) => (cur === "test" ? null : cur)), 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Test send failed.");
    } finally {
      setBusy(false);
      setPendingAction(null);
    }
  }

  async function save() {
    setBusy(true);
    setPendingAction("save");
    setError(null);
    try {
      const input = {
        name: name || subject || "Untitled template",
        subjectTemplate: subject,
        htmlTemplate: preparedCommercialHtml(),
        type: mode === "html" ? "PASTED_HTML" : mode === "gmail" ? "GMAIL_DRAFT" : "VISUAL",
        description: "",
        category: "",
      };
      const res = await fetch(templateId ? `/api/templates/${templateId}` : "/api/templates", {
        method: templateId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Could not save the template.");
      if (body.cssWarnings?.length) setCssWarnings(body.cssWarnings);
      clear();
      if (onSaved) {
        onSaved(body.template);
        setBusy(false);
        setPendingAction(null);
      } else {
        router.push("/templates");
        router.refresh();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the template.");
      setBusy(false);
      setPendingAction(null);
    }
  }

  const canSave = subject.trim() !== "" && html.trim() !== "";
  const bodyText = html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  const wordCount = bodyText ? bodyText.split(" ").length : 0;

  return (
    <div className="min-w-0">
      {restored && (
        <RestoreDraftBanner
          what="template"
          onRestore={() => {
            setName(restored.name);
            setSubject(restored.subject);
            setHtml(sanitizeEmailHtml(restored.html));
            setMode(restored.mode);
            dismissRestored();
          }}
          onDiscard={() => {
            clear();
            dismissRestored();
          }}
        />
      )}
      <div className="grid items-start gap-5 2xl:grid-cols-[minmax(0,1.15fr)_minmax(28rem,0.85fr)]">
      <section className="card min-w-0 overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-surface-2 px-4 py-3 sm:px-6">
          <div>
            <p className="text-sm font-semibold text-foreground">Email workspace</p>
            <p className="text-xs text-muted">Compose, personalize, validate, and test from one screen.</p>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted">
            <span className="rounded-full border border-border bg-surface px-2.5 py-1">
              {wordCount} word{wordCount === 1 ? "" : "s"}
            </span>
            <span className="rounded-full border border-border bg-surface px-2.5 py-1">
              Browser autosave on
            </span>
          </div>
        </div>
        <div className="p-4 sm:p-6">
        {notice && <p className="mb-3 rounded-lg bg-success-soft p-3 text-sm text-success">{notice}</p>}
        {error && <p className="mb-3 rounded-lg bg-danger-soft p-3 text-sm text-danger">{error}</p>}
        {cssWarnings.map((w) => (
          <p key={w} className="mb-2 rounded-lg bg-warning-soft p-2 text-xs text-warning">{w}</p>
        ))}

        <AiEmailWriter
          onResult={({ subject: s, html: h }) => {
            setSubject(s);
            setHtml(sanitizeEmailHtml(h));
            setMode("visual");
            if (!name) setName("AI draft");
          }}
        />

        <label className="block text-sm font-medium text-foreground">
          Template name
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. First outreach: funding intro"
            className="mt-1 w-full rounded-xl border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none"
          />
        </label>

        <div className="mt-4">
          <div className="flex items-center justify-between">
            <label htmlFor="template-subject" className="block text-sm font-medium text-foreground">
              Subject line
            </label>
            <select
              onChange={(e) => {
                if (e.target.value) insertSubjectPlaceholder(e.target.value);
                e.target.value = "";
              }}
              defaultValue=""
              className="rounded-lg border border-border px-2 py-1 text-xs"
              aria-label="Insert placeholder into subject"
            >
              <option value="" disabled>Insert placeholder…</option>
              {PLACEHOLDER_MENU.map((p) => (
                <option key={p.token} value={p.token}>{p.label}</option>
              ))}
            </select>
          </div>
          <input
            id="template-subject"
            ref={subjectInputRef}
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Quick question for {{business_name}}"
            className="mt-1 w-full rounded-xl border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none"
          />
          <p className="mt-1 text-xs text-muted">
            Placeholders work in the subject too: personalize it the same way as the body.
          </p>
        </div>

        <AiEmailTools
          subject={subject}
          html={html}
          onSubject={setSubject}
          onHtml={(nextHtml) => setHtml(sanitizeEmailHtml(nextHtml))}
        />

        <div className="mt-5 rounded-xl border border-border bg-surface-2 p-4">
          <label className="flex items-start gap-3">
            <input
              type="checkbox"
              checked={autoComplianceFooter}
              onChange={(event) => setAutoComplianceFooter(event.target.checked)}
              className="mt-1"
            />
            <span>
              <span className="block text-sm font-semibold text-foreground">
                Cadence compliance footer
              </span>
              <span className="mt-1 block text-xs leading-relaxed text-muted">
                Recommended. Cadence adds any missing company address and opt-out fields when you
                preview or save. Turn this off only if your custom footer already contains both
                required placeholders. Campaign launch remains blocked if either field is missing.
              </span>
            </span>
          </label>
        </div>

        <div className="mt-5 overflow-x-auto border-b border-border">
          <div className="flex min-w-max gap-1 text-sm">
            {(
              [
                ["visual", "Write email"],
                ["starter", "Start from a layout"],
                ["html", "Paste HTML"],
                ["gmail", "Import Gmail draft"],
              ] as Array<[Mode, string]>
            ).map(([m, label]) => (
              <button
                key={m}
                onClick={() => {
                  if (m === "visual") setHtml(sanitizeEmailHtml(html));
                  setMode(m);
                  if (m === "gmail" && drafts === null) void loadDrafts();
                }}
                className={`rounded-t-lg px-3 py-2 font-medium ${
                  mode === m ? "border border-b-0 border-border bg-surface text-foreground" : "text-muted hover:text-foreground"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {mode === "visual" && (
          <>
            <div className="mt-3 flex flex-wrap items-center gap-1 rounded-lg bg-surface-2 p-1.5 text-sm">
              <button onClick={() => exec("bold")} className="rounded px-2 py-1 font-bold hover:bg-border" aria-label="Bold">B</button>
              <button onClick={() => exec("italic")} className="rounded px-2 py-1 italic hover:bg-border" aria-label="Italic">I</button>
              <button onClick={() => exec("underline")} className="rounded px-2 py-1 underline hover:bg-border" aria-label="Underline">U</button>
              <button onClick={() => exec("formatBlock", "<h2>")} className="rounded px-2 py-1 hover:bg-border">Heading</button>
              <button onClick={() => exec("insertUnorderedList")} className="rounded px-2 py-1 hover:bg-border">• List</button>
              <button
                onClick={() => {
                  const url = prompt("Link address (https://…):");
                  const safeUrl = url ? safeWebUrl(url) : null;
                  if (safeUrl) exec("createLink", safeUrl);
                  else if (url) setError("Links must start with http:// or https://.");
                }}
                className="rounded px-2 py-1 text-foreground hover:bg-border"
              >
                Link
              </button>
              <button
                onClick={() =>
                  insertHtmlAtCursor(
                    `<a href="https://example.com" style="display:inline-block;background:#856428;color:#fff;padding:10px 20px;border-radius:8px;text-decoration:none;font-weight:600">Book a call</a>`
                  )
                }
                className="rounded px-2 py-1 hover:bg-border"
              >
                Button
              </button>
              <button onClick={() => insertHtmlAtCursor("<hr>")} className="rounded px-2 py-1 hover:bg-border">Divider</button>
              <button
                onClick={() => {
                  const url = prompt("Image address (https://…):");
                  const safeUrl = url ? safeWebUrl(url) : null;
                  if (safeUrl) {
                    const escapedUrl = safeUrl
                      .replaceAll("&", "&amp;")
                      .replaceAll('"', "&quot;");
                    insertHtmlAtCursor(
                      `<img src="${escapedUrl}" alt="" style="max-width:100%">`
                    );
                  } else if (url) {
                    setError("Images must use an http:// or https:// address.");
                  }
                }}
                className="rounded px-2 py-1 hover:bg-border"
              >
                Image
              </button>
              <select
                onChange={(e) => {
                  if (e.target.value) insertPlaceholder(e.target.value);
                  e.target.value = "";
                }}
                defaultValue=""
                className="ml-auto rounded-lg border border-border px-2 py-1 text-xs"
                aria-label="Insert placeholder"
              >
                <option value="" disabled>Insert placeholder…</option>
                {PLACEHOLDER_MENU.map((p) => (
                  <option key={p.token} value={p.token}>{p.label}</option>
                ))}
              </select>
            </div>
            <div
              ref={editorRef}
              contentEditable
              suppressContentEditableWarning
              onInput={syncFromEditor}
              onBlur={syncFromEditor}
              onPaste={(event) => {
                event.preventDefault();
                const clipboard = event.clipboardData;
                const pasted =
                  clipboard.getData("text/html") ||
                  clipboard
                    .getData("text/plain")
                    .replaceAll("&", "&amp;")
                    .replaceAll("<", "&lt;")
                    .replaceAll(">", "&gt;")
                    .replaceAll("\n", "<br>");
                insertHtmlAtCursor(pasted);
              }}
              role="textbox"
              aria-multiline="true"
              aria-label="Email body"
              className="prose-sm mt-2 min-h-[32rem] w-full overflow-auto rounded-xl border border-border bg-surface p-5 text-sm leading-relaxed focus:border-primary focus:outline-none sm:min-h-[38rem]"
            />
          </>
        )}

        {mode === "starter" && (
          <div className="mt-4 grid gap-3">
            {STARTER_LAYOUTS.map((layout) => (
              <button
                key={layout.id}
                onClick={() => {
                  setSubject(layout.subject);
                  setHtml(sanitizeEmailHtml(layout.html));
                  if (!name) setName(layout.name);
                  setMode("visual");
                }}
                className="rounded-xl border border-border p-4 text-left hover:border-primary"
              >
                <p className="font-medium">{layout.name}</p>
                <p className="mt-1 text-sm text-muted">{layout.description}</p>
              </button>
            ))}
          </div>
        )}

        {mode === "html" && (
          <textarea
            value={html}
            onChange={(e) => setHtml(e.target.value)}
            rows={28}
            spellCheck={false}
            aria-label="Email HTML"
            className="mt-3 min-h-[32rem] w-full resize-y rounded-xl border border-border bg-surface p-4 font-mono text-xs leading-relaxed focus:border-primary focus:outline-none sm:min-h-[38rem]"
          />
        )}

        {mode === "gmail" && (
          <div className="mt-3">
            <div className="flex gap-2">
              <input
                type="search"
                value={draftSearch}
                onChange={(e) => setDraftSearch(e.target.value)}
                placeholder="Search drafts by subject"
                className="flex-1 rounded-xl border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none"
              />
              <button
                onClick={() => void loadDrafts(draftSearch)}
                disabled={busy}
                className="rounded-xl border border-border px-4 py-2 text-sm hover:bg-surface-2 disabled:opacity-50"
              >
                Search
              </button>
            </div>
            <div className="mt-3 max-h-72 divide-y divide-border overflow-y-auto rounded-xl border border-border">
              {drafts === null ? (
                <p className="p-4 text-sm text-muted">Loading your Gmail drafts…</p>
              ) : drafts.length === 0 ? (
                <p className="p-4 text-sm text-muted">No drafts found.</p>
              ) : (
                drafts.map((d) => (
                  <button
                    key={d.draftId}
                    onClick={() => void importDraft(d.draftId)}
                    disabled={busy}
                    className="block w-full p-3 text-left hover:bg-surface-2 disabled:opacity-50"
                  >
                    <p className="text-sm font-medium">{d.subject}</p>
                    <p className="truncate text-xs text-muted">{d.snippet}</p>
                  </button>
                ))
              )}
            </div>
          </div>
        )}

        <div className="sticky bottom-0 z-10 -mx-4 -mb-4 mt-6 flex flex-wrap gap-2 border-t border-border bg-surface/95 px-4 py-4 backdrop-blur sm:-mx-6 sm:-mb-6 sm:px-6">
          <Button
            onClick={save}
            disabled={busy || !canSave}
            loading={pendingAction === "save"}
            loadingText="Saving…"
            className="px-5 py-2.5"
          >
            {templateId ? "Save changes" : "Save template"}
          </Button>
          <Button
            variant="ghost"
            onClick={refreshPreview}
            disabled={busy || !canSave}
            loading={pendingAction === "preview"}
            loadingText="Rendering…"
            success={justSucceeded === "preview"}
            className="px-5 py-2.5"
          >
            Preview
          </Button>
          <Button
            variant="ghost"
            onClick={sendTest}
            disabled={busy || !canSave}
            loading={pendingAction === "test"}
            loadingText="Sending…"
            success={justSucceeded === "test"}
            className="px-5 py-2.5"
          >
            Send me a test
          </Button>
        </div>
        </div>
      </section>

      <aside className="card min-w-0 p-4 sm:p-6 2xl:sticky 2xl:top-20 2xl:max-h-[calc(100vh-6rem)] 2xl:overflow-y-auto">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="segmented flex">
            {(["preview", "spam"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setRightTab(t)}
                className={`seg-btn ${rightTab === t ? "is-active" : ""}`}
              >
                {t === "preview" ? "Preview" : "Spam check"}
              </button>
            ))}
          </div>
          {rightTab === "preview" && (
            <div className="segmented" aria-label="Preview width">
              <button
                type="button"
                onClick={() => setMobilePreview(false)}
                className={`seg-btn ${!mobilePreview ? "is-active" : ""}`}
              >
                Desktop
              </button>
              <button
                type="button"
                onClick={() => setMobilePreview(true)}
                className={`seg-btn ${mobilePreview ? "is-active" : ""}`}
              >
                Phone
              </button>
            </div>
          )}
        </div>

        {rightTab === "spam" ? (
          <div className="mt-4">
            <SpamCheck
              subject={subject}
              html={
                autoComplianceFooter
                  ? appendMissingCommercialFooter(sanitizeEmailHtml(html))
                  : html
              }
            />
          </div>
        ) : preview ? (
          <>
            {preview.unresolved.length > 0 && (
              <p className="mt-3 rounded-lg bg-warning-soft p-2 text-xs text-warning">
                Some placeholders have no value yet:{" "}
                {preview.unresolved.map((u) => `{{${u}}}`).join(", ")}: fill in your sender
                profile in Settings, or they&apos;ll show as-is in sent emails.
              </p>
            )}
            <div className="mt-4 rounded-xl border border-border bg-surface-2 p-3">
              <p className="text-[11px] font-medium uppercase tracking-wide text-muted">Subject preview</p>
              <p className="mt-1 break-words text-sm font-medium">{preview.subject}</p>
            </div>
            {/* Isolated in an iframe so the email's own CSS can never leak
                into the app and clip the layout (the old "half display"
                glitch). Auto-sizes to its content on load. */}
            <div
              className={`mt-3 transition-[max-width] ${
                mobilePreview ? "mx-auto max-w-[390px]" : "max-w-full"
              }`}
            >
              <iframe
                title="Email preview"
                sandbox=""
                onLoad={(e) => {
                  const f = e.currentTarget;
                  try {
                    const h = f.contentWindow?.document.body?.scrollHeight;
                    if (h) f.style.height = `${Math.min(h + 32, 1600)}px`;
                  } catch {
                    /* cross-origin guard: ignore */
                  }
                }}
                className="w-full rounded-xl border border-border bg-surface"
                style={{ height: "32rem" }}
                srcDoc={`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><base target="_blank"><style>body{margin:0;padding:16px;font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#1d1d1f;font-size:14px;line-height:1.5;word-break:break-word}img{max-width:100%}</style></head><body>${preview.html}</body></html>`}
              />
            </div>
          </>
        ) : (
          <div className="mt-4 rounded-xl border border-dashed border-border bg-surface-2 p-8 text-center">
            <span className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl bg-surface-2 text-foreground">
              <Icon name="mail" size={19} />
            </span>
            <p className="mt-3 text-sm font-medium text-foreground">Preview example lead data</p>
            <p className="mt-1 text-sm text-muted">
              Click Preview to render placeholders and inspect the final email at desktop or phone width.
            </p>
          </div>
        )}
      </aside>
      </div>
    </div>
  );
}
