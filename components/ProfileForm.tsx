"use client";

import { useState } from "react";
import Link from "next/link";
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
  const [reading, setReading] = useState(false);
  const [readNote, setReadNote] = useState<string | null>(null);
  const [readError, setReadError] = useState<string | null>(null);

  /**
   * Fill in what the company's own website publishes.
   *
   * The two fields worth the most here are the company name and the postal
   * address, and the address is the one that matters: it blocks campaign
   * launch, it is tedious to type, and it is almost always already in the
   * footer of the site being read, because the same rules that require it on an
   * email required it there.
   *
   * Only ever fills blanks. Someone who has typed their address and then
   * presses this to fill the rest would not expect their own answer replaced by
   * a scraped one.
   */
  async function readSite() {
    const url = profile.companyWebsite.trim();
    if (!url) return;
    setReading(true);
    setReadError(null);
    setReadNote(null);
    try {
      const res = await fetch("/api/settings/profile/suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Could not read that site.");

      /**
       * Decided out here rather than inside the state updater. An updater must
       * be a pure function of its argument: React is free to call it twice, and
       * a version that appended to this list from inside would report each
       * filled field twice while still filling it once.
       */
      const takesName = !profile.companyName.trim() && Boolean(body.companyName);
      const takesAddress = !profile.physicalAddress.trim() && Boolean(body.physicalAddress);

      setProfile((p) => ({
        ...p,
        companyName: takesName ? body.companyName : p.companyName,
        physicalAddress: takesAddress ? body.physicalAddress : p.physicalAddress,
      }));

      const filled = [
        takesName ? "company name" : "",
        takesAddress ? "mailing address" : "",
      ].filter(Boolean);

      setReadNote(
        filled.length > 0
          ? `Filled in your ${filled.join(" and ")} from ${body.readFrom}. Check it before saving.`
          : "Nothing new to fill in: that page did not publish anything the blank fields need."
      );
    } catch (err) {
      setReadError(err instanceof Error ? err.message : "Could not read that site.");
    } finally {
      setReading(false);
    }
  }

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
    "mt-1 w-full rounded-md border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none";

  return (
    <div>
      {notice && <p className="mb-3 rounded-lg bg-success-soft p-3 text-sm text-success">{notice}</p>}
      {error && <p className="mb-3 rounded-lg bg-danger-soft p-3 text-sm text-danger">{error}</p>}

      <h3 className="mb-3 text-sm font-semibold text-muted">Your identity</h3>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="text-sm font-medium text-foreground">
          Your name
          <input value={profile.senderName} onChange={(e) => set("senderName", e.target.value)} className={input} />
        </label>
        <label className="text-sm font-medium text-foreground">
          Job title
          <input value={profile.senderTitle} onChange={(e) => set("senderTitle", e.target.value)} className={input} />
        </label>
        <label className="text-sm font-medium text-foreground">
          Work phone
          <input value={profile.senderPhone} onChange={(e) => set("senderPhone", e.target.value)} className={input} />
        </label>
        <label className="text-sm font-medium text-foreground">
          Work email
          <input value={profile.senderEmail} onChange={(e) => set("senderEmail", e.target.value)} className={input} />
        </label>
        <label className="text-sm font-medium text-foreground">
          Company name
          <input value={profile.companyName} onChange={(e) => set("companyName", e.target.value)} className={input} />
        </label>
        <label className="text-sm font-medium text-foreground">
          Company website
          <input
            value={profile.companyWebsite}
            onChange={(e) => set("companyWebsite", e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void readSite();
              }
            }}
            placeholder="yourcompany.com"
            className={input}
          />
        </label>
      </div>

      {/* Sits directly under the website field, because that field is its
          input. Nine text fields is the longest form in the product and it is
          the one a trial user meets on day one, right after connecting Gmail.
          Most of what it asks for is already published on the address just
          above. */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => void readSite()}
          disabled={reading || !profile.companyWebsite.trim()}
          className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-surface-2 disabled:opacity-50"
        >
          {reading ? "Reading your site…" : "Fill the rest from my website"}
        </button>
        <span className="text-xs text-muted">
          Reads your company name and mailing address off your own site.
        </span>
      </div>
      {readError && <p className="mt-2 text-xs text-danger">{readError}</p>}
      {readNote && !readError && <p className="mt-2 text-xs text-success">{readNote}</p>}

      <h3 className="mb-1 mt-6 border-t border-border pt-5 text-sm font-semibold text-muted">
        Legal footer &amp; signature
      </h3>
      <label className="mt-2 block text-sm font-medium text-foreground">
        Company mailing address
        <HelpTip text="US commercial-email rules require a valid current postal address. This may be a street address, a registered PO box, or a properly registered private mailbox." />
        <span className="block text-xs font-normal text-muted">
          Shown in the footer of commercial emails. Review the{" "}
          <Link href="/compliance" className="font-medium text-foreground link">
            compliance guide
          </Link>
          .
        </span>
        <input value={profile.physicalAddress} onChange={(e) => set("physicalAddress", e.target.value)} className={input} />
      </label>

      <label className="mt-4 block text-sm font-medium text-foreground">
        Opt-out sentence
        <span className="block text-xs font-normal text-muted">
          Lets people decline future emails: required for commercial email rules.
        </span>
        <textarea
          value={profile.unsubscribeText}
          onChange={(e) => set("unsubscribeText", e.target.value)}
          rows={2}
          className={input}
        />
      </label>

      <label className="mt-4 block text-sm font-medium text-foreground">
        Your email signature
        <span className="block text-xs font-normal text-muted">
          Paste your own signature (plain text or HTML from Gmail). Drop{" "}
          <code className="rounded-sm bg-surface-2 px-1">{"{{signature}}"}</code> into any template
          where you want it to appear: then you don&apos;t need to fill in the name/title/phone
          fields above unless a template uses those placeholders directly.{" "}
          <strong>Leave this blank to turn the signature off</strong>: handy when your email
          already includes a signature (for example, a Gmail draft you imported). A blank
          signature just removes{" "}
          <code className="rounded-sm bg-surface-2 px-1">{"{{signature}}"}</code> instead of
          printing it.
        </span>
        <textarea
          value={profile.signature}
          onChange={(e) => set("signature", e.target.value)}
          rows={5}
          placeholder={"Jane Doe\nFunding Advisor, Alpine Funding\n(555) 123-4567 · jane@alpinefundings.com"}
          className={`${input} font-mono`}
        />
      </label>

      <label className="mt-4 block text-sm font-medium text-foreground">
        Timezone
        <select value={profile.timezone} onChange={(e) => set("timezone", e.target.value)} className={input}>
          {TIMEZONES.map((tz) => (
            <option key={tz} value={tz}>{tz.replace("America/", "").replaceAll("_", " ")}</option>
          ))}
        </select>
      </label>

      {!compact && (
        <>
          <h3 className="mt-6 border-t border-border pt-4 font-medium">Sending defaults</h3>
          <p className="text-xs text-muted">
            Used as the starting point for new campaigns: you can adjust each campaign
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
                    ? "bg-primary text-primary-contrast"
                    : "bg-surface-2 text-muted"
                }`}
              >
                {d}
              </button>
            ))}
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <label className="text-sm font-medium text-foreground">
              Send between
              <input type="time" value={profile.sendingDefaults.sendWindowStart} onChange={(e) => setDefault("sendWindowStart", e.target.value)} className={input} />
            </label>
            <label className="text-sm font-medium text-foreground">
              and
              <input type="time" value={profile.sendingDefaults.sendWindowEnd} onChange={(e) => setDefault("sendWindowEnd", e.target.value)} className={input} />
            </label>
            <label className="text-sm font-medium text-foreground">
              Daily limit
              <HelpTip text="The most emails a campaign will send per day. Provider limits are ceilings, not a universal safe target. Start conservatively and adjust using account history, audience quality, and campaign health." />
              <input
                type="number" min={1} max={2000}
                value={profile.sendingDefaults.dailySendLimit}
                onChange={(e) => setDefault("dailySendLimit", Number(e.target.value))}
                className={input}
              />
            </label>
            <label className="text-sm font-medium text-foreground">
              Emails per batch
              <input
                type="number" min={1} max={50}
                value={profile.sendingDefaults.emailsPerBatch}
                onChange={(e) => setDefault("emailsPerBatch", Number(e.target.value))}
                className={input}
              />
            </label>
            <label className="text-sm font-medium text-foreground">
              Seconds between emails
              <div className="flex items-center gap-2">
                <input
                  type="number" min={1} max={600}
                  value={profile.sendingDefaults.minDelaySeconds}
                  onChange={(e) => setDefault("minDelaySeconds", Number(e.target.value))}
                  className={input}
                />
                <span className="mt-1 text-muted">–</span>
                <input
                  type="number" min={1} max={600}
                  value={profile.sendingDefaults.maxDelaySeconds}
                  onChange={(e) => setDefault("maxDelaySeconds", Number(e.target.value))}
                  className={input}
                />
              </div>
            </label>
            <label className="text-sm font-medium text-foreground">
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

      <button onClick={save} disabled={busy} className="btn-primary mt-6 px-5 py-2.5 text-sm disabled:opacity-50">
        {busy ? "Saving…" : "Save settings"}
      </button>
    </div>
  );
}
