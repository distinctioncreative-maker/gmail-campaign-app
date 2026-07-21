/**
 * Built-in "will this land in the inbox?" content analyzer. Pure and
 * unit-testable — deterministic heuristics over the email's subject + HTML,
 * no external service and no real sends. This is guidance, not a guarantee
 * of inbox placement.
 */

export type SpamStatus = "pass" | "warn" | "fail";

export interface SpamCheck {
  label: string;
  status: SpamStatus;
  detail: string;
  fix?: string;
  weight: number; // points deducted when this check warns/fails
}

export interface SpamResult {
  score: number; // 0–100 (higher = more inbox-friendly)
  grade: "A" | "B" | "C" | "D";
  verdict: string;
  checks: SpamCheck[];
}

export interface SpamInput {
  subject: string;
  html: string;
  /** True if the email includes an opt-out line (placeholder or literal). */
  hasUnsubscribe?: boolean;
  /** True if the email includes a physical mailing address. */
  hasPhysicalAddress?: boolean;
}

const TRIGGER_WORDS = [
  "free", "act now", "limited time", "urgent", "guarantee", "guaranteed",
  "risk-free", "risk free", "click here", "buy now", "order now", "winner",
  "congratulations", "cash", "$$$", "100% free", "no cost", "cheap",
  "discount", "offer expires", "once in a lifetime", "double your",
  "extra income", "make money", "earn extra", "no obligation", "prize",
  "credit card", "increase sales", "special promotion", "why pay more",
];

const SHORTENERS = ["bit.ly", "tinyurl.com", "goo.gl", "t.co", "ow.ly", "buff.ly", "is.gd"];

function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&[a-z]+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function countMatches(haystack: string, needles: string[]): string[] {
  const lower = haystack.toLowerCase();
  return needles.filter((n) => lower.includes(n));
}

function capsRatio(text: string): number {
  const words = text.split(/\s+/).filter((w) => /[a-z]/i.test(w));
  if (words.length === 0) return 0;
  const caps = words.filter((w) => w.length >= 3 && w === w.toUpperCase());
  return caps.length / words.length;
}

