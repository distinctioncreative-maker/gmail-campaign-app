import { NextRequest, NextResponse } from "next/server";
import { verifyTrackingToken } from "@/lib/tracking/token";
import { getRecipient, updateRecipient, type OwnerRef } from "@/lib/repositories/campaigns";
import { env } from "@/lib/env";
import { reportError } from "@/lib/observability/report";

type Params = { params: Promise<{ token: string; index: string }> };

function safeFallback(): NextResponse {
  return NextResponse.redirect(env.APP_BASE_URL, { status: 302 });
}

/**
 * Optional click-tracking redirect (schemas/campaign.ts CampaignSchema.
 * trackingEnabled — off by default). The destination is ALWAYS looked up
 * server-side from trackedLinkUrls on the recipient doc, keyed by the
 * step this link's index came from — never taken from the request. That's
 * what keeps this from being an open redirect: a caller can only select an
 * index into a list the template's own author wrote, never supply an
 * arbitrary URL. Falls back to the app home on anything invalid.
 */
export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const { token, index } = await params;
    const payload = verifyTrackingToken(token);
    if (!payload) return safeFallback();
    const idx = Number(index);
    if (!Number.isInteger(idx) || idx < 0) return safeFallback();

    const owner: OwnerRef = { userId: payload.ownerUserId, organizationId: payload.organizationId };
    const recipient = await getRecipient(owner, payload.campaignId, payload.recipientId);
    if (!recipient) return safeFallback();

    const destination = recipient.trackedLinkUrls[String(payload.step)]?.[idx];
    if (!destination) return safeFallback();

    let target: URL;
    try {
      target = new URL(destination, env.APP_BASE_URL);
    } catch {
      return safeFallback();
    }

    const now = Date.now();
    await updateRecipient(owner, payload.campaignId, payload.recipientId, {
      firstClickedAt: recipient.firstClickedAt ?? now,
      clickCount: recipient.clickCount + 1,
      // A click implies an open even if the pixel itself was blocked.
      openedAt: recipient.openedAt ?? now,
      openCount: recipient.openedAt ? recipient.openCount : recipient.openCount + 1,
    });

    return NextResponse.redirect(target, { status: 302 });
  } catch (err) {
    reportError(err, { scope: "tracking-click" });
    return safeFallback();
  }
}
