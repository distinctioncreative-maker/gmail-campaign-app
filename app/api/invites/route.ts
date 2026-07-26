import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth/requireUser";
import { handleApiErrors } from "@/lib/api";
import { capabilitiesFor } from "@/lib/tenancy/capabilities";
import { promoteConsumerToWorkspace } from "@/lib/repositories/organizations";
import { createInvite, listInvites, revokeInvite } from "@/lib/repositories/invites";

/** List pending/accepted invites for the admin's org. */
export const GET = handleApiErrors(async () => {
  const ctx = await requireRole("ADMIN");
  if (!capabilitiesFor(ctx.tenantType).invites) {
    return NextResponse.json({ error: "Invites aren't available on this plan." }, { status: 403 });
  }
  return NextResponse.json({ invites: await listInvites(ctx.organizationId) });
});

const PostSchema = z.object({
  email: z.string().trim().email().max(200),
  role: z.enum(["SALES_REP", "MANAGER", "ADMIN"]).default("SALES_REP"),
});

/** Invite a teammate by email. If the org is still a Solo (consumer)
 * workspace, this is the moment it becomes a real team: we promote it, then
 * record the invite. The invited person joins on their next sign-in. */
export const POST = handleApiErrors(async (req: NextRequest) => {
  const ctx = await requireRole("ADMIN");
  if (!capabilitiesFor(ctx.tenantType).invites) {
    return NextResponse.json({ error: "Invites aren't available on this plan." }, { status: 403 });
  }
  const { email, role } = PostSchema.parse(await req.json());

  if (email.toLowerCase() === ctx.email.toLowerCase()) {
    return NextResponse.json({ error: "You're already in this workspace." }, { status: 400 });
  }

  // Solo → team promotion happens on the first invite.
  if (ctx.tenantType === "CONSUMER") {
    await promoteConsumerToWorkspace(ctx.organizationId);
  }

  await createInvite({ organizationId: ctx.organizationId, email, role, invitedBy: ctx.userId });
  return NextResponse.json({ ok: true, message: `Invitation ready for ${email}.` });
});

const DeleteSchema = z.object({ email: z.string().trim().email().max(200) });

/** Revoke a pending invite. */
export const DELETE = handleApiErrors(async (req: NextRequest) => {
  const ctx = await requireRole("ADMIN");
  const { email } = DeleteSchema.parse(await req.json());
  await revokeInvite(ctx.organizationId, email);
  return NextResponse.json({ ok: true });
});
