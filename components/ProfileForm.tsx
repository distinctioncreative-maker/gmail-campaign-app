"use client";

import { useState } from "react";
import type { SenderProfile } from "@/schemas/userSettings";
import { HelpTip } from "@/components/HelpTip";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const TIMEZONES = [
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Phoenix",
  "America/Los_Angeles",
];

export function ProfileForm({
  initial,
  compact = false,
  onSaved,
}: {
  initial: SenderProfile;
  compact?: boolean;
  onSaved?: () => void;
}) {
  const [profile, setProfile] = useState<SenderProfile>(initial);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function set<K extends keyof SenderProfile>(key: K, value: SenderProfile[K]) {
    setProfile((p) => ({ ...p, [key]: value }));
  }

  function setDefault<K extends keyof SenderProfile["sendingDefaults"]>(
    key: K,
    value: SenderProfile["sendingDefaults"][K]
  ) {
    setProfile((p) => ({ ...p, sendingDefaults: { ...p.sendingDefaults, [key]: value } }));
  }

  async function save() {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch("/api/settings/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(profile),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Could not save your profile.");
      setNotice("Saved.");
      onSaved?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save your profile.");
    } finally {
      setBusy(false);
    }
  }

  const input =
    "mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-primary focus:outline-none";

  return (
    <div>
      {notice && <p className="mb-3 rounded-lg bg-green-50 p-3 text-sm text-green-700">{notice}</p>}
      {error && <p className="mb-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="text-sm font-medium text-slate-700">
          Your name
          <input value={profile.senderName} onChange={(e) => set("senderName", e.target.value)} className={input} />
        </label>
        <label className="text-sm font-medium text-slate-700">
          Job title
          <input value={profile.senderTitle} onChange={(e) => set("senderTitle", e.target.value)} className={input} />
        </label>
        <label className="text-sm font-medium text-slate-700">
          Work phone
          <input value={profile.senderPhone} onChange={(e) => set("senderPhone", e.target.value)} className={input} />
        </label>
        <label className="text-sm font-medium text-slate-700">
          Work email
          <input value={profile.senderEmail} onChange={(e) => set("senderEmail", e.target.value)} className={input} />
        </label>
        <label className="text-sm font-medium text-slate-700">
          Company name
          <input value={profile.companyName} onChange={(e) => set("companyName", e.target.value)} className={input} />
        </label>
        <label className="text-sm font-medium text-slate-700">
          Company website
          <input value={profile.companyWebsite} onChange={(e) => set("companyWebsite", e.target.value)} className={input} />
        </label>
      </div>

      <label className="mt-4 block text-sm font-medium text-slate-700">
        Company mailing address
        <HelpTip text="US anti-spam law (CAN-SPAM) requires a real physical mailing address in marketing emails. A PO box or suite is fine." />
        <span className="block text-xs font-normal text-slate-500">
          Shown in the footer of your emails — required for commercial email rules.
        </span>
        <input value={profile.physicalAddress} onChange={(e) => set("physicalAddress", e.target.value)} className={input} />
      </label>

      <label className="mt-4 block text-sm font-medium text-slate-700">
        Opt-out sentence
        <span className="block text-xs font-normal text-slate-500">
          Lets people decline future emails — required for commercial email rules.
        </span>
        <textarea
          value={profile.unsubscribeText}
          onChange={(e) => set("unsubscribeText", e.target.value)}
          rows={2}
          className={input}
        />
      </label>

      <label className="mt-4 block text-sm font-medium text-slate-700">
        Your email signature
        <span className="block text-xs font-normal text-slate-500">
          Paste your own signature (plain text or HTML from Gmail). Drop{" "}
          <code className="rounded bg-slate-100 px-1">{"{{signature}}"}</code> into any template
          where you want it to appear — then you don&apos;t need to fill in the name/title/phone
          fields above unless a template uses those placeholders directly.
        </span>
        <textarea
          value={profile.signature}
          onChange={(e) => set("signature", e.target.value)}
          rows={5}
          placeholder={"Jane Doe\nFunding Advisor, Alpine Funding\n(555) 123-4567 · jane@alpinefundings.com"}
          className={`${input} font-mono`}
        />
      </label>

      <label className="mt-4 block text-sm font-medium text-slate-700">
        Timezone
        <select value={profile.timezone} onChange={(e) => set("timezone", e.target.value)} className={input}>
          {TIMEZONES.map((tz) => (
            <option key={tz} value={tz}>{tz.replace("America/", "").replaceAll("_", " ")}</option>
          ))}
        </select>
      </label>

      {!compact && (
        <>
          <h3 className="mt-6 border-t border-slate-100 pt-4 font-medium">Sending defaults</h3>
          <p className="text-xs text-slate-500">
            Used as the starting point for new campaigns — you can adjust each campaign
            individually.
          </p>

          <div className="mt-3 flex gap-1">
            {WEEKDAYS.map((d, i) => (
              <button
                key={d}
                onClick={() =>
                  setDefault(
                    "allowedWeekdays",
                    profile.sendingDefaults.allowedWeekdays.includes(i)
                      ? profile.sendingDefaults.allowedWeekdays.filter((x) => x !== i)
                      : [...profile.sendingDefaults.allowedWeekdays, i].sort()
                  )
                }
                className={`rounded-lg px-3 py-1.5 text-xs font-medium ${
                  profile.sendingDefaults.allowedWeekdays.includes(i)
                    ? "bg-primary text-white"
                    : "bg-slate-100 text-slate-500"
                }`}
              >
                {d}
              </button>
            ))}
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <label className="text-sm font-medium text-slate-700">
              Send between
              <input type="time" value={profile.sendingDefaults.sendWindowStart} onChange={(e) => setDefault("sendWindowStart", e.target.value)} className={input} />
            </label>
            <label className="text-sm font-medium text-slate-700">
              and
              <input type="time" value={profile.sendingDefaults.sendWindowEnd} onChange={(e) => setDefault("sendWindowEnd", e.target.value)} className={input} />
            </label>
            <label className="text-sm font-medium text-slate-700">
              Daily limit
              <HelpTip text="The most emails a campaign will send per day. Gmail limits how many you can send, and lower numbers look more personal. 50–150 is a safe range." />
              <input
                type="number" min={1} max={2000}
                value={profile.sendingDefaults.dailySendLimit}
                onChange={(e) => setDefault("dailySendLimit", Number(e.target.value))}
                className={input}
              />
            </label>
            <label className="text-sm font-medium text-slate-700">
              Emails per batch
              <input
                type="number" min={1} max={50}
                value={profile.sendingDefaults.emailsPerBatch}
                onChange={(e) => setDefault("emailsPerBatch", Number(e.target.value))}
                className={input}
              />
            </label>
            <label className="text-sm font-medium text-slate-700">
              Seconds between emails
              <div className="flex items-center gap-2">
                <input
                  type="number" min={1} max={600}
                  value={profile.sendingDefaults.minDelaySeconds}
                  onChange={(e) => setDefault("minDelaySeconds", Number(e.target.value))}
                  className={input}
                />
                <span className="mt-1 text-slate-400">–</span>
                <input
                  type="number" min={1} max={600}
                  value={profile.sendingDefaults.maxDelaySeconds}
                  onChange={(e) => setDefault("maxDelaySeconds", Number(e.target.value))}
                  className={input}
                />
              </div>
            </label>
            <label className="text-sm font-medium text-slate-700">
              Minutes between batches
              <input
                type="number" min={0} max={240}
                value={profile.sendingDefaults.interBatchDelayMinutes}
                onChange={(e) => setDefault("interBatchDelayMinutes", Number(e.target.value))}
                className={input}
              />
            </label>
          </div>
        </>
      )}

      <button
        onClick={save}
        disabled={busy}
        className="mt-6 rounded-xl bg-primary px-5 py-2.5 font-medium text-white hover:bg-primary-hover disabled:opacity-50"
      >
        {busy ? "Saving…" : "Save"}
      </button>
    </div>
  );
}
