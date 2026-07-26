import type { TenantType } from "@/schemas/user";

/**
 * A single source of truth for what a tenant can do. Every gated feature reads
 * this instead of hard-coding a tenant/plan check, so the two "modes" of the
 * app (Enterprise vs Solo) live in one place.
 *
 * Plans layer on top later (billing); for now capabilities derive purely from
 * tenant type. Solo (CONSUMER) is a free, single-person, deliverability-safe
 * funnel; Workspace (Enterprise) is the full team product.
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

const WORKSPACE: Capabilities = {
  teams: true,
  invites: true,
  adminConsole: true,
  liveSending: true,
  requiresWarmup: false,
  maxDailySends: 400,
  billing: true,
};

const CONSUMER: Capabilities = {
  teams: false,
  invites: false,
  adminConsole: false,
  liveSending: true,
  requiresWarmup: true,
  // Consumer Gmail is weak for cold outreach; keep the ceiling conservative.
  maxDailySends: 40,
  billing: true,
};

export function capabilitiesFor(tenantType: TenantType): Capabilities {
  return tenantType === "CONSUMER" ? { ...CONSUMER } : { ...WORKSPACE };
}
