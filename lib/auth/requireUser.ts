import "server-only";
import { verifySession } from "./session";
import { getUser, createUser, touchLastLogin } from "@/lib/repositories/users";
import {
  countMembers,
  getMember,
  getOrCreateDefaultOrganization,
  upsertMember,
} from "@/lib/repositories/organizations";
import type { Role } from "@/schemas/common";
import type { User } from "@/schemas/user";

export interface AuthContext {
  userId: string;
  organizationId: string;
  email: string;
  role: Role;
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
 * First-ever member of the organization becomes ADMIN; everyone else
 * joins as SALES_REP until an admin changes their role.
 */
export async function requireUser(): Promise<AuthContext> {
  const identity = await verifySession();
  if (!identity) throw new UnauthorizedError();

  const org = await getOrCreateDefaultOrganization();

  let user = await getUser(identity.userId);
  let member = await getMember(org.organizationId, identity.userId);

  if (!user || !member) {
    const isFirstMember = (await countMembers(org.organizationId)) === 0;
    const role: Role = isFirstMember ? "ADMIN" : "SALES_REP";
    member ??= await upsertMember(org.organizationId, identity.userId, identity.email, role);
    user ??= await createUser({
      userId: identity.userId,
      organizationId: org.organizationId,
      email: identity.email,
      displayName: identity.displayName,
      role: member.role,
    });
  } else {
    await touchLastLogin(user.userId);
  }

  if (!member.active || !user.active) {
    throw new ForbiddenError("Your account has been disabled. Contact your administrator.");
  }

  return {
    userId: user.userId,
    organizationId: org.organizationId,
    email: user.email,
    role: member.role,
    user,
  };
}

export async function requireRole(...roles: Role[]): Promise<AuthContext> {
  const ctx = await requireUser();
  if (!roles.includes(ctx.role)) throw new ForbiddenError();
  return ctx;
}
