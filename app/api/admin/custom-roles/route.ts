import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { handleApiErrors } from "@/lib/api";
import { requireRole } from "@/lib/auth/requireUser";
import {
  getOrgSettings,
  listMembers,
  refreshCustomRoleAssignments,
  saveCustomRoles,
} from "@/lib/repositories/orgSettings";
import { RoleSchema } from "@/schemas/common";
import { CustomRoleDefinitionSchema } from "@/schemas/user";

const RoleInputSchema = z.object({
  name: z.string().trim().min(2).max(40),
  description: z.string().trim().max(160).default(""),
  baseRole: RoleSchema,
});

export const GET = handleApiErrors(async () => {
  const ctx = await requireRole("ADMIN");
  const settings = await getOrgSettings(ctx.organizationId);
  return NextResponse.json({ roles: settings.customRoles });
});

export const POST = handleApiErrors(async (req: NextRequest) => {
  const ctx = await requireRole("ADMIN");
  const input = RoleInputSchema.parse(await req.json());
  const settings = await getOrgSettings(ctx.organizationId);
  if (settings.customRoles.length >= 20) {
    return NextResponse.json({ error: "A workspace can have up to 20 custom roles." }, { status: 409 });
  }
  if (settings.customRoles.some((role) => role.name.toLowerCase() === input.name.toLowerCase())) {
    return NextResponse.json({ error: "A role with that name already exists." }, { status: 409 });
  }
  const role = CustomRoleDefinitionSchema.parse({
    id: crypto.randomUUID(),
    ...input,
  });
  await saveCustomRoles(ctx.organizationId, [...settings.customRoles, role]);
  return NextResponse.json({ role, message: `Role "${role.name}" created.` });
});

const UpdateSchema = RoleInputSchema.extend({ id: z.string().min(1).max(100) });

export const PATCH = handleApiErrors(async (req: NextRequest) => {
  const ctx = await requireRole("ADMIN");
  const input = UpdateSchema.parse(await req.json());
  const settings = await getOrgSettings(ctx.organizationId);
  const index = settings.customRoles.findIndex((role) => role.id === input.id);
  if (index < 0) return NextResponse.json({ error: "Custom role not found." }, { status: 404 });
  if (
    settings.customRoles.some(
      (role) => role.id !== input.id && role.name.toLowerCase() === input.name.toLowerCase()
    )
  ) {
    return NextResponse.json({ error: "A role with that name already exists." }, { status: 409 });
  }
  const role = CustomRoleDefinitionSchema.parse(input);
  const next = [...settings.customRoles];
  next[index] = role;
  await saveCustomRoles(ctx.organizationId, next);
  await refreshCustomRoleAssignments(ctx.organizationId, role);
  return NextResponse.json({ role, message: `Role "${role.name}" updated.` });
});

const DeleteSchema = z.object({ id: z.string().min(1).max(100) });

export const DELETE = handleApiErrors(async (req: NextRequest) => {
  const ctx = await requireRole("ADMIN");
  const { id } = DeleteSchema.parse(await req.json());
  const [settings, members] = await Promise.all([
    getOrgSettings(ctx.organizationId),
    listMembers(ctx.organizationId),
  ]);
  const role = settings.customRoles.find((candidate) => candidate.id === id);
  if (!role) return NextResponse.json({ error: "Custom role not found." }, { status: 404 });
  if (members.some((member) => member.customRoleId === id)) {
    return NextResponse.json(
      { error: "Reassign every member using this role before deleting it." },
      { status: 409 }
    );
  }
  await saveCustomRoles(
    ctx.organizationId,
    settings.customRoles.filter((candidate) => candidate.id !== id)
  );
  return NextResponse.json({ ok: true, message: `Role "${role.name}" deleted.` });
});
