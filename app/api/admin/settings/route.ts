import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth/requireUser";
import { handleApiErrors } from "@/lib/api";
import { getOrgSettings, updateOrgSettings } from "@/lib/repositories/orgSettings";

export const GET = handleApiErrors(async () => {
  const ctx = await requireRole("ADMIN");
  return NextResponse.json({ settings: await getOrgSettings(ctx.organizationId) });
});

const PutSchema = z.object({
  collisionPolicy: z.enum([
    "OFF",
    "PRIVATE_WARNING",
    "MANAGER_VISIBLE",
    "BLOCK_RECENT_TEAM_CONTACT",
  ]),
  collisionBlockDays: z.number().int().min(1).max(365),
  sendConfirmThreshold: z.number().int().min(1).max(100000),
});

export const PUT = handleApiErrors(async (req: NextRequest) => {
  const ctx = await requireRole("ADMIN");
  const settings = PutSchema.parse(await req.json());
  await updateOrgSettings(ctx.organizationId, settings);
  return NextResponse.json({ ok: true });
});
