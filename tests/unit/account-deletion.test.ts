import { describe, expect, it } from "vitest";
import {
  assessDeletion,
  daysRemaining,
  describeRemaining,
  GRACE_PERIOD_MS,
  isDue,
  purgeDueAt,
  type DeletionSubject,
} from "@/lib/account/eligibility";

const DAY = 24 * 60 * 60 * 1000;

function subject(over: Partial<DeletionSubject> = {}): DeletionSubject {
  return {
    role: "SALES_REP",
    tenantType: "WORKSPACE",
    memberCount: 5,
    adminCount: 2,
    ...over,
  };
}

describe("assessDeletion", () => {
  it("lets an ordinary member delete their own account", () => {
    const verdict = assessDeletion(subject(), "ACCOUNT");
    expect(verdict.allowed).toBe(true);
    expect(verdict.effectiveScope).toBe("ACCOUNT");
  });

  it("refuses to strand a workspace without an admin", () => {
    // The failure this prevents is not a lost account, it is an organization
    // left with members, campaigns, and billing that nobody can administer
    // and no in-product way to fix.
    const verdict = assessDeletion(
      subject({ role: "ADMIN", adminCount: 1, memberCount: 4 }),
      "ACCOUNT"
    );
    expect(verdict.allowed).toBe(false);
    expect(verdict.reason).toMatch(/only admin/i);
    // A refusal has to say what to do instead, or it is just a wall.
    expect(verdict.reason).toMatch(/admin first|delete the whole workspace/i);
  });

  it("lets an admin go when another admin remains", () => {
    expect(
      assessDeletion(subject({ role: "ADMIN", adminCount: 2 }), "ACCOUNT").allowed
    ).toBe(true);
  });

  it("treats a solo workspace as one and the same thing", () => {
    // Deleting the only person but keeping the org would leave an empty
    // organization behind on every consumer deletion.
    for (const only of [
      subject({ tenantType: "CONSUMER", role: "ADMIN", memberCount: 1, adminCount: 1 }),
      subject({ tenantType: "WORKSPACE", role: "ADMIN", memberCount: 1, adminCount: 1 }),
    ]) {
      const verdict = assessDeletion(only, "ACCOUNT");
      expect(verdict.allowed).toBe(true);
      expect(verdict.effectiveScope).toBe("WORKSPACE");
    }
  });

  it("collapses to workspace scope even for a lone non-admin", () => {
    // A one-member org whose only member somehow is not an admin is still a
    // one-member org: leaving it behind serves nobody.
    const verdict = assessDeletion(
      subject({ role: "SALES_REP", memberCount: 1, adminCount: 0 }),
      "ACCOUNT"
    );
    expect(verdict.effectiveScope).toBe("WORKSPACE");
  });

  it("keeps workspace deletion to admins", () => {
    for (const role of ["SALES_REP", "MANAGER"] as const) {
      const verdict = assessDeletion(subject({ role }), "WORKSPACE");
      expect(verdict.allowed, role).toBe(false);
      expect(verdict.reason).toMatch(/only an admin/i);
    }
    expect(assessDeletion(subject({ role: "ADMIN" }), "WORKSPACE").allowed).toBe(true);
  });

  it("spells out that a workspace deletion takes everyone with it", () => {
    const verdict = assessDeletion(subject({ role: "ADMIN" }), "WORKSPACE");
    expect(verdict.reason).toMatch(/every member/i);
  });
});

describe("the grace period", () => {
  it("is thirty days from the request", () => {
    const now = 1_700_000_000_000;
    expect(purgeDueAt(now)).toBe(now + 30 * DAY);
    expect(GRACE_PERIOD_MS).toBe(30 * DAY);
  });

  it("never purges before the period has fully elapsed", () => {
    const now = 1_700_000_000_000;
    const due = purgeDueAt(now);
    expect(isDue(due, now)).toBe(false);
    expect(isDue(due, due)).toBe(false);
    expect(isDue(due, due - 1)).toBe(false);
    expect(isDue(due, due + 1)).toBe(true);
  });

  it("does not purge a request created and swept in the same instant", () => {
    // The one thing the grace period exists to prevent. A >= comparison here
    // would destroy an account the moment the sweep happened to run.
    const now = 1_700_000_000_000;
    expect(isDue(purgeDueAt(now), now)).toBe(false);
  });

  it("counts whole days down, and never below zero", () => {
    const due = 1_700_000_000_000;
    expect(daysRemaining(due, due - 30 * DAY)).toBe(30);
    expect(daysRemaining(due, due - DAY - 1)).toBe(1);
    expect(daysRemaining(due, due - DAY + 1)).toBe(0);
    expect(daysRemaining(due, due)).toBe(0);
    // Overdue is still zero, not a negative countdown on someone's screen.
    expect(daysRemaining(due, due + 10 * DAY)).toBe(0);
  });

  it("reads correctly in every phase, including the singular", () => {
    const due = 1_700_000_000_000;
    expect(describeRemaining(due, due - 30 * DAY)).toBe("Deletion runs in 30 days.");
    expect(describeRemaining(due, due - 2 * DAY)).toBe("Deletion runs in 2 days.");
    expect(describeRemaining(due, due - DAY - 1)).toBe("Deletion runs in 1 day.");
    expect(describeRemaining(due, due)).toBe("Deletion runs within a day.");
  });
});
