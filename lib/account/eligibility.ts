/**
 * Who may delete what, and what deleting it takes with it.
 *
 * Pure on purpose: every rule here is a decision about someone's data that
 * cannot be undone once the grace period lapses, so it should be readable and
 * testable without a database in the way.
 *
 * The rule worth stating out loud is the last-admin one. Deleting the only
 * admin of a shared workspace does not just remove that person: it leaves
 * behind an organization with members, campaigns, and billing that nobody can
 * administer, and no path in the product to fix it. That is a worse outcome
 * than refusing, so it is refused, with the two ways out named.
 */

export type DeletionScope = "ACCOUNT" | "WORKSPACE";

/** Thirty days, the interval named in the privacy notice. */
export const GRACE_PERIOD_DAYS = 30;
export const GRACE_PERIOD_MS = GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000;

export interface DeletionSubject {
  role: "ADMIN" | "MANAGER" | "SALES_REP";
  /** CONSUMER is a private one-person workspace, so the two scopes collapse. */
  tenantType: "WORKSPACE" | "CONSUMER";
  /** Active members of the organization, including this user. */
  memberCount: number;
  /** Active admins of the organization, including this user if they are one. */
  adminCount: number;
}

export interface DeletionVerdict {
  allowed: boolean;
  /** What will actually happen, which is not always what was asked for. */
  effectiveScope: DeletionScope;
  /** Shown to the person. Says what they can do, not just what they cannot. */
  reason: string;
}

/**
 * A one-person private workspace has no distinction between the two scopes:
 * removing the person leaves an organization with no members, so "delete my
 * account" and "delete the workspace" are the same operation and pretending
 * otherwise would leave an empty org behind on every consumer deletion.
 */
function collapsesToWorkspace(subject: DeletionSubject): boolean {
  return subject.tenantType === "CONSUMER" || subject.memberCount <= 1;
}

export function assessDeletion(
  subject: DeletionSubject,
  requested: DeletionScope
): DeletionVerdict {
  if (requested === "WORKSPACE") {
    if (subject.role !== "ADMIN") {
      return {
        allowed: false,
        effectiveScope: "WORKSPACE",
        reason:
          "Only an admin can delete a workspace. You can delete your own account instead, which removes your campaigns, leads, and templates and leaves the workspace for everyone else.",
      };
    }
    return {
      allowed: true,
      effectiveScope: "WORKSPACE",
      reason:
        "This deletes the workspace and every member's campaigns, leads, templates, and sending history. It cannot be undone once the grace period ends.",
    };
  }

  if (collapsesToWorkspace(subject)) {
    return {
      allowed: true,
      effectiveScope: "WORKSPACE",
      reason:
        "You are the only person here, so deleting your account deletes the whole workspace with it.",
    };
  }

  // Shared workspace, more than one member.
  if (subject.role === "ADMIN" && subject.adminCount <= 1) {
    return {
      allowed: false,
      effectiveScope: "ACCOUNT",
      reason:
        "You are the only admin, and the workspace would be left with members but nobody who can administer it. Make someone else an admin first, or delete the whole workspace.",
    };
  }

  return {
    allowed: true,
    effectiveScope: "ACCOUNT",
    reason:
      "This deletes your campaigns, leads, templates, and sending history. The workspace and everyone else's data stay.",
  };
}

/** When a request made now becomes irreversible. */
export function purgeDueAt(requestedAt: number): number {
  return requestedAt + GRACE_PERIOD_MS;
}

/** Whole days left, floored, never negative. Zero means it purges on the next sweep. */
export function daysRemaining(purgeAfter: number, now: number): number {
  return Math.max(0, Math.floor((purgeAfter - now) / (24 * 60 * 60 * 1000)));
}

/**
 * A due request is one whose grace period has fully elapsed.
 *
 * Strictly greater, not greater-or-equal: a request created and swept in the
 * same millisecond would otherwise purge with no grace period at all, which is
 * the one thing the grace period exists to prevent.
 */
export function isDue(purgeAfter: number, now: number): boolean {
  return now > purgeAfter;
}

export function describeRemaining(purgeAfter: number, now: number): string {
  const days = daysRemaining(purgeAfter, now);
  if (days === 0) return "Deletion runs within a day.";
  if (days === 1) return "Deletion runs in 1 day.";
  return `Deletion runs in ${days} days.`;
}
