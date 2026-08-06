import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import {
  TRACKING_TOKEN_MAX_AGE_MS,
  verifyTrackingToken,
} from "@/lib/tracking/token";
import {
  getRecipient,
  recordRecipientOpen,
  type OwnerRef,
} from "@/lib/repositories/campaigns";
import { reportError } from "@/lib/observability/report";
import { hostBelongsToOrganization } from "@/lib/tracking/domain";
import { listVerifiedTrackingDomains } from "@/lib/repositories/orgSettings";
import { env } from "@/lib/env";
import { enforceRateLimit } from "@/lib/util/rateLimit";

// The smallest valid transparent GIF: the standard open-tracking beacon.
const PIXEL = Buffer.from("R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==", "base64");

function pixelResponse(): NextResponse {
  return new NextResponse(PIXEL, {
    status: 200,
    headers: {
      "Content-Type": "image/gif",
      "Cache-Control": "no-store, no-cache, must-revalidate, private",
      "Content-Length": String(PIXEL.length),
    },
  });
}

type Params = { params: Promise<{ token: string }> };

/**
 * Optional open-tracking pixel (schemas/campaign.ts CampaignSchema.
 * trackingEnabled). Public and unauthenticated by nature
 * (email clients load it directly): always returns the pixel regardless of
 * outcome, since a broken image or error page here is worse than a missed
 * open count.
 */
export async function GET(req: NextRequest, { params }: Params) {
  try {
    const { token } = await params;
    const key = crypto.createHash("sha256").update(token).digest("hex").slice(0, 40);
    const withinLimit = await enforceRateLimit(
      "tracking-open",
      key,
      120,
      60 * 60 * 1000,
      { failClosed: true }
    );
    if (!withinLimit) return pixelResponse();
    const payload = verifyTrackingToken(token);
    if (payload) {
      // A workspace with its own tracking hostname serves its own links from
      // it. Recording an open for a token that arrived on a *different*
      // customer's hostname would leak across a tenant boundary, so it is
      // dropped. Silently, because this endpoint always returns the pixel.
      const hostOk = hostBelongsToOrganization(
        req.headers.get("host"),
        payload.organizationId,
        await listVerifiedTrackingDomains().catch(() => []),
        env.APP_BASE_URL
      );
      if (!hostOk) return pixelResponse();
      const owner: OwnerRef = { userId: payload.ownerUserId, organizationId: payload.organizationId };
      const recipient = await getRecipient(owner, payload.campaignId, payload.recipientId);
      if (
        recipient &&
        recipient.initialSentAt !== null &&
        Date.now() - recipient.initialSentAt <= TRACKING_TOKEN_MAX_AGE_MS
      ) {
        const now = Date.now();
        await recordRecipientOpen(owner, payload.campaignId, payload.recipientId, now);
      }
    }
  } catch (err) {
    reportError(err, { scope: "tracking-open" });
  }
  return pixelResponse();
}
