import { NextRequest, NextResponse } from "next/server";
import { handleApiErrors } from "@/lib/api";
import { requireRole } from "@/lib/auth/requireUser";
import { renameOrganization } from "@/lib/repositories/organizations";
import { saveWorkspaceProfile } from "@/lib/repositories/orgSettings";
import { WorkspaceProfileSchema } from "@/schemas/user";
import { z } from "zod";
import { seedStarterTemplates } from "@/lib/onboarding/seed";

const BodySchema = z.object({
  workspaceName: z.string().trim().min(1).max(80),
  industry: z.string().trim().max(80),
  teamSize: WorkspaceProfileSchema.shape.teamSize,
  monthlyEmailGoal: WorkspaceProfileSchema.shape.monthlyEmailGoal,
  primaryUseCase: WorkspaceProfileSchema.shape.primaryUseCase,
});

/** First-run workspace setup. Admin-only because it changes shared context. */
export const POST = handleApiErrors(async (req: NextRequest) => {
  const ctx = await requireRole("ADMIN");
  const input = BodySchema.parse(await req.json());
  const now = Date.now();
  await Promise.all([
    renameOrganization(ctx.organizationId, input.workspaceName),
    saveWorkspaceProfile(
      ctx.organizationId,
      WorkspaceProfileSchema.parse({
        industry: input.industry,
        teamSize: input.teamSize,
        monthlyEmailGoal: input.monthlyEmailGoal,
        primaryUseCase: input.primaryUseCase,
        configuredAt: now,
      })
    ),
  ]);
  // After the profile is saved, so the starters can match what they told us
  // they do. Never blocks the response it rides along with.
  const seeded = await seedStarterTemplates(ctx);
  return NextResponse.json({
    ok: true,
    seededTemplates: seeded,
    message: seeded
      ? `Workspace saved. ${seeded} starter templates are waiting for you.`
      : "Workspace preferences saved.",
  });
});
