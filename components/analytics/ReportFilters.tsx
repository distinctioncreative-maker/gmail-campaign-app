"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";

export interface ReportCampaignOption {
  campaignId: string;
  name: string;
  statusLabel: string;
}

export function ReportFilters({
  campaigns,
  selectedCampaignId,
  rangeDays,
}: {
  campaigns: ReportCampaignOption[];
  selectedCampaignId: string;
  rangeDays: number;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function navigate(campaignId: string, days: number) {
    const params = new URLSearchParams();
    if (campaignId) params.set("campaign", campaignId);
    params.set("range", String(days));
    startTransition(() => {
      router.replace(`/reports?${params.toString()}`, { scroll: false });
    });
  }

  return (
    <div className="card p-5 sm:p-6 mb-6 grid gap-4 sm:grid-cols-[minmax(0,1fr)_12rem_auto] sm:items-end">
      <label className="block text-sm font-medium text-foreground">
        Campaign
        <select
          value={selectedCampaignId}
          onChange={(event) => navigate(event.target.value, rangeDays)}
          disabled={pending}
          className="mt-1.5 w-full disabled:opacity-60"
        >
          <option value="">All campaigns</option>
          {campaigns.map((campaign) => (
            <option key={campaign.campaignId} value={campaign.campaignId}>
              {campaign.name} ({campaign.statusLabel})
            </option>
          ))}
        </select>
      </label>

      <label className="block text-sm font-medium text-foreground">
        Analysis period
        <select
          value={rangeDays}
          onChange={(event) =>
            navigate(selectedCampaignId, Number(event.target.value))
          }
          disabled={pending}
          className="mt-1.5 w-full disabled:opacity-60"
        >
          <option value={30}>Last 30 days</option>
          <option value={90}>Last 90 days</option>
          <option value={365}>Last 12 months</option>
        </select>
      </label>

      <p className="pb-2 text-xs leading-relaxed text-muted">
        {pending
          ? "Updating report..."
          : "Headline totals are all time. Timing charts use leads first sent in this period."}
      </p>
    </div>
  );
}
