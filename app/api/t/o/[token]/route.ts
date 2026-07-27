import { NextRequest, NextResponse } from "next/server";
import { verifyTrackingToken } from "@/lib/tracking/token";
import { getRecipient, updateRecipient, type OwnerRef } from "@/lib/repositories/campaigns";
import { reportError } from "@/lib/observability/report";

// The smallest valid transparent GIF — the standard open-tracking beacon.
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
 * trackingEnabled — off by default). Public and unauthenticated by nature
 * (email clients load it directly): always returns the pixel regardless of
 * outcome, since a broken image or error page here is worse than a missed
 * open count.
 */
export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const { token } = await params;
    const payload = verifyTrackingToken(token);
    if (payload) {
      const owner: OwnerRef = { userId: payload.ownerUserId, organizationId: payload.organizationId };
      const recipient = await getRecipient(owner, payload.campaignId, payload.recipientId);
      if (recipient) {
        const now = Date.now();
        await updateRecipient(owner, payload.campaignId, payload.recipientId, {
          openedAt: recipient.openedAt ?? now,
          openCount: recipient.openCount + 1,
        });
      }
    }
  } catch (err) {
    reportError(err, { scope: "tracking-open" });
  }
  return pixelResponse();
}
