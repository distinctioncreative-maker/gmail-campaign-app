import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth/requireUser";
import { handleApiErrors } from "@/lib/api";
import { getOrgSettings, setAiEnabled } from "@/lib/repositories/orgSettings";
import { aiKeyConfigured } from "@/lib/ai/enabled";
import { auditActor, recordAudit } from "@/lib/audit/log";

/** Current AI-writing switch state + whether a server key is even present. */
export const GET = handleApiErrors(async () => {
  const ctx = await requireRole("ADMIN");
  const settings = await getOrgSettings(ctx.organizationId);
  return NextResponse.json({ enabled: settings.aiEnabled, keyConfigured: aiKeyConfigured() });
});

const PutSchema = z.object({ enabled: z.boolean() });

/** Turn all AI writing features on or off for the whole org. Admin only. */
export const PUT = handleApiErrors(async (req: NextRequest) => {
  const ctx = await requireRole("ADMIN");
  const { enabled } = PutSchema.parse(await req.json());
  await setAiEnabled(ctx.organizationId, enabled);
  await recordAudit(auditActor(ctx), {
    action: "sending.ai_writing_changed",
    summary: `${ctx.email} turned AI writing ${enabled ? "on" : "off"} for the workspace.`,
    details: { enabled },
  });
  return NextResponse.json({ ok: true, enabled });
});
