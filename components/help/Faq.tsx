interface QA {
  q: string;
  a: string;
}

const SECTIONS: Array<{ heading: string; items: QA[] }> = [
  {
    heading: "Sending & troubleshooting",
    items: [
      {
        q: "Why aren't my emails sending?",
        a: "Open the campaign and click “Diagnose this campaign” — it checks the most common causes in plain language: Gmail connected, required sender details filled in, a valid template, the background sending service, whether the campaign is running, whether it's inside your sending hours, whether the daily limit is reached, and any delivery errors. Fix whatever shows a red ✕ or amber !.",
      },
      {
        q: "It says “Daily limit reached — resumes tomorrow.” Can I send more today?",
        a: "Yes. On the campaign page open “Adjust pace / daily limit” and either raise the daily number, or click “Override today's limit — send the rest now.” That pulls the emails parked for tomorrow back to today. Be mindful: Gmail limits how much you can send per day, and sending too fast can hurt deliverability.",
      },
      {
        q: "The campaign is “Active” but nothing is going out.",
        a: "Usually it's outside your sending window (default 9am–8pm weekdays) or the daily cap is hit — the Diagnose panel will say which. If neither, check that Gmail is still connected in Settings; if your Google session expired, reconnect it and resume the campaign.",
      },
      {
        q: "Some emails show “Needs attention” / errors.",
        a: "That's a send that failed (often a temporary Gmail hiccup or an expired connection). Fix the cause if the Diagnose panel points to one, then click “Retry failed” on the campaign — it reschedules those with your normal pacing.",
      },
    ],
  },
  {
    heading: "Leads & campaigns",
    items: [
      {
        q: "Why were leads “excluded for safety”?",
        a: "A lead is skipped when it's on your Do Not Email list, opted out, already replied, previously bounced, has no valid email, or was contacted before (depending on the campaign's prior-contact setting). The recipient row shows the exact reason.",
      },
      {
        q: "I cancelled a campaign but the leads still show as “used.”",
        a: "Cancelling now automatically frees any lead it never actually emailed. For older campaigns, open the finished campaign and click “Free unused leads.” Leads that genuinely received an email stay marked (that's intended).",
      },
      {
        q: "What's the difference between cancel, stop, and delete?",
        a: "Pause = temporary halt (resume later). Stop / Cancel = permanently end an already-launched campaign; sent emails stay as a record. Delete = only available for draft campaigns that were never launched, and removes them entirely.",
      },
      {
        q: "Can I send more than one version of the email?",
        a: "Yes — when building a campaign you can pick multiple templates. The app rotates them across your recipients (A/B), and the campaign's report shows which template got more replies.",
      },
    ],
  },
  {
    heading: "Gmail, safety & deliverability",
    items: [
      {
        q: "Where do my emails send from?",
        a: "Your own connected Gmail account — they look exactly like emails you sent yourself, with your real address and signature. Replies land in your normal inbox.",
      },
      {
        q: "What is test mode?",
        a: "A safe mode where every email goes only to your test address with [TEST] in the subject, so you can practice without emailing real people. An admin turns on real sending when the team is ready — it's per organization.",
      },
      {
        q: "How do I keep good deliverability?",
        a: "Send at a human pace (the pacing presets handle this), keep lists clean, and expect replies — not opens — to be your signal. Avoid huge blasts from a cold account; warm up gradually. We deliberately don't track opens because tracking pixels hurt deliverability and the numbers are unreliable.",
      },
      {
        q: "Do you track open rates?",
        a: "No. Open tracking needs a hidden tracking pixel, which flags emails as marketing and is wildly inaccurate now (Apple/Gmail pre-load images). We track replies and bounces instead, which actually mean something.",
      },
      {
        q: "Someone replied but my reply rate still shows 0%.",
        a: "Replies are detected on a background sweep, so there can be a delay. Hit 'Scan for replies' on the Replies or Reports page to check right now — it also backfills every lead's engagement stats. If it still finds nothing: the reply must be in the same Gmail thread as your sent email (a brand-new email from them won't auto-link), and your Gmail connection needs read access — reconnect in Settings if it was connected a long time ago.",
      },
      {
        q: "What can my Team Lead or admin see of my work?",
        a: "Your Team Lead (and admins) can see your campaign performance — what you sent, who replied, statuses — to help coach. They cannot edit or send anything as you, and other reps see none of your data. Your leads, notes, and templates stay yours.",
      },
    ],
  },
];

export function Faq() {
  return (
    <div className="space-y-6">
      {SECTIONS.map((section) => (
        <div key={section.heading}>
          <h3 className="mb-2 text-sm font-semibold text-slate-500">{section.heading}</h3>
          <div className="card divide-y divide-border">
            {section.items.map((item) => (
              <details key={item.q} className="group p-4">
                <summary className="flex cursor-pointer list-none items-start gap-2 font-medium text-slate-800 marker:content-none">
                  <span className="mt-0.5 text-slate-400 transition group-open:rotate-45">＋</span>
                  <span>{item.q}</span>
                </summary>
                <p className="mt-2 pl-6 text-sm leading-relaxed text-slate-600">{item.a}</p>
              </details>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
