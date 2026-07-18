"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { STARTER_LAYOUTS } from "./starterLayouts";

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
  { token: "{{signature}}", label: "My signature" },
];

type Mode = "visual" | "starter" | "html" | "gmail";

interface DraftSummary {
  draftId: string;
  subject: string;
  snippet: string;
}

export function TemplateEditor({
  templateId,
  initial,
}: {
  templateId: string | null;
  initial: { name: string; subjectTemplate: string; htmlTemplate: string; type: string } | null;
}) {
  const router = useRouter();
  const editorRef = useRef<HTMLDivElement>(null);
  const [mode, setMode] = useState<Mode>(
    initial?.type === "PASTED_HTML" ? "html" : "visual"
  );
  const [name, setName] = useState(initial?.name ?? "");
  const [subject, setSubject] = useState(initial?.subjectTemplate ?? "");
  const [html, setHtml] = useState(initial?.htmlTemplate ?? "<p>Hi {{first_name}},</p><p></p>");
  const [preview, setPreview] = useState<{ subject: string; html: string; unresolved: string[] } | null>(null);
  const [mobilePreview, setMobilePreview] = useState(false);
  const [drafts, setDrafts] = useState<DraftSummary[] | null>(null);
  const [draftSearch, setDraftSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cssWarnings, setCssWarnings] = useState<string[]>([]);

  // Keep the visual editor's DOM in sync when html changes from outside it.
  useEffect(() => {
    if (mode === "visual" && editorRef.current && editorRef.current.innerHTML !== html) {
      editorRef.current.innerHTML = html;
    }
  }, [mode, html]);

  function syncFromEditor() {
    if (editorRef.current) setHtml(editorRef.current.innerHTML);
  }

  function exec(command: string, value?: string) {
    editorRef.current?.focus();
    document.execCommand(command, false, value);
    syncFromEditor();
  }

  function insertHtmlAtCursor(snippet: string) {
    editorRef.current?.focus();
    document.execCommand("insertHTML", false, snippet);
    syncFromEditor();
  }

  function insertPlaceholder(token: string) {
    if (mode === "visual") insertHtmlAtCursor(token);
    else setHtml((h) => h + token);
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
      setHtml(body.draft.htmlBody);
      if (!name) setName(body.draft.subject);
      setMode("visual");
      setNotice("Draft imported — you can now personalize it with placeholders.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not import that draft.");
    } finally {
      setBusy(false);
    }
  }

  async function refreshPreview() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/templates/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subjectTemplate: subject || "(no subject)", htmlTemplate: html }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Preview failed.");
      setPreview(body);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Preview failed.");
    } finally {
      setBusy(false);
    }
  }

  async function sendTest() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/templates/test-send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subjectTemplate: subject, htmlTemplate: html }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Test send failed.");
      setNotice(`Test email sent to ${body.sentTo}. Check your inbox.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Test send failed.");
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const input = {
        name: name || subject || "Untitled template",
        subjectTemplate: subject,
        htmlTemplate: html,
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
      router.push("/templates");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the template.");
      setBusy(false);
    }
  }

  const canSave = subject.trim() !== "" && html.trim() !== "";

  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <div className="rounded-2xl bg-white p-6 shadow-sm">
        {notice && <p className="mb-3 rounded-lg bg-green-50 p-3 text-sm text-green-700">{notice}</p>}
        {error && <p className="mb-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        {cssWarnings.map((w) => (
          <p key={w} className="mb-2 rounded-lg bg-amber-50 p-2 text-xs text-amber-700">{w}</p>
        ))}

        <label className="block text-sm font-medium text-slate-700">
          Template name
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. First outreach — funding intro"
            className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-primary focus:outline-none"
          />
        </label>

        <label className="mt-4 block text-sm font-medium text-slate-700">
          Subject line
          <input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Quick question for {{business_name}}"
            className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-primary focus:outline-none"
          />
        </label>

        <div className="mt-5 flex gap-1 border-b border-slate-200 text-sm">
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
                setMode(m);
                if (m === "gmail" && drafts === null) void loadDrafts();
              }}
              className={`rounded-t-lg px-3 py-2 font-medium ${
                mode === m ? "border border-b-0 border-slate-200 bg-white text-primary" : "text-slate-500 hover:text-slate-700"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {mode === "visual" && (
          <>
            <div className="mt-3 flex flex-wrap items-center gap-1 rounded-lg bg-slate-50 p-1 text-sm">
              <button onClick={() => exec("bold")} className="rounded px-2 py-1 font-bold hover:bg-slate-200" aria-label="Bold">B</button>
              <button onClick={() => exec("italic")} className="rounded px-2 py-1 italic hover:bg-slate-200" aria-label="Italic">I</button>
              <button onClick={() => exec("underline")} className="rounded px-2 py-1 underline hover:bg-slate-200" aria-label="Underline">U</button>
              <button onClick={() => exec("formatBlock", "<h2>")} className="rounded px-2 py-1 hover:bg-slate-200">Heading</button>
              <button onClick={() => exec("insertUnorderedList")} className="rounded px-2 py-1 hover:bg-slate-200">• List</button>
              <button
                onClick={() => {
                  const url = prompt("Link address (https://…):");
                  if (url) exec("createLink", url);
                }}
                className="rounded px-2 py-1 text-primary hover:bg-slate-200"
              >
                Link
              </button>
              <button
                onClick={() =>
                  insertHtmlAtCursor(
                    `<a href="https://example.com" style="display:inline-block;background:#1d4ed8;color:#fff;padding:10px 20px;border-radius:8px;text-decoration:none;font-weight:600">Book a call</a>`
                  )
                }
                className="rounded px-2 py-1 hover:bg-slate-200"
              >
                Button
              </button>
              <button onClick={() => insertHtmlAtCursor("<hr>")} className="rounded px-2 py-1 hover:bg-slate-200">Divider</button>
              <button
                onClick={() => {
                  const url = prompt("Image address (https://…):");
                  if (url) insertHtmlAtCursor(`<img src="${url}" alt="" style="max-width:100%">`);
                }}
                className="rounded px-2 py-1 hover:bg-slate-200"
              >
                Image
              </button>
              <select
                onChange={(e) => {
                  if (e.target.value) insertPlaceholder(e.target.value);
                  e.target.value = "";
                }}
                defaultValue=""
                className="ml-auto rounded-lg border border-slate-200 px-2 py-1 text-xs"
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
              role="textbox"
              aria-multiline="true"
              aria-label="Email body"
              className="prose-sm mt-2 min-h-64 w-full rounded-xl border border-slate-200 p-4 text-sm focus:border-primary focus:outline-none"
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
                  setHtml(layout.html);
                  if (!name) setName(layout.name);
                  setMode("visual");
                }}
                className="rounded-xl border border-slate-200 p-4 text-left hover:border-primary"
              >
                <p className="font-medium">{layout.name}</p>
                <p className="mt-1 text-sm text-slate-500">{layout.description}</p>
              </button>
            ))}
          </div>
        )}

        {mode === "html" && (
          <textarea
            value={html}
            onChange={(e) => setHtml(e.target.value)}
            rows={16}
            spellCheck={false}
            aria-label="Email HTML"
            className="mt-3 w-full rounded-xl border border-slate-200 p-3 font-mono text-xs focus:border-primary focus:outline-none"
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
                className="flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-primary focus:outline-none"
              />
              <button
                onClick={() => void loadDrafts(draftSearch)}
                disabled={busy}
                className="rounded-xl border border-slate-200 px-4 py-2 text-sm hover:bg-slate-50 disabled:opacity-50"
              >
                Search
              </button>
            </div>
            <div className="mt-3 max-h-72 divide-y divide-slate-100 overflow-y-auto rounded-xl border border-slate-200">
              {drafts === null ? (
                <p className="p-4 text-sm text-slate-500">Loading your Gmail drafts…</p>
              ) : drafts.length === 0 ? (
                <p className="p-4 text-sm text-slate-500">No drafts found.</p>
              ) : (
                drafts.map((d) => (
                  <button
                    key={d.draftId}
                    onClick={() => void importDraft(d.draftId)}
                    disabled={busy}
                    className="block w-full p-3 text-left hover:bg-slate-50 disabled:opacity-50"
                  >
                    <p className="text-sm font-medium">{d.subject}</p>
                    <p className="truncate text-xs text-slate-500">{d.snippet}</p>
                  </button>
                ))
              )}
            </div>
          </div>
        )}

        <div className="mt-6 flex flex-wrap gap-2">
          <button
            onClick={save}
            disabled={busy || !canSave}
            className="rounded-xl bg-primary px-5 py-2.5 font-medium text-white hover:bg-primary-hover disabled:opacity-50"
          >
            {busy ? "Working…" : templateId ? "Save changes" : "Save template"}
          </button>
          <button
            onClick={refreshPreview}
            disabled={busy || !canSave}
            className="rounded-xl border border-slate-200 px-5 py-2.5 font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            Preview
          </button>
          <button
            onClick={sendTest}
            disabled={busy || !canSave}
            className="rounded-xl border border-slate-200 px-5 py-2.5 font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            Send me a test
          </button>
        </div>
      </div>

      <div className="rounded-2xl bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <h2 className="font-medium">Preview</h2>
          <label className="flex items-center gap-2 text-xs text-slate-500">
            <input
              type="checkbox"
              checked={mobilePreview}
              onChange={(e) => setMobilePreview(e.target.checked)}
            />
            Phone size
          </label>
        </div>
        {preview ? (
          <>
            {preview.unresolved.length > 0 && (
              <p className="mt-3 rounded-lg bg-amber-50 p-2 text-xs text-amber-700">
                Some placeholders have no value yet:{" "}
                {preview.unresolved.map((u) => `{{${u}}}`).join(", ")} — fill in your sender
                profile in Settings, or they&apos;ll show as-is in sent emails.
              </p>
            )}
            <p className="mt-3 border-b border-slate-100 pb-2 text-sm">
              <span className="text-slate-500">Subject:</span>{" "}
              <span className="font-medium">{preview.subject}</span>
            </p>
            <div
              className={`mt-3 overflow-auto rounded-xl border border-slate-200 bg-slate-50 p-4 ${
                mobilePreview ? "mx-auto max-w-xs" : ""
              }`}
              // Server-sanitized HTML (sanitizeEmailHtml) — safe to render.
              dangerouslySetInnerHTML={{ __html: preview.html }}
            />
          </>
        ) : (
          <p className="mt-3 text-sm text-slate-500">
            Click Preview to see this email with example lead data filled in.
          </p>
        )}
      </div>
    </div>
  );
}
