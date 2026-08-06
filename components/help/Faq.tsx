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
        a: "Open the campaign and click “Diagnose this campaign”: it checks the most common causes in plain language: Gmail connected, required sender details filled in, a valid template, the background sending service, whether the campaign is running, whether it's inside your sending hours, whether the daily limit is reached, and any delivery errors. Fix whatever shows a red ✕ or amber !.",
      },
      {
        q: "It says “Daily limit reached: resumes tomorrow.” Can I send more today?",
        a: "Open “Adjust pace / daily limit” on the campaign page. You can raise the campaign limit only within your plan cap and after accepting any pacing warning. Cadence never treats Gmail's technical ceiling as a safe sending target. If the address or domain is new, wait for the next valid window instead of forcing a sudden spike.",
      },
      {
        q: "The campaign is “Active” but nothing is going out.",
        a: "Usually it's outside your sending window (default 9 AM to 8 PM on weekdays) or the daily cap is hit: the Diagnose panel will say which. If neither, check that Gmail is still connected in Settings; if your Google session expired, reconnect it and resume the campaign.",
      },
      {
        q: "Some emails show “Needs attention” / errors.",
        a: "That's a send that failed (often a temporary Gmail hiccup or an expired connection). Fix the cause if the Diagnose panel points to one, then click “Retry failed” on the campaign: it reschedules those with your normal pacing.",
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
        a: "Yes: when building a campaign you can pick multiple templates. The app rotates them across your recipients (A/B), and the campaign's report shows which template got more replies.",
      },
    ],
  },
  {
    heading: "Writing & variation",
    items: [
      {
        q: "How do I stop every email looking identical?",
        a: "Write alternatives in braces separated by a pipe: “{Hi|Hello|Hey} {{first_name}}, {quick question|one question} about {{business_name}}”. Each recipient gets one combination, chosen for them. The template editor shows how many distinct versions your email produces, so you can tell straight away that the syntax worked. This matters because providers cluster on message similarity: five hundred byte-identical bodies is a fingerprint, and varying the wording is one of the few deliverability levers that costs nothing.",
      },
      {
        q: "Will the same lead get different wording if a send is retried?",
        a: "No. The version is chosen from the lead and the follow-up step, so it is the same every time. A retry after a delivery hiccup sends the identical email rather than a second, differently worded one. It also means the preview you see is the email that goes out.",
      },
      {
        q: "Can I use braces inside a spun option?",
        a: "Yes. Placeholders keep working inside options ({Hi {{first_name}}|Hello there}), and you can nest groups ({Hi {there|friend}|Hello}). Lead data is never treated as syntax, so a company genuinely named with braces in it comes through exactly as typed.",
      },
    ],
  },
  {
    heading: "Gmail, safety & deliverability",
    items: [
      {
        q: "Where do my emails send from?",
        a: "Your own connected Gmail account: they look exactly like emails you sent yourself, with your real address and signature. Replies land in your normal inbox.",
      },
      {
        q: "What is test mode?",
        a: "A safe mode where every email goes only to your test address with [TEST] in the subject, so you can practice without emailing real people. An admin turns on real sending when the team is ready: it's per organization.",
      },
      {
        q: "How do I keep good deliverability?",
        a: "Send at a human pace (the pacing presets handle this), keep lists clean, and treat replies as your main signal. Avoid huge blasts from a cold account; warm up gradually. Open/click tracking is available but off by default: turning it on adds a tracking pixel and rewrites links, which is a known deliverability tradeoff, so only enable it when you specifically need the numbers.",
      },
      {
        q: "How many emails should I send per day?",
        a: "There is no single deliverability-safe number. Google Workspace technical limits can be much higher than the volume a new sender should use. Start with the Conservative preset, use a clean and relevant list, send consistently rather than in bursts, and increase only while replies, bounces, complaints, and domain reputation stay healthy. A technical provider limit is a ceiling, not a recommendation.",
      },
      {
        q: "Do you track open rates?",
        a: "Only if you turn it on. It's opt-in per campaign (off by default) in the wizard's Schedule step, because a tracking pixel and rewritten links can lower inbox placement. When it's on, open and click rates show up on Reports and as raw counts on that campaign's page. Replies and bounces are tracked automatically either way and are the more reliable signal.",
      },
      {
        q: "Why did I get only one open notification?",
        a: "Cadence creates one notification for the first detected open per recipient so privacy preloading and repeated image loads do not flood your notification center. An open means the tracking pixel loaded; it does not prove that a person read the message. A reply or tracked click is a stronger engagement signal.",
      },
      {
        q: "How do I see results for one campaign?",
        a: "Open Reports and choose the campaign from the Campaign filter. The headline cards, funnel, timing analysis, tracked engagement, and comparison table update to that campaign. You can also use “View report” from the campaign detail page.",
      },
      {
        q: "Can I add SMTP accounts or rotate across several inboxes?",
        a: "Not in the current release. Cadence sends through one explicitly connected Gmail account for each user and keeps provider and plan caps enforced. Multi-inbox sending needs account-level reputation controls, isolated quotas, clear ownership, and safe routing before it can be offered responsibly.",
      },
      {
        q: "Someone replied but my reply rate still shows 0%.",
        a: "Replies are detected on a background sweep, so there can be a delay. Hit 'Scan for replies' on the Replies or Reports page to check right now: it also backfills every lead's engagement stats. If it still finds nothing: the reply must be in the same Gmail thread as your sent email (a brand-new email from them won't auto-link), and your Gmail connection needs read access: reconnect in Settings if it was connected a long time ago.",
      },
      {
        q: "What can my Team Lead or admin see of my work?",
        a: "Your Team Lead (and admins) can see your campaign performance: what you sent, who replied, statuses: to help coach. They cannot edit or send anything as you, and other reps see none of your data. Your leads, notes, and templates stay yours.",
      },
    ],
  },
  {
    heading: "Account & access",
    items: [
      {
        q: "How do I switch accounts or sign out?",
        a: "On a computer, use the account control at the bottom of the left sidebar. On a phone, open More and use the account control at the bottom of the sheet. Choose Switch account to open Google's account chooser, or Sign out to end both your Cadence server session and browser session. Disconnect Gmail in Settings only revokes campaign access; it does not sign you out of Cadence.",
      },
      {
        q: "Is there a faster way to get around than clicking?",
        a: "Press Cmd-K (Ctrl-K on Windows and Linux) anywhere in the app to open search. Type a few letters of a campaign, template, or follow-up name and press Enter to jump straight there, or type what you want to do (“new campaign”, “import”, “csv”, “dkim”) and it finds the right screen. Arrow keys move, Enter opens, Escape closes, so you never need the mouse. Leads match from the start of an email address or company name rather than anywhere inside it.",
      },
      {
        q: "How do I export or delete my data?",
        a: "Both are in Settings and neither needs a request to us. Export downloads your leads, campaigns, sending history, Do Not Email list, templates, and follow-ups as CSV, plus your campaign settings as JSON. Delete schedules your account (or, if you are an admin, the whole workspace) for removal after 30 days, and you can cancel any time inside that window. When it runs it also revokes Cadence's access to your Gmail with Google.",
      },
    ],
  },
];

export function Faq({ query = "" }: { query?: string }) {
  const q = query.trim().toLowerCase();
  const sections = SECTIONS.map((section) => ({
    heading: section.heading,
    items: section.items.filter((item) => !q || `${item.q} ${item.a}`.toLowerCase().includes(q)),
  })).filter((section) => section.items.length > 0);

  if (q && sections.length === 0) {
    return <p className="text-sm text-muted">No answers match &ldquo;{query}&rdquo;.</p>;
  }

  return (
    <div className="space-y-6">
      {sections.map((section) => (
        <div key={section.heading}>
          <h3 className="mb-2 text-sm font-semibold text-muted">{section.heading}</h3>
          <div className="card divide-y divide-border">
            {section.items.map((item) => (
              <details key={item.q} className="group p-4" open={q ? true : undefined}>
                <summary className="flex cursor-pointer list-none items-start gap-2 font-medium text-foreground marker:content-none">
                  <span className="mt-0.5 text-muted transition group-open:rotate-45">＋</span>
                  <span>{item.q}</span>
                </summary>
                <p className="mt-2 pl-6 text-sm leading-relaxed text-muted">{item.a}</p>
              </details>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
