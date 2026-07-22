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

/** Friendly labels for recipient states — one source of truth for every
 * recipient table (campaign detail, team read-only view, …). */
export const RECIPIENT_STATUS_LABELS: Record<string, { label: string; className: string }> = {
  PENDING: { label: "Waiting", className: "bg-slate-100 text-slate-600" },
  SCHEDULED: { label: "Scheduled", className: "bg-blue-100 text-blue-700" },
  DRAFTED: { label: "Draft created", className: "bg-blue-100 text-blue-700" },
  SENT: { label: "Sent", className: "bg-green-100 text-green-700" },
  REPLIED: { label: "Replied 🎉", className: "bg-green-100 text-green-700" },
  BOUNCED: { label: "Bounced", className: "bg-amber-100 text-amber-700" },
  UNSUBSCRIBED: { label: "Unsubscribed", className: "bg-amber-100 text-amber-700" },
  SKIPPED: { label: "Removed", className: "bg-slate-200 text-slate-600" },
  EXCLUDED: { label: "Excluded for safety", className: "bg-amber-100 text-amber-700" },
  CANCELLED: { label: "Cancelled", className: "bg-slate-200 text-slate-600" },
  ERROR: { label: "Needs attention", className: "bg-red-100 text-red-700" },
};

export function recipientStatusBadge(status: string): { label: string; className: string } {
  return RECIPIENT_STATUS_LABELS[status] ?? { label: status, className: "bg-slate-100 text-slate-600" };
}