export function analyzeSpam(input: SpamInput): SpamResult {
  const subject = input.subject ?? "";
  const html = input.html ?? "";
  const text = stripHtml(html);
  const words = text.split(/\s+/).filter(Boolean);
  const wordCount = words.length;
  const links = (html.match(/<a\b[^>]*href=/gi) ?? []).length;
  const images = (html.match(/<img\b/gi) ?? []).length;

  const checks: SpamCheck[] = [];

  // 1. Spam trigger words
  const triggers = [...new Set([...countMatches(subject, TRIGGER_WORDS), ...countMatches(text, TRIGGER_WORDS)])];
  checks.push(
    triggers.length === 0
      ? { label: "Spam trigger words", status: "pass", detail: "No common spam-flag phrases found.", weight: 0 }
      : {
          label: "Spam trigger words",
          status: triggers.length >= 3 ? "fail" : "warn",
          detail: `Found ${triggers.length}: ${triggers.slice(0, 5).map((t) => `“${t}”`).join(", ")}.`,
          fix: "Rewrite these in plain, personal language — they read as marketing to spam filters.",
          weight: Math.min(24, triggers.length * 6),
        }
  );

  // 2. Subject: ALL CAPS
  const subjCaps = capsRatio(subject);
  checks.push(
    subjCaps < 0.3
      ? { label: "Subject casing", status: "pass", detail: "Subject uses normal capitalization.", weight: 0 }
      : {
          label: "Subject casing",
          status: subjCaps > 0.6 ? "fail" : "warn",
          detail: "Subject has a lot of ALL-CAPS words.",
          fix: "Write the subject like a normal sentence — caps look shouty and spammy.",
          weight: subjCaps > 0.6 ? 12 : 6,
        }
  );

  // 3. Excessive punctuation / symbols
  const punct = (subject.match(/[!$]{2,}/g) ?? []).length + (subject.match(/!/g) ?? []).length >= 3 ? 1 : 0;
  checks.push(
    punct === 0
      ? { label: "Punctuation", status: "pass", detail: "No exclamation/symbol overload.", weight: 0 }
      : {
          label: "Punctuation",
          status: "warn",
          detail: "Subject has repeated ! or $ symbols.",
          fix: "Drop the extra exclamation points and $$$ — filters weight these heavily.",
          weight: 8,
        }
  );

  // 4. Subject length
  const subjLen = subject.trim().length;
  checks.push(
    subjLen >= 15 && subjLen <= 70
      ? { label: "Subject length", status: "pass", detail: `${subjLen} characters — a good length.`, weight: 0 }
      : {
          label: "Subject length",
          status: "warn",
          detail: subjLen < 15 ? "Subject is very short." : "Subject is quite long and may get cut off.",
          fix: "Aim for roughly 30–60 characters.",
          weight: 5,
        }
  );

  // 5. Text volume
  checks.push(
    wordCount >= 40
      ? { label: "Message length", status: "pass", detail: `${wordCount} words of text.`, weight: 0 }
      : {
          label: "Message length",
          status: wordCount < 15 ? "fail" : "warn",
          detail: `Only ${wordCount} words of real text.`,
          fix: "Thin, mostly-image emails look like spam. Add a few sentences of genuine text.",
          weight: wordCount < 15 ? 14 : 8,
        }
  );

  // 6. Image-to-text balance
  checks.push(
    images === 0 || wordCount >= images * 20
      ? { label: "Image balance", status: "pass", detail: images === 0 ? "No images." : "Healthy text-to-image ratio.", weight: 0 }
      : {
          label: "Image balance",
          status: "warn",
          detail: "Lots of images relative to text.",
          fix: "Image-heavy emails with little text often go to spam. Add more text.",
          weight: 10,
        }
  );

  // 7. Links
  checks.push(
    links <= 4
      ? { label: "Links", status: "pass", detail: `${links} link${links === 1 ? "" : "s"}.`, weight: 0 }
      : {
          label: "Links",
          status: links > 8 ? "fail" : "warn",
          detail: `${links} links — that's a lot for a personal email.`,
          fix: "Keep it to 1–3 links. Many links reads as bulk marketing.",
          weight: links > 8 ? 12 : 7,
        }
  );

  // 8. Shortened URLs
  const shorteners = SHORTENERS.filter((s) => html.toLowerCase().includes(s));
  checks.push(
    shorteners.length === 0
      ? { label: "Link domains", status: "pass", detail: "No shortened URLs.", weight: 0 }
      : {
          label: "Link domains",
          status: "fail",
          detail: `Uses link shorteners (${shorteners.join(", ")}).`,
          fix: "Use full, real URLs — shorteners are a strong spam signal.",
          weight: 12,
        }
  );

  // 9. Unsubscribe
  checks.push(
    input.hasUnsubscribe
      ? { label: "Opt-out line", status: "pass", detail: "An unsubscribe/opt-out line is present.", weight: 0 }
      : {
          label: "Opt-out line",
          status: "fail",
          detail: "No opt-out line found.",
          fix: "Add {{unsubscribe_text}} — it's legally required and improves deliverability.",
          weight: 14,
        }
  );

  // 10. Physical address
  checks.push(
    input.hasPhysicalAddress
      ? { label: "Mailing address", status: "pass", detail: "A physical mailing address is present.", weight: 0 }
      : {
          label: "Mailing address",
          status: "warn",
          detail: "No physical mailing address found.",
          fix: "Add {{physical_address}} — required by anti-spam law (CAN-SPAM).",
          weight: 8,
        }
  );

  const deductions = checks.reduce((sum, c) => sum + (c.status === "pass" ? 0 : c.weight), 0);
  const score = Math.max(0, Math.min(100, 100 - deductions));
  const grade = score >= 85 ? "A" : score >= 70 ? "B" : score >= 50 ? "C" : "D";
  const verdict =
    grade === "A"
      ? "Looks great — this should land in the inbox."
      : grade === "B"
        ? "Solid. A couple of small tweaks could help."
        : grade === "C"
          ? "Some spam signals — worth cleaning up before you send."
          : "High spam risk — fix the flagged items before sending.";

  // Sort worst-first so the important fixes surface at the top.
  const order: Record<SpamStatus, number> = { fail: 0, warn: 1, pass: 2 };
  checks.sort((a, b) => order[a.status] - order[b.status] || b.weight - a.weight);

  return { score, grade, verdict, checks };
}
