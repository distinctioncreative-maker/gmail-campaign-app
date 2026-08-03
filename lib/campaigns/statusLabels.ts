import type { CampaignStatus } from "@/schemas/campaign";

/** Friendly labels for non-technical users (spec §5). */
export const CAMPAIGN_STATUS_LABELS: Record<
  CampaignStatus,
  { label: string; className: string }
> = {
  DRAFT: { label: "Draft", className: "bg-surface-2 text-muted" },
  VALIDATING: { label: "Preparing", className: "bg-surface-2 text-muted" },
  READY: { label: "Ready", className: "bg-info-soft text-info" },
  PREPARING: { label: "Preparing", className: "bg-info-soft text-info" },
  ACTIVE: { label: "Sending", className: "bg-success-soft text-success" },
  PAUSED: { label: "Paused", className: "bg-warning-soft text-warning" },
  STOPPED: { label: "Stopped", className: "bg-border text-muted" },
  CANCELLED: { label: "Cancelled", className: "bg-border text-muted" },
  COMPLETED: { label: "Finished", className: "bg-success-soft text-success" },
  ERROR: { label: "Needs attention", className: "bg-danger-soft text-danger" },
};

/** Friendly labels for recipient states: one source of truth for every
 * recipient table (campaign detail, team read-only view, …). */
export const RECIPIENT_STATUS_LABELS: Record<string, { label: string; className: string }> = {
  PENDING: { label: "Waiting", className: "bg-surface-2 text-muted" },
  SCHEDULED: { label: "Scheduled", className: "bg-info-soft text-info" },
  DRAFTED: { label: "Draft created", className: "bg-info-soft text-info" },
  SENT: { label: "Sent", className: "bg-success-soft text-success" },
  REPLIED: { label: "Replied", className: "bg-success-soft text-success" },
  BOUNCED: { label: "Bounced", className: "bg-warning-soft text-warning" },
  UNSUBSCRIBED: { label: "Unsubscribed", className: "bg-warning-soft text-warning" },
  SKIPPED: { label: "Removed", className: "bg-border text-muted" },
  EXCLUDED: { label: "Excluded for safety", className: "bg-warning-soft text-warning" },
  CANCELLED: { label: "Cancelled", className: "bg-border text-muted" },
  ERROR: { label: "Needs attention", className: "bg-danger-soft text-danger" },
};

export function recipientStatusBadge(status: string): { label: string; className: string } {
  return RECIPIENT_STATUS_LABELS[status] ?? { label: status, className: "bg-surface-2 text-muted" };
}
