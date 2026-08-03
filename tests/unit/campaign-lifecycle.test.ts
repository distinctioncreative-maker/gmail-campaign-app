import { describe, expect, it } from "vitest";
import {
  campaignsForCollectionView,
  campaignsIncludedInWorkspaceStats,
} from "@/lib/campaigns/lifecycle";
import { readFileSync } from "node:fs";

const rows = [
  { campaignId: "active", archived: false, deletedAt: null },
  { campaignId: "archived", archived: true, deletedAt: null },
  { campaignId: "deleted", archived: true, deletedAt: 1_700_000_000_000 },
];

describe("campaign lifecycle views", () => {
  it("keeps deleted campaigns out of workspace totals while retaining archives", () => {
    expect(
      campaignsIncludedInWorkspaceStats(rows).map((row) => row.campaignId)
    ).toEqual(["active", "archived"]);
  });

  it("separates active, archived, and recently deleted collections", () => {
    expect(
      campaignsForCollectionView(rows, "active").map((row) => row.campaignId)
    ).toEqual(["active"]);
    expect(
      campaignsForCollectionView(rows, "archived").map((row) => row.campaignId)
    ).toEqual(["archived"]);
    expect(
      campaignsForCollectionView(rows, "deleted").map((row) => row.campaignId)
    ).toEqual(["deleted"]);
  });

  it("guards transactional launch claims against deleted drafts", () => {
    const repository = readFileSync(
      new URL("../../lib/repositories/campaigns.ts", import.meta.url),
      "utf8"
    );
    const claim = repository.match(
      /export async function claimCampaignLaunch[\s\S]*?export async function releaseCampaignLaunch/
    )?.[0];
    expect(claim).toContain("if (campaign.deletedAt !== null) return null");
  });
});
