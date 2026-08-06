import { describe, expect, it } from "vitest";
import {
  assessInbox,
  describeInbox,
  inboxForFollowUp,
  inboxWarmupCap,
  poolCapacity,
  selectInbox,
  withResolvedPrimary,
  type InboxCandidate,
} from "@/lib/sending/inboxPool";
import { DEFAULT_BOUNCE_GUARD } from "@/lib/campaigns/bounceGuard";

const DAY = 24 * 60 * 60 * 1000;
const NOW = 1_800_000_000_000;
const OPTS = { now: NOW, thresholds: DEFAULT_BOUNCE_GUARD };

/** A fully warm, healthy, idle inbox. Every test starts from this and breaks one thing. */
function inbox(over: Partial<InboxCandidate> = {}): InboxCandidate {
  return {
    connectionId: "c1",
    connectedEmail: "alex@acme.com",
    label: "",
    status: "CONNECTED",
    paused: false,
    primary: true,
    connectedAt: NOW - 90 * DAY,
    lifetimeSends: 5_000,
    sentToday: 0,
    sentCount: 5_000,
    bounceCount: 10,
    dailyLimit: null,
    ...over,
  };
}

describe("inboxWarmupCap", () => {
  it("leaves a genuinely warm inbox unlimited", () => {
    expect(inboxWarmupCap({ connectedAt: NOW - 90 * DAY, lifetimeSends: 5000 }, NOW)).toBe(
      Number.POSITIVE_INFINITY
    );
  });

  it("ramps a brand-new inbox by age", () => {
    for (const [days, cap] of [
      [0, 20],
      [3, 40],
      [7, 60],
      [14, 100],
      [21, 150],
    ] as const) {
      expect(
        inboxWarmupCap({ connectedAt: NOW - days * DAY, lifetimeSends: 10_000 }, NOW),
        `day ${days}`
      ).toBe(cap);
    }
  });

  it("refuses to call an old but unused inbox warm", () => {
    // The gap this closes: connected five weeks ago, never sent a single email,
    // and the age-only ramp would have let it send 150 cold emails on its
    // genuine first day of activity.
    expect(inboxWarmupCap({ connectedAt: NOW - 40 * DAY, lifetimeSends: 0 }, NOW)).toBe(20);
    expect(inboxWarmupCap({ connectedAt: NOW - 40 * DAY, lifetimeSends: 6 }, NOW)).toBe(40);
    expect(inboxWarmupCap({ connectedAt: NOW - 40 * DAY, lifetimeSends: 20 }, NOW)).toBe(60);
    expect(inboxWarmupCap({ connectedAt: NOW - 40 * DAY, lifetimeSends: 50 }, NOW)).toBe(100);
    expect(inboxWarmupCap({ connectedAt: NOW - 40 * DAY, lifetimeSends: 120 }, NOW)).toBe(150);
    expect(inboxWarmupCap({ connectedAt: NOW - 40 * DAY, lifetimeSends: 400 }, NOW)).toBe(
      Number.POSITIVE_INFINITY
    );
  });

  it("always takes the stricter of age and history", () => {
    // Plenty of history but connected today: age still governs.
    expect(inboxWarmupCap({ connectedAt: NOW, lifetimeSends: 10_000 }, NOW)).toBe(20);
  });

  it("treats a missing or nonsense history as none", () => {
    for (const lifetimeSends of [Number.NaN, -5, undefined as unknown as number]) {
      expect(inboxWarmupCap({ connectedAt: NOW - 90 * DAY, lifetimeSends }, NOW)).toBe(20);
    }
  });
});

