"use client";

import { useEffect, useState } from "react";
import { fetchJson } from "@/lib/fetchJson";
import { useToast } from "@/components/ui/UIProviders";
import { Icon } from "@/components/ui/Icon";

const IMPROVE_ACTIONS: Array<{ label: string; instruction: string }> = [
  { label: "Shorter", instruction: "Make it noticeably shorter and punchier without losing the offer." },
  { label: "Warmer", instruction: "Make the tone warmer and more human, less salesy." },
  { label: "More professional", instruction: "Make it a touch more professional and polished." },
  { label: "Fix spammy words", instruction: "Remove spam-trigger words and hypey language so it lands in the inbox." },
  { label: "Stronger CTA", instruction: "Sharpen the call to action into one clear, low-friction next step." },
];

/**
 * AI editing tools for an existing email: one-tap rewrites and subject-line
 * ideas. Operates on the editor's current subject + body. Hidden when the AI
 * writer isn't configured on the server.
 */
export function AiEmailTools({
  subject,
  html,
  onSubject,
  onHtml,
}: {
  subject: string;
  html: string;
  onSubject: (s: string) => void;
  onHtml: (h: string) => void;
}) {
  const toast = useToast();
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [subjects, setSubjects] = useState<string[] | null>(null);

  useEffect(() => {
    fetchJson<{ enabled: boolean }>("/api/templates/generate")
      .then((r) => setEnabled(r.enabled))
      .catch(() => setEnabled(false));
  }, []);

  async function improve(label: string, instruction: string) {
    setBusy(label);
    try {
      const res = await fetchJson<{ subject: string; html: string }>("/api/templates/improve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject, html, instruction }),
      });
      onSubject(res.subject);
      onHtml(res.html);
      toast(`Updated: ${label.toLowerCase()}.`, "success");
    } catch (err) {
      toast(err instanceof Error ? err.message : "That didn't work: try again.", "error");
    } finally {
      setBusy(null);
    }
  }

  async function addVariations() {
    setBusy("variations");
    try {
      const res = await fetchJson<{
        subject: string;
        html: string;
        variants: number;
        groups: number;
      }>("/api/templates/variations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject, html }),
      });
      onSubject(res.subject);
      onHtml(res.html);
      toast(
        `Added ${res.groups} variation${res.groups === 1 ? "" : "s"}: ${res.variants.toLocaleString()} distinct versions.`,
        "success"
      );
    } catch (err) {
      // The server rejects a draft that mangled a placeholder or broke the
      // syntax, and says so. Passing that through matters: "try again" is the
      // right advice here and a generic failure would not suggest it.
      toast(err instanceof Error ? err.message : "Couldn't add variations.", "error");
    } finally {
      setBusy(null);
    }
  }

  async function suggestSubjects() {
    setBusy("subjects");
    try {
      const res = await fetchJson<{ subjects: string[] }>("/api/templates/subjects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject, html }),
      });
      setSubjects(res.subjects);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Couldn't get subject ideas.", "error");
    } finally {
      setBusy(null);
    }
  }

  if (enabled !== true) return null;
  const disabled = busy !== null || html.trim().length < 12;

  return (
    <div className="mt-3 rounded-xl border border-border bg-surface-2 p-3">
      <p className="flex items-center gap-1.5 text-xs font-medium text-muted"><Icon name="sparkles" size={14} aria-hidden /> AI tools: improve what you&apos;ve written</p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {IMPROVE_ACTIONS.map((a) => (
          <button
            key={a.label}
            onClick={() => void improve(a.label, a.instruction)}
            disabled={disabled}
            className="rounded-full border border-info/20 bg-surface px-2.5 py-1 text-xs text-muted transition hover:border-info disabled:opacity-50"
          >
            {busy === a.label ? "…" : a.label}
          </button>
        ))}
        <button
          onClick={() => void addVariations()}
          disabled={disabled}
          className="rounded-full border border-info/20 bg-surface px-2.5 py-1 text-xs font-medium text-info transition hover:border-info disabled:opacity-50"
        >
          {busy === "variations" ? "Adding…" : "Add variations"}
        </button>
        <button
          onClick={() => void suggestSubjects()}
          disabled={disabled}
          className="rounded-full border border-info/20 bg-surface px-2.5 py-1 text-xs font-medium text-info transition hover:border-info disabled:opacity-50"
        >
          {busy === "subjects" ? "…" : "Subject ideas"}
        </button>
      </div>

      {subjects && (
        <div className="mt-2 flex flex-col gap-1">
          <p className="text-[11px] text-muted">Tap to use one:</p>
          {subjects.map((s) => (
            <button
              key={s}
              onClick={() => {
                onSubject(s);
                toast("Subject applied.", "success");
              }}
              className="rounded-lg border border-border bg-surface px-2.5 py-1.5 text-left text-xs text-foreground transition hover:border-info"
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
