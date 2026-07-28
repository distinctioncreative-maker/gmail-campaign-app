import type { TenantType } from "@/schemas/user";
import { PLANS, type PlanId } from "@/lib/billing/plans";

/**
 * A single source of truth for what a tenant can do. Every gated feature reads
 * this instead of hard-coding a tenant/plan check, so the two "modes" of the
 * app (Enterprise vs Solo) live in one place.
 *
 * Billing plan and tenant type are evaluated together. A custom email domain
 * does not grant paid team features by itself; existing internal workspaces
 * retain TEAM through their stored/grandfathered billing default.
 */
export interface Capabilities {
  /** Team features: roles, assignment, team dashboards, leaderboards. */
  teams: boolean;
  /** Can invite additional members (turns a Solo tenant into a team later). */
  invites: boolean;
  /** Admin console (sending mode, org settings, member management). */
  adminConsole: boolean;
  /** May switch the org to real (LIVE) sending. */
  liveSending: boolean;
  /** Solo tenants must warm up before any real sending is allowed. */
  requiresWarmup: boolean;
  /** Safe daily send ceiling enforced by the app (not Gmail's hard cap). */
  maxDailySends: number;
  /** Show billing / upgrade surfaces. */
  billing: boolean;
}

export function capabilitiesFor(
  tenantType: TenantType,
  plan: PlanId
): Capabilities {
  const paidTeams = PLANS[plan].teams;
  return {
    teams: paidTeams,
    invites: paidTeams,
    adminConsole: tenantType === "WORKSPACE" && paidTeams,
    liveSending: true,
    requiresWarmup: plan === "FREE",
    maxDailySends: PLANS[plan].maxDailySends,
    billing: true,
  };
}
