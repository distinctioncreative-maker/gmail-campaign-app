import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth/requireUser";
import { handleApiErrors } from "@/lib/api";
import { setSendingMode } from "@/lib/repositories/orgSettings";
import { resolveSendingState } from "@/lib/sending/mode";
import { listMembers } from "@/lib/repositories/orgSettings";
import { getConnection } from "@/lib/repositories/gmailConnections";
import { env } from "@/lib/env";

/** Current sending state + a go-live readiness checklist. */
export const GET = handleApiErrors(async () => {
  const ctx = await requireRole("ADMIN");
  const state = await resolveSendingState(ctx.organizationId);

  const members = await listMembers(ctx.organizationId);
  let connected = 0;
  for (const m of members) {
    const conn = await getConnection(m.userId);
    if (conn?.status === "CONNECTED") connected++;
  }

  const checklist = [
    {
      ok: connected > 0,
      label: `At least one salesperson has connected Gmail (${connected} of ${members.length})`,
    },
    {
      ok: Boolean(env.TEST_EMAIL_DESTINATION),
      label: "A test email address is configured",
    },
    {
      ok: env.APP_BASE_URL.startsWith("https://") && Boolean(env.CLOUD_TASKS_SERVICE_ACCOUNT),
      label: "Background sending (Cloud Tasks) is set up",
    },
  ];

  return NextResponse.json({ state, checklist });
});

const BodySchema = z.object({
  mode: z.enum(["TEST", "LIVE"]),
  confirm: z.string().optional(),
});

/** Flip the whole org between TEST and LIVE. LIVE requires typing GO LIVE
 * and is blocked when a deployment lock is active. */
export const POST = handleApiErrors(async (req: NextRequest) => {
  const ctx = await requireRole("ADMIN");
  const { mode, confirm } = BodySchema.parse(await req.json());

  const state = await resolveSendingState(ctx.organizationId);

  if (mode === "LIVE") {
    if (state.lockedByEnv) {
      return NextResponse.json(
        {
          error:
            "Real sending is locked by the server configuration. An administrator must clear the FORCE_TEST_MODE / TEST_MODE setting on the deployment first.",
        },
        { status: 400 }
      );
    }
    if (confirm !== "GO LIVE") {
      return NextResponse.json(
        { error: "Type GO LIVE to confirm switching the whole team to real sending." },
        { status: 400 }
      );
    }
  }

  await setSendingMode(ctx.organizationId, mode, ctx.userId);
  return NextResponse.json({ ok: true, mode });
});