describe("assessInbox", () => {
  it("passes a healthy warm idle inbox", () => {
    const a = assessInbox(inbox(), OPTS);
    expect(a.usable).toBe(true);
    expect(a.skipReason).toBeNull();
    expect(a.remaining).toBe(Number.POSITIVE_INFINITY);
  });

  it("skips a revoked or expired connection with a fixable message", () => {
    for (const status of ["REVOKED", "NEEDS_RECONNECT"] as const) {
      const a = assessInbox(inbox({ status }), OPTS);
      expect(a.usable, status).toBe(false);
      expect(a.skipReason, status).toBe(status);
      expect(a.detail, status).toMatch(/reconnect/i);
    }
  });

  it("skips a paused inbox but promises its history is kept", () => {
    const a = assessInbox(inbox({ paused: true }), OPTS);
    expect(a.skipReason).toBe("PAUSED");
    expect(a.detail).toMatch(/kept/i);
  });

  it("brakes an inbox on its own bounce rate, not a campaign's", () => {
    // 6% of 500, above the 5% stop threshold.
    const a = assessInbox(inbox({ sentCount: 500, bounceCount: 30 }), OPTS);
    expect(a.usable).toBe(false);
    expect(a.skipReason).toBe("BOUNCE_BRAKE");
  });

  it("does not brake on a rate computed from too few sends", () => {
    // One bounce out of three is 33% and means nothing.
    expect(assessInbox(inbox({ sentCount: 3, bounceCount: 1 }), OPTS).usable).toBe(true);
  });

  it("stops an inbox that has used today's allowance", () => {
    const a = assessInbox(inbox({ connectedAt: NOW - 1 * DAY, lifetimeSends: 30, sentToday: 40 }), OPTS);
    expect(a.usable).toBe(false);
    expect(a.skipReason).toBe("DAILY_CAP_REACHED");
    expect(a.remaining).toBe(0);
  });

  it("honours a customer's own lower limit for one inbox", () => {
    const a = assessInbox(inbox({ dailyLimit: 25, sentToday: 10 }), OPTS);
    expect(a.remaining).toBe(15);
    expect(a.dailyCap).toBe(25);
  });

  it("never lets a per-inbox limit raise a warmup ceiling", () => {
    // Asking for 500 a day on a two-day-old inbox must not get 500.
    const a = assessInbox(inbox({ connectedAt: NOW - 2 * DAY, lifetimeSends: 5, dailyLimit: 500 }), OPTS);
    expect(a.dailyCap).toBe(20);
  });

  it("never reports negative headroom from a counter that overshot", () => {
    const a = assessInbox(inbox({ dailyLimit: 10, sentToday: 99 }), OPTS);
    expect(a.remaining).toBe(0);
  });

  it("excludes an inbox the campaign did not choose", () => {
    const a = assessInbox(inbox({ connectionId: "c9" }), { ...OPTS, allowed: ["c1", "c2"] });
    expect(a.skipReason).toBe("NOT_SELECTED_FOR_CAMPAIGN");
  });

  it("treats an empty allow-list as no restriction", () => {
    expect(assessInbox(inbox(), { ...OPTS, allowed: [] }).usable).toBe(true);
  });
});

