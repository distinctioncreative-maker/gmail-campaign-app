import "server-only";
import { verifySession } from "./session";
import { getUser, createUser, touchLastLogin } from "@/lib/repositories/users";
import {
  getMember,
  provisionMember,
  resolveTenant,
} from "@/lib/repositories/organizations";
import { getOrganization } from "@/lib/repositories/orgSettings";
import {
  acceptInviteAndProvision,
  getPendingInvite,
} from "@/lib/repositories/invites";
// Type-only in the other direction, so this stays a one-way runtime edge.
import { clearDeletedIdentity, deletedIdentity } from "@/lib/account/deletion";
import type { Role } from "@/schemas/common";
import type { TenantType, User } from "@/schemas/user";

export interface AuthContext {
  userId: string;
  organizationId: string;
  email: string;
  role: Role;
  roleLabel: string | null;
  tenantType: TenantType;
  user: User;
}

export class UnauthorizedError extends Error {
  constructor(message = "Not signed in") {
    super(message);
  }
}
export class ForbiddenError extends Error {
  constructor(message = "You do not have access to this") {
    super(message);
  }
}

/**
 * Verify the session cookie AND organization membership server-side.
 * All owner/organization scoping downstream derives from this context,
 * never from client-supplied IDs.
 *
 * Users are grouped into an organization by their email domain, so different
 * Workspace domains (e.g. alpine vs everest) are fully isolated. First-ever
 * member of each organization becomes ADMIN; everyone else joins as SALES_REP
 * until an admin changes their role.
 */
export async function requireUser(): Promise<AuthContext> {
  const identity = await verifySession();
  if (!identity) throw new UnauthorizedError();

  const existing = await getUser(identity.userId);

  // Returning user: their organization is whatever their record already says
  // (which may be an org they were invited into, not their email-domain org).
  // Recomputing from email each time would misroute invited members.
  if (existing) {
    const [member, orgDoc] = await Promise.all([
      getMember(existing.organizationId, identity.userId),
      getOrganization(existing.organizationId),
    ]);
    if (!orgDoc) {
      throw new ForbiddenError(
        "Your workspace is unavailable. Contact an administrator."
      );
    }
    const repairedMember =
      member ??
      (await provisionMember(
        existing.organizationId,
        identity.userId,
        identity.email,
        existing.role
      ));
    if (!repairedMember.active || !existing.active) {
      throw new ForbiddenError("Your account has been disabled. Contact your administrator.");
    }
    // Last-login is activity metadata, not request telemetry. Throttle it to
    // once per hour instead of adding a Firestore write to every API request.
    if (
      existing.lastLoginAt === null ||
      Date.now() - existing.lastLoginAt > 60 * 60 * 1000
    ) {
      await touchLastLogin(existing.userId);
    }
    return {
      userId: existing.userId,
      organizationId: existing.organizationId,
      email: existing.email,
      role: repairedMember.role,
      roleLabel: repairedMember.roleLabel,
      tenantType: orgDoc.tenantType,
      user: existing,
    };
  }

  // No user document. That is normally a first sign-in, but it is also what a
  // just-purged account looks like, and the two must not be confused: without
  // this check the next sign-in after a deletion would provision a fresh user
  // in the same organization and quietly undo the deletion.
  const tombstone = await deletedIdentity(identity.userId);
  if (tombstone?.status === "PURGING") {
    // Provisioning now would rebuild documents the purge is midway through
    // removing, and the race is unwinnable from this side.
    throw new ForbiddenError(
      "This account is being deleted. If that is a mistake, contact support."
    );
  }
  if (tombstone?.status === "PURGED") {
    // The deletion is complete and honoured. Signing up again is a new
    // relationship, not a resurrection: the marker goes, and what follows is
    // an empty account with none of the deleted data in it. Refusing forever
    // would turn a deletion request into a permanent ban, which is not what
    // anyone asked for.
    await clearDeletedIdentity(identity.userId);
  }

  // Brand-new user: honor a pending invite (join that org), else resolve their
  // own tenant by email domain.
  const invite = await getPendingInvite(identity.email);
  if (invite) {
    const invitedOrg = await getOrganization(invite.organizationId);
    if (invitedOrg) {
      const accepted = await acceptInviteAndProvision({
        email: identity.email,
        userId: identity.userId,
        displayName: identity.displayName,
        expectedOrganizationId: invitedOrg.organizationId,
        tenantType: invitedOrg.tenantType,
      });
      if (accepted) {
        if (!accepted.member.active || !accepted.user.active) {
          throw new ForbiddenError(
            "Your account has been disabled. Contact your administrator."
          );
        }
        return {
          userId: accepted.user.userId,
          organizationId: invitedOrg.organizationId,
          email: accepted.user.email,
          role: accepted.member.role,
          roleLabel: accepted.member.roleLabel,
          tenantType: invitedOrg.tenantType,
          user: accepted.user,
        };
      }
    }
  }

  // No valid invite (or it was revoked while sign-in was in flight): resolve
  // the identity's own isolated/shared tenant.
  const org = (await resolveTenant(identity)).org;
  let member = await getMember(org.organizationId, identity.userId);
  member ??= await provisionMember(
    org.organizationId,
    identity.userId,
    identity.email,
    null
  );
  const user = await createUser({
    userId: identity.userId,
    organizationId: org.organizationId,
    email: identity.email,
    displayName: identity.displayName,
    role: member.role,
    tenantType: org.tenantType,
  });
  if (!member.active || !user.active) {
    throw new ForbiddenError("Your account has been disabled. Contact your administrator.");
  }

  return {
    userId: user.userId,
    organizationId: org.organizationId,
    email: user.email,
    role: member.role,
    roleLabel: member.roleLabel,
    tenantType: org.tenantType,
    user,
  };
}

export async function requireRole(...roles: Role[]): Promise<AuthContext> {
  const ctx = await requireUser();
  if (!roles.includes(ctx.role)) throw new ForbiddenError();
  return ctx;
}
