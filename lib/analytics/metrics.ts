/**
 * Pure analytics aggregations over campaign recipients. No I/O, no open
 * tracking — everything is derived from send/reply/bounce timestamps the app
 * already stores, so this is unit-testable and cheap.
 */

export interface RecipientPoint {
  initialSentAt: number | null;
  repliedAt: number | null;
  bouncedAt: number | null;
  unsubscribedAt: number | null;
}

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

/** Local hour (0–23) and weekday (0=Sun … 6=Sat) of a timestamp in a tz. */
function localHourWeekday(at: number, timezone: string): { hour: number; weekday: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "short",
    hour: "2-digit",
    hour12: false,
  }).formatToParts(new Date(at));
  const weekdayStr = parts.find((p) => p.type === "weekday")?.value ?? "Sun";
  const hourStr = parts.find((p) => p.type === "hour")?.value ?? "0";
  const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return { hour: Number(hourStr) % 24, weekday: Math.max(0, weekdays.indexOf(weekdayStr)) };
}

function localDayKey(at: number, timezone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(at));
}

export interface Totals {
  sent: number;
  replied: number;
  bounced: number;
  unsubscribed: number;
  replyRate: number; // 0–100
  bounceRate: number;
  unsubscribeRate: number;
}

export function totals(points: RecipientPoint[]): Totals {
  const sent = points.filter((p) => p.initialSentAt !== null).length;
  const replied = points.filter((p) => p.repliedAt !== null).length;
  const bounced = points.filter((p) => p.bouncedAt !== null).length;
  const unsubscribed = points.filter((p) => p.unsubscribedAt !== null).length;
  const rate = (n: number) => (sent > 0 ? (n / sent) * 100 : 0);
  return {
    sent,
    replied,
    bounced,
    unsubscribed,
    replyRate: rate(replied),
    bounceRate: rate(bounced),
    unsubscribeRate: rate(unsubscribed),
  };
}

export interface TimeToReply {
  count: number;
  averageMs: number | null;
  medianMs: number | null;
  buckets: { under1h: number; under1d: number; under3d: number; later: number };
}

export function timeToReply(points: RecipientPoint[]): TimeToReply {
  const deltas = points
    .filter((p) => p.initialSentAt !== null && p.repliedAt !== null && p.repliedAt >= p.initialSentAt)
    .map((p) => (p.repliedAt as number) - (p.initialSentAt as number));

  if (deltas.length === 0) {
    return { count: 0, averageMs: null, medianMs: null, buckets: { under1h: 0, under1d: 0, under3d: 0, later: 0 } };
  }
  deltas.sort((a, b) => a - b);
  const sum = deltas.reduce((a, b) => a + b, 0);
  const mid = Math.floor(deltas.length / 2);
  const median = deltas.length % 2 ? deltas[mid] : (deltas[mid - 1] + deltas[mid]) / 2;
  const buckets = { under1h: 0, under1d: 0, under3d: 0, later: 0 };
  for (const d of deltas) {
    if (d < HOUR) buckets.under1h++;
    else if (d < DAY) buckets.under1d++;
    else if (d < 3 * DAY) buckets.under3d++;
    else buckets.later++;
  }
  return { count: deltas.length, averageMs: sum / deltas.length, medianMs: median, buckets };
}

/** 7×24 grid (weekday × hour) counting when replies land, in the given tz. */
export function replyHeatmap(points: RecipientPoint[], timezone: string): number[][] {
  const grid: number[][] = Array.from({ length: 7 }, () => new Array(24).fill(0));
  for (const p of points) {
    if (p.repliedAt === null) continue;
    const { hour, weekday } = localHourWeekday(p.repliedAt, timezone);
    grid[weekday][hour]++;
  }
  return grid;
}

/** Reply rate grouped by the local hour an email was sent (best send time). */
export function bestSendTimes(
  points: RecipientPoint[],
  timezone: string
): Array<{ hour: number; sent: number; replied: number; rate: number }> {
  const bySent = new Map<number, { sent: number; replied: number }>();
  for (const p of points) {
    if (p.initialSentAt === null) continue;
    const { hour } = localHourWeekday(p.initialSentAt, timezone);
    const cur = bySent.get(hour) ?? { sent: 0, replied: 0 };
    cur.sent++;
    if (p.repliedAt !== null) cur.replied++;
    bySent.set(hour, cur);
  }
  return [...bySent.entries()]
    .map(([hour, v]) => ({ hour, sent: v.sent, replied: v.replied, rate: v.sent > 0 ? (v.replied / v.sent) * 100 : 0 }))
    .sort((a, b) => a.hour - b.hour);
}

/** Sent & replied counts per local day for the last `days` days. */
export function dailyTrend(
  points: RecipientPoint[],
  timezone: string,
  days = 30,
  now = Date.now()
): Array<{ day: string; sent: number; replied: number }> {
  const out: Array<{ day: string; sent: number; replied: number }> = [];
  const index = new Map<string, { sent: number; replied: number }>();
  for (let i = days - 1; i >= 0; i--) {
    const key = localDayKey(now - i * DAY, timezone);
    const row = { sent: 0, replied: 0 };
    index.set(key, row);
    out.push({ day: key, ...row });
  }
  for (const p of points) {
    if (p.initialSentAt !== null) {
      const row = index.get(localDayKey(p.initialSentAt, timezone));
      if (row) row.sent++;
    }
    if (p.repliedAt !== null) {
      const row = index.get(localDayKey(p.repliedAt, timezone));
      if (row) row.replied++;
    }
  }
  // Reflect the mutated rows back into the ordered output.
  return out.map((o) => ({ day: o.day, ...(index.get(o.day) as { sent: number; replied: number }) }));
}

/** Format a duration for humans: "2h 15m", "3d", "45m". */
export function formatDuration(ms: number | null): string {
  if (ms === null) return "—";
  if (ms < HOUR) return `${Math.max(1, Math.round(ms / (60 * 1000)))}m`;
  if (ms < DAY) {
    const h = Math.floor(ms / HOUR);
    const m = Math.round((ms % HOUR) / (60 * 1000));
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  }
  const d = Math.floor(ms / DAY);
  const h = Math.round((ms % DAY) / HOUR);
  return h > 0 ? `${d}d ${h}h` : `${d}d`;
}

/** "12.3%" — shared percent formatting for KPI surfaces. */
export function formatPercent(n: number): string {
  return `${n.toFixed(1)}%`;
}
