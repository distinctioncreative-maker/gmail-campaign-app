"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { fetchJson } from "@/lib/fetchJson";
import { useToast } from "@/components/ui/UIProviders";
import { Icon } from "@/components/ui/Icon";
import {
  categoryHint,
  supportCategoryOptions,
  SUPPORT_RESPONSE_TARGET,
  type SupportCategory,
} from "@/lib/support/contact";

/**
 * The in-app way to reach a human.
 *
 * It asks for three things and nothing else. Workspace, plan, sending mode,
 * Gmail status, and the running revision are attached server-side from the
 * session, because the customer already told us all of that by signing in and
 * asking again is the product wasting their time.
 *
 * The reference is shown after sending and stays on screen. A customer who
 * cannot quote a reference has no way to follow up on their own report, which
 * turns every follow-up into a fresh ticket.
 */
export function ContactSupportForm({ signedInEmail }: { signedInEmail: string }) {
  const toast = useToast();
  const pathname = usePathname();
  const [category, setCategory] = useState<SupportCategory>("SENDING");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [replyTo, setReplyTo] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState<{ reference: string; replyTo: string } | null>(null);

  const ready = subject.trim().length >= 3 && message.trim().length >= 10;

  async function submit() {
    if (!ready || busy) return;
    setBusy(true);
    try {
      const res = await fetchJson<{ reference: string; replyTo: string; message: string }>(
        "/api/support",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            category,
            subject: subject.trim(),
            message: message.trim(),
            replyTo: replyTo.trim(),
            reportedFrom: pathname ?? "",
          }),
        }
      );
      setSent({ reference: res.reference, replyTo: res.replyTo });
      setSubject("");
      setMessage("");
      toast(res.message, "success");
    } catch (err) {
      toast(
        err instanceof Error ? err.message : "That did not send. Try again in a moment.",
        "error"
      );
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <div className="card p-6 sm:p-7">
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-success-soft text-success">
            <Icon name="check" size={18} />
          </span>
          <div>
            <p className="font-semibold">Your message is with us</p>
            <p className="mt-1 text-sm text-muted">
              Reference <span className="font-mono font-medium text-foreground">{sent.reference}</span>.
              We reply to {sent.replyTo} within {SUPPORT_RESPONSE_TARGET}. Keep the reference if you
              need to follow up.
            </p>
            <button
              onClick={() => setSent(null)}
              className="btn-secondary mt-4 min-h-11 px-4 py-2.5 text-sm"
            >
              Send another
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="card p-6 sm:p-7">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="font-medium">What is this about?</span>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value as SupportCategory)}
            className="mt-1.5 w-full rounded-xl border border-border bg-surface px-3 py-2.5 text-sm focus:border-primary focus:outline-none"
          >
            {supportCategoryOptions().map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <span className="mt-1.5 block text-xs text-muted">{categoryHint(category)}</span>
        </label>

        <label className="block text-sm">
          <span className="font-medium">Reply to</span>
          <input
            type="email"
            value={replyTo}
            onChange={(e) => setReplyTo(e.target.value)}
            placeholder={signedInEmail}
            className="mt-1.5 w-full rounded-xl border border-border bg-surface px-3 py-2.5 text-sm focus:border-primary focus:outline-none"
          />
          <span className="mt-1.5 block text-xs text-muted">
            Leave blank and we reply to {signedInEmail}.
          </span>
        </label>
      </div>

      <label className="mt-4 block text-sm">
        <span className="font-medium">Subject</span>
        <input
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="e.g. Campaign stopped sending halfway through"
          className="mt-1.5 w-full rounded-xl border border-border bg-surface px-3 py-2.5 text-sm focus:border-primary focus:outline-none"
        />
      </label>

      <label className="mt-4 block text-sm">
        <span className="font-medium">What happened?</span>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={6}
          placeholder="What you did, what happened, and what you expected instead."
          className="mt-1.5 w-full rounded-xl border border-border bg-surface px-3 py-2.5 text-sm focus:border-primary focus:outline-none"
        />
      </label>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-muted">
          Your workspace, plan, sending mode, and Gmail status are attached automatically. No lead
          data and no message content from your mailbox is included.
        </p>
        <button
          onClick={() => void submit()}
          disabled={!ready || busy}
          className="btn-primary min-h-11 px-5 py-2.5 text-sm disabled:opacity-50"
        >
          {busy ? "Sending…" : "Send to support"}
        </button>
      </div>
    </div>
  );
}
