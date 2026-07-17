import type { CampaignStatus } from "@/schemas/campaign";

/** Friendly labels for non-technical users (spec §5). */
export const CAMPAIGN_STATUS_LABELS: Record<
  CampaignStatus,
  { label: string; className: string }
> = {
  DRAFT: { label: "Draft", className: "bg-slate-100 text-slate-600" },
  VALIDATING: { label: "Preparing", className: "bg-slate-100 text-slate-600" },
  READY: { label: "Ready", className: "bg-blue-100 text-blue-700" },
  PREPARING: { label: "Preparing", className: "bg-blue-100 text-blue-700" },
  ACTIVE: { label: "Sending", className: "bg-green-100 text-green-700" },
  PAUSED: { label: "Paused", className: "bg-amber-100 text-amber-700" },
  STOPPED: { label: "Stopped", className: "bg-slate-200 text-slate-600" },
  CANCELLED: { label: "Cancelled", className: "bg-slate-200 text-slate-600" },
  COMPLETED: { label: "Finished", className: "bg-green-100 text-green-700" },
  ERROR: { label: "Needs attention", className: "bg-red-100 text-red-700" },
};