describe("selectInbox", () => {
  it("spreads load by choosing the least-used inbox today", () => {
    // Filling one inbox to its ceiling before touching the next produces
    // exactly the spiky per-address pattern rotation exists to avoid.
    const chosen = selectInbox(
      [
        inbox({ connectionId: "a", sentToday: 40 }),
        inbox({ connectionId: "b", sentToday: 5, primary: false }),
        inbox({ connectionId: "c", sentToday: 22, primary: false }),
      ],
      OPTS
    );
    expect(chosen.chosen?.candidate.connectionId).toBe("b");
  });

  it("rotates in practice across repeated picks", () => {
    // Simulating the real loop: pick, increment, pick again. Three equal
    // inboxes must end up with the day split three ways, not one carrying it.
    const pool = [
      inbox({ connectionId: "a", sentToday: 0 }),
      inbox({ connectionId: "b", sentToday: 0, primary: false }),
      inbox({ connectionId: "c", sentToday: 0, primary: false }),
    ];
    const counts: Record<string, number> = { a: 0, b: 0, c: 0 };
    for (let i = 0; i < 30; i += 1) {
      const picked = selectInbox(pool, OPTS).chosen;
      expect(picked).not.toBeNull();
      const id = picked!.candidate.connectionId;
      counts[id] += 1;
      const target = pool.find((p) => p.connectionId === id)!;
      target.sentToday += 1;
    }
    expect(counts).toEqual({ a: 10, b: 10, c: 10 });
  });

  it("breaks ties toward primary, then deterministically", () => {
    const first = selectInbox(
      [
        inbox({ connectionId: "z", primary: false }),
        inbox({ connectionId: "m", primary: true }),
        inbox({ connectionId: "a", primary: false }),
      ],
      OPTS
    );
    expect(first.chosen?.candidate.connectionId).toBe("m");

    // With no primary, the order is still stable rather than incidental: a
    // non-deterministic pick makes a bug here unreproducible from a report.
    const second = selectInbox(
      [inbox({ connectionId: "z", primary: false }), inbox({ connectionId: "a", primary: false })],
      OPTS
    );
    expect(second.chosen?.candidate.connectionId).toBe("a");
  });

  it("skips unhealthy inboxes and uses a healthy one", () => {
    const chosen = selectInbox(
      [
        inbox({ connectionId: "dead", status: "REVOKED" }),
        inbox({ connectionId: "stale", status: "NEEDS_RECONNECT", primary: false }),
        inbox({ connectionId: "good", primary: false, sentToday: 90 }),
      ],
      OPTS
    );
    expect(chosen.chosen?.candidate.connectionId).toBe("good");
  });

  it("reports the fixable reason when nothing can send", () => {
    // "Reconnect Gmail" is actionable; "daily cap reached" only says wait, so
    // it must not mask the one the customer can do something about.
    const blocked = selectInbox(
      [
        inbox({ connectionId: "capped", dailyLimit: 5, sentToday: 5 }),
        inbox({ connectionId: "stale", status: "NEEDS_RECONNECT", primary: false }),
      ],
      OPTS
    );
    expect(blocked.chosen).toBeNull();
    expect(blocked.blockedReason).toBe("NEEDS_RECONNECT");
  });

  it("says so plainly when there are no inboxes at all", () => {
    const none = selectInbox([], OPTS);
    expect(none.chosen).toBeNull();
    expect(none.blockedReason).toBe("NO_INBOXES");
  });

  it("never sends from an inbox outside the campaign's chosen senders", () => {
    // The failure this prevents is a customer's outreach leaving from an
    // address they deliberately excluded.
    const restricted = selectInbox(
      [
        inbox({ connectionId: "chosen", status: "NEEDS_RECONNECT" }),
        inbox({ connectionId: "other", primary: false }),
      ],
      { ...OPTS, allowed: ["chosen"] }
    );
    expect(restricted.chosen).toBeNull();
    expect(restricted.blockedReason).toBe("NEEDS_RECONNECT");
  });

  it("assesses every inbox even when one is chosen, for diagnostics", () => {
    const result = selectInbox([inbox({ connectionId: "a" }), inbox({ connectionId: "b" })], OPTS);
    expect(result.assessments).toHaveLength(2);
  });

  it("behaves exactly as a single-inbox account always has", () => {
    // The parity that makes this change safe to ship: one connected inbox, no
    // campaign restriction, and the only possible choice is that inbox.
    const solo = selectInbox([inbox({ connectionId: "primary" })], OPTS);
    expect(solo.chosen?.candidate.connectionId).toBe("primary");
    expect(solo.blockedReason).toBeNull();
  });
});

describe("poolCapacity", () => {
  it("adds up what the pool can still send today", () => {
    const capacity = poolCapacity(
      [
        inbox({ connectionId: "a", dailyLimit: 100, sentToday: 40 }),
        inbox({ connectionId: "b", dailyLimit: 100, sentToday: 10, primary: false }),
      ],
      OPTS
    );
    expect(capacity.usableInboxes).toBe(2);
    expect(capacity.remainingToday).toBe(150);
    expect(capacity.dailyCeiling).toBe(200);
  });

  it("counts nothing for inboxes that cannot send", () => {
    const capacity = poolCapacity(
      [
        inbox({ connectionId: "a", status: "REVOKED", dailyLimit: 100 }),
        inbox({ connectionId: "b", dailyLimit: 50, primary: false }),
      ],
      OPTS
    );
    expect(capacity.usableInboxes).toBe(1);
    expect(capacity.dailyCeiling).toBe(50);
  });

  it("is zero for an empty pool rather than undefined", () => {
    expect(poolCapacity([], OPTS)).toEqual({
      usableInboxes: 0,
      remainingToday: 0,
      dailyCeiling: 0,
    });
  });

  it("does not let an unlimited inbox poison the sum with Infinity", () => {
    // A ceiling reported as Infinity renders as nothing useful in the wizard.
    const capacity = poolCapacity(
      [inbox({ connectionId: "a" }), inbox({ connectionId: "b", dailyLimit: 50, primary: false })],
      OPTS
    );
    expect(Number.isFinite(capacity.dailyCeiling)).toBe(true);
    expect(capacity.dailyCeiling).toBe(50);
  });
});

