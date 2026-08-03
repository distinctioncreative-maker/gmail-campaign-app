import { describe, expect, it } from "vitest";
import {
  managedTeamIds,
  orderTeamsByHierarchy,
  wouldCreateTeamCycle,
} from "@/lib/teams/hierarchy";
import { canManageTeamMembership, viewableUserIds } from "@/lib/teams/access";

const teams = [
  { teamId: "revenue", name: "Revenue", parentTeamId: null, leadUserId: "vp" },
  { teamId: "east", name: "East", parentTeamId: "revenue", leadUserId: "east-lead" },
  { teamId: "smb", name: "SMB", parentTeamId: "east", leadUserId: null },
  { teamId: "west", name: "West", parentTeamId: "revenue", leadUserId: "west-lead" },
];

describe("team hierarchy", () => {
  it("gives a parent-team manager explicit descendant visibility", () => {
    expect([...managedTeamIds("vp", teams)]).toEqual(["revenue", "east", "smb", "west"]);
    expect(canManageTeamMembership({ userId: "vp", role: "MANAGER" }, "smb", teams)).toBe(true);
    expect(
      viewableUserIds(
        { userId: "vp", role: "MANAGER" },
        teams,
        [
          { userId: "vp", teamId: "revenue" },
          { userId: "rep", teamId: "smb" },
          { userId: "outside", teamId: null },
        ]
      )
    ).toEqual(["vp", "rep"]);
  });

  it("prevents self-parenting and ancestor cycles", () => {
    expect(wouldCreateTeamCycle("revenue", "revenue", teams)).toBe(true);
    expect(wouldCreateTeamCycle("revenue", "smb", teams)).toBe(true);
    expect(wouldCreateTeamCycle("smb", "west", teams)).toBe(false);
    expect(wouldCreateTeamCycle("smb", null, teams)).toBe(false);
  });

  it("orders teams parent first with stable depths", () => {
    expect(orderTeamsByHierarchy(teams).map(({ team, depth }) => [team.teamId, depth])).toEqual([
      ["revenue", 0],
      ["east", 1],
      ["smb", 2],
      ["west", 1],
    ]);
  });
});
