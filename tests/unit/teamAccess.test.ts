import { describe, expect, it } from "vitest";
import {
  canManageTeamMembership,
  canViewRep,
  ledTeamIds,
  viewableUserIds,
} from "@/lib/teams/access";

const teams = [
  { teamId: "t1", leadUserId: "lead1" },
  { teamId: "t2", leadUserId: "lead2" },
  { teamId: "t3", leadUserId: null },
];
const members = [
  { userId: "admin", teamId: null },
  { userId: "lead1", teamId: "t1" },
  { userId: "lead2", teamId: "t2" },
  { userId: "repA", teamId: "t1" },
  { userId: "repB", teamId: "t2" },
  { userId: "repFree", teamId: null },
];

describe("ledTeamIds", () => {
  it("returns only teams the user leads", () => {
    expect(ledTeamIds("lead1", teams)).toEqual(["t1"]);
    expect(ledTeamIds("repA", teams)).toEqual([]);
  });
});

describe("viewableUserIds", () => {
  it("admin sees everyone", () => {
    expect(viewableUserIds({ userId: "admin", role: "ADMIN" }, teams, members)).toHaveLength(6);
  });
  it("a team lead sees their team plus themself, not other teams", () => {
    const ids = viewableUserIds({ userId: "lead1", role: "MANAGER" }, teams, members);
    expect(ids.sort()).toEqual(["lead1", "repA"]);
  });
  it("a manager leading no team sees only themself", () => {
    expect(viewableUserIds({ userId: "repFree", role: "MANAGER" }, teams, members)).toEqual([
      "repFree",
    ]);
  });
  it("a rep sees only themself", () => {
    expect(viewableUserIds({ userId: "repA", role: "SALES_REP" }, teams, members)).toEqual(["repA"]);
  });
});

describe("canViewRep", () => {
  it("lead can drill into their own rep but not another team's", () => {
    expect(canViewRep({ userId: "lead1", role: "MANAGER" }, "repA", teams, members)).toBe(true);
    expect(canViewRep({ userId: "lead1", role: "MANAGER" }, "repB", teams, members)).toBe(false);
    expect(canViewRep({ userId: "lead1", role: "MANAGER" }, "repFree", teams, members)).toBe(false);
  });
  it("admin can drill into anyone", () => {
    expect(canViewRep({ userId: "admin", role: "ADMIN" }, "repB", teams, members)).toBe(true);
  });
});

describe("canManageTeamMembership", () => {
  it("admin manages any team; leads manage only their own; reps none", () => {
    expect(canManageTeamMembership({ userId: "admin", role: "ADMIN" }, "t2", teams)).toBe(true);
    expect(canManageTeamMembership({ userId: "lead1", role: "MANAGER" }, "t1", teams)).toBe(true);
    expect(canManageTeamMembership({ userId: "lead1", role: "MANAGER" }, "t2", teams)).toBe(false);
    expect(canManageTeamMembership({ userId: "repA", role: "SALES_REP" }, "t1", teams)).toBe(false);
  });
});
