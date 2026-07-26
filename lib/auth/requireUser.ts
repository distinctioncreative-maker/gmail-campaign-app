import "server-only";
import { verifySession } from "./session";
import { getUser, createUser, touchLastLogin } from "@/lib/repositories/users";
import {
  countMembers,
  getMember,
  resolveTenant,
  upsertMember,
} from "@/lib/repositories/organizations";
import { getOrganization } from "@/lib/repositories/orgSettings";
import { getPendingInvite, consumeInvite } from "@/lib/repositories/invites";
import type { Role } from "@/schemas/common";
import type { TenantType, User } from "@/schemas/user";

export interface AuthContext {
  userId: string;
  organizationId: string;
  email: string;
  role: Role;
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
 * All owner/organization scoping downstream derives from this context —
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
    if (member && orgDoc) {
      if (!member.active || !existing.active) {
        throw new ForbiddenError("Your account has been disabled. Contact your administrator.");
      }
      await touchLastLogin(existing.userId);
      return {
        userId: existing.userId,
        organizationId: existing.organizationId,
        email: existing.email,
        role: member.role,
        tenantType: orgDoc.tenantType,
        user: existing,
      };
    }
    // Fall through to (re)provision if the record is inconsistent.
  }

  // Brand-new user: honor a pending invite (join that org), else resolve their
  // own tenant by email domain.
  const invite = existing ? null : await getPendingInvite(identity.email);
  let org: { organizationId: string; tenantType: TenantType };
  let invitedRole: Role | null = null;
  if (invite) {
    const invitedOrg = await getOrganization(invite.organizationId);
    if (invitedOrg) {
      org = { organizationId: invitedOrg.organizationId, tenantType: invitedOrg.tenantType };
      invitedRole = invite.role;
    } else {
      org = (await resolveTenant(identity)).org;
    }
  } else {
    org = (await resolveTenant(identity)).org;
  }

  let user = existing;
  let member = await getMember(org.organizationId, identity.userId);
  if (!user || !member) {
    const role: Role =
      invitedRole ?? ((await countMembers(org.organizationId)) === 0 ? "ADMIN" : "SALES_REP");
    member ??= await upsertMember(org.organizationId, identity.userId, identity.email, role);
    user ??= await createUser({
      userId: identity.userId,
      organizationId: org.organizationId,
      email: identity.email,
      displayName: identity.displayName,
      role: member.role,
      tenantType: org.tenantType,
    });
    if (invite) await consumeInvite(identity.email, identity.userId);
  }

  if (!member.active || !user.active) {
    throw new ForbiddenError("Your account has been disabled. Contact your administrator.");
  }

  return {
    userId: user.userId,
    organizationId: org.organizationId,
    email: user.email,
    role: member.role,
    tenantType: org.tenantType,
    user,
  };
}

export async function requireRole(...roles: Role[]): Promise<AuthContext> {
  const ctx = await requireUser();
  if (!roles.includes(ctx.role)) throw new ForbiddenError();
  return ctx;
}
