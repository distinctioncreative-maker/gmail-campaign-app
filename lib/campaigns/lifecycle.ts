import type { Campaign } from "@/schemas/campaign";

export type CampaignCollectionView = "active" | "archived" | "deleted";

export function isDeletedCampaign(
  campaign: Pick<Campaign, "deletedAt">
): boolean {
  return campaign.deletedAt !== null;
}

export function campaignsIncludedInWorkspaceStats<T extends Pick<Campaign, "deletedAt">>(
  campaigns: T[]
): T[] {
  return campaigns.filter((campaign) => !isDeletedCampaign(campaign));
}

export function campaignsForCollectionView<
  T extends Pick<Campaign, "archived" | "deletedAt">
>(campaigns: T[], view: CampaignCollectionView): T[] {
  if (view === "deleted") {
    return campaigns.filter((campaign) => campaign.deletedAt !== null);
  }
  if (view === "archived") {
    return campaigns.filter(
      (campaign) => campaign.deletedAt === null && campaign.archived
    );
  }
  return campaigns.filter(
    (campaign) => campaign.deletedAt === null && !campaign.archived
  );
}