describe("inboxForFollowUp", () => {
  const pool = [
    inbox({ connectionId: "original", sentToday: 90 }),
    inbox({ connectionId: "idle", sentToday: 0, primary: false }),
  ];

  it("keeps a threaded follow-up on the inbox that started the thread", () => {
    // A follow-up from a different address is not a follow-up: the recipient
    // sees a stranger replying inside their conversation, and Gmail will not
    // thread it. The busier original still wins over the idle alternative.
    const chosen = inboxForFollowUp(pool, "original", OPTS);
    expect(chosen.chosen?.candidate.connectionId).toBe("original");
  });

  it("waits rather than switching address mid-thread", () => {
    const blocked = inboxForFollowUp(
      [inbox({ connectionId: "original", dailyLimit: 5, sentToday: 5 }), inbox({ connectionId: "idle", primary: false })],
      "original",
      OPTS
    );
    expect(blocked.chosen).toBeNull();
    expect(blocked.blockedReason).toBe("DAILY_CAP_REACHED");
  });

  it("refuses when the original inbox is gone entirely", () => {
    const gone = inboxForFollowUp(pool, "deleted-connection", OPTS);
    expect(gone.chosen).toBeNull();
    expect(gone.blockedReason).toBe("REVOKED");
  });

  it("falls back to normal rotation for a campaign that predates rotation", () => {
    // Recipients sent before this feature existed have no recorded inbox.
    const chosen = inboxForFollowUp(pool, null, OPTS);
    expect(chosen.chosen?.candidate.connectionId).toBe("idle");
  });
});

describe("describeInbox", () => {
  it("prefers the customer's own label over the address", () => {
    const labelled = assessInbox(inbox({ label: "Alex, outbound" }), OPTS);
    expect(describeInbox(labelled)).toMatch(/^Alex, outbound:/);
  });

  it("falls back to the address when there is no label", () => {
    expect(describeInbox(assessInbox(inbox(), OPTS))).toMatch(/^alex@acme\.com:/);
  });
});

describe("withResolvedPrimary", () => {
  const conn = (
    connectionId: string,
    over: Partial<{ primary: boolean; status: "CONNECTED" | "NEEDS_RECONNECT" | "REVOKED"; createdAt: number }> = {}
  ) => ({
    connectionId,
    primary: false,
    status: "CONNECTED" as const,
    createdAt: NOW,
    ...over,
  });

  it("leaves a correct pool alone", () => {
    const pool = [conn("a", { primary: true }), conn("b")];
    expect(withResolvedPrimary(pool)).toEqual(pool);
  });

  it("adopts the legacy document as primary", () => {
    // The exact migration case: a single-inbox account whose connection was
    // written before the flag existed, so Zod parses it as primary: false.
    // Without this, the pool would have no default inbox at all.
    const resolved = withResolvedPrimary([
      conn("c-newer", { createdAt: NOW }),
      conn("primary", { createdAt: NOW - 10 * DAY }),
    ]);
    expect(resolved.find((c) => c.primary)?.connectionId).toBe("primary");
  });

  it("settles on exactly one when two claim it", () => {
    // Reachable through concurrent connects, and two primaries is as broken as
    // none: the send path would have no defined default either way.
    const resolved = withResolvedPrimary([
      conn("a", { primary: true }),
      conn("b", { primary: true }),
    ]);
    expect(resolved.filter((c) => c.primary)).toHaveLength(1);
  });

  it("prefers a connected inbox over an older broken one", () => {
    const resolved = withResolvedPrimary([
      conn("old-dead", { status: "REVOKED", createdAt: NOW - 100 * DAY }),
      conn("newer-alive", { createdAt: NOW - DAY }),
    ]);
    expect(resolved.find((c) => c.primary)?.connectionId).toBe("newer-alive");
  });

  it("falls back to the oldest when none is connected", () => {
    const resolved = withResolvedPrimary([
      conn("newer", { status: "REVOKED", createdAt: NOW }),
      conn("older", { status: "NEEDS_RECONNECT", createdAt: NOW - 30 * DAY }),
    ]);
    expect(resolved.find((c) => c.primary)?.connectionId).toBe("older");
  });

  it("always produces exactly one primary for any non-empty pool", () => {
    for (const pool of [
      [conn("a")],
      [conn("a"), conn("b")],
      [conn("a", { status: "REVOKED" }), conn("b", { status: "REVOKED" })],
      [conn("primary"), conn("b", { primary: true })],
    ]) {
      expect(withResolvedPrimary(pool).filter((c) => c.primary)).toHaveLength(1);
    }
  });

  it("returns nothing for an empty pool rather than inventing an inbox", () => {
    expect(withResolvedPrimary([])).toEqual([]);
  });

  it("does not mutate the input", () => {
    const pool = [conn("primary"), conn("b")];
    const snapshot = JSON.parse(JSON.stringify(pool));
    withResolvedPrimary(pool);
    expect(pool).toEqual(snapshot);
  });
});
