import "server-only";
import type { OwnerRef } from "@/lib/repositories/campaigns";
import { processRepliesForUser, processBouncesForUser } from "@/lib/campaigns/monitoring";
import { reconcileContactEngagement } from "@/lib/leads/reconcile";

export interface ScanResult {
  checked: number;
  replied: number;
  bounces: number;
  contactsSynced: number;
  message: string;
}

/**
 * The one on-demand mailbox scan: replies + bounces via the same monitors the
 * scheduled sweeps run, then a lead-engagement reconcile so the Leads pages
 * reflect history too. Used by both the Reports/Replies "Scan for replies"
 * button and the per-campaign "Check for replies now" button.
 */
export async function runReplyScan(owner: OwnerRef): Promise<ScanResult> {
  const [replies, bounces] = await Promise.all([
    processRepliesForUser(owner),
    processBouncesForUser(owner),
  ]);
  const { contactsSynced } = await reconcileContactEngagement(owner);

  const parts: string[] = [];
  if (replies.replied > 0) parts.push(`${replies.replied} new repl${replies.replied === 1 ? "y" : "ies"}`);
  if (bounces.bounces > 0) parts.push(`${bounces.bounces} bounce${bounces.bounces === 1 ? "" : "s"}`);
  const message =
    parts.length > 0
      ? `Found ${parts.join(" and ")}.`
      : `Checked ${replies.checked} recipient${replies.checked === 1 ? "" : "s"} — no new replies or bounces yet.`;

  return { ...replies, ...bounces, contactsSynced, message };
}
