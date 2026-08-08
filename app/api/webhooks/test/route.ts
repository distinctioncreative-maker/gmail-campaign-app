import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth/requireUser";
import { handleApiErrors } from "@/lib/api";
import { enforceUserRateLimit, RATE_LIMITS } from "@/lib/util/userRateLimit";
import { emitTestPing } from "@/lib/webhooks/emit";
import { testPingData } from "@/lib/webhooks/payload";

/**
 * Send a test delivery to one subscription.
 *
 * The point is to let someone prove their signature verification works before a
 * real reply depends on it. Without this the first delivery a customer ever
 * receives is a genuine event, and if their verification is wrong they lose it.
 *
 * Rate limited because the request makes our server post to an address the
 * customer chose: unbounded, it is a small traffic amplifier pointed wherever
 * they like, whatever the URL validation says about the target.
 */
const BodySchema = z.object({ endpointId: z.string().min(1) });

export const POST = handleApiErrors(async (req: NextRequest) => {
  const ctx = await requireRole("ADMIN");
  await enforceUserRateLimit(ctx, RATE_LIMITS.webhookTest);
  const { endpointId } = BodySchema.parse(await req.json());

  const queued = await emitTestPing(
    { organizationId: ctx.organizationId, ownerUserId: ctx.userId },
    endpointId,
    testPingData({ triggeredByUserId: ctx.userId })
  );
  if (!queued) {
    return NextResponse.json({ error: "That subscription does not exist." }, { status: 404 });
  }

  return NextResponse.json({
    ok: true,
    message: "Test delivery queued. The result appears in recent deliveries within a few seconds.",
  });
});
