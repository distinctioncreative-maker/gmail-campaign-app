import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth/requireUser";
import { handleApiErrors } from "@/lib/api";
import { renameOrganization } from "@/lib/repositories/organizations";

const PatchSchema = z.object({
  name: z.string().trim().min(1).max(80),
});

/** Rename the workspace (e.g. "Alpine Funding Partners"). Admin only. */
export const PATCH = handleApiErrors(async (req: NextRequest) => {
  const ctx = await requireRole("ADMIN");
  const { name } = PatchSchema.parse(await req.json());
  await renameOrganization(ctx.organizationId, name);
  return NextResponse.json({ ok: true, message: `Workspace renamed to "${name}".` });
});
