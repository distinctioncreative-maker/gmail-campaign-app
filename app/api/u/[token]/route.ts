import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import {
  commitRecipientOutcome,
  getCampaign,
  getRecipient,
  recordEvent,
  type OwnerRef,
} from "@/lib/repositories/campaigns";
import { recordEngagementByEmail } from "@/lib/repositories/contacts";
import { addNotification } from "@/lib/repositories/notifications";
import { cancelRecipientQueue } from "@/lib/campaigns/monitoring";
import { localDayKey } from "@/lib/scheduling/window";
import { reportError } from "@/lib/observability/report";
import { enforceRateLimit } from "@/lib/util/rateLimit";
import { verifyUnsubscribeToken } from "@/lib/unsubscribe/token";

type Params = { params: Promise<{ token: string }> };

const pageHeaders = {
  "Cache-Control": "no-store, max-age=0",
  "Content-Type": "text/html; charset=utf-8",
  "X-Robots-Tag": "noindex, nofollow",
};

function page(title: string, message: string, action = ""): NextResponse {
  const form = action
    ? `<form method="post" action="${action}">
        <input type="hidden" name="List-Unsubscribe" value="One-Click">
        <button type="submit">Unsubscribe</button>
      </form>`
    : "";
  return new NextResponse(
    // Standalone document with no access to the app stylesheet, so the brand
    // neutrals are inlined here. Values mirror app/globals.css.
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><style>body{margin:0;background:#f1f4f8;color:#0f1729;font:16px/1.55 system-ui,sans-serif}main{box-sizing:border-box;max-width:560px;margin:12vh auto;padding:32px;border:1px solid #c7cfdd;border-radius:10px;background:#fff}h1{margin:0 0 12px;font-size:28px}p{color:#5a6478}button{min-height:44px;margin-top:12px;padding:0 20px;border:0;border-radius:8px;background:#2354c7;color:#fff;font:inherit;font-weight:650;cursor:pointer}button:hover{background:#1b429e}button:focus-visible{outline:3px solid #2354c7;outline-offset:3px}</style></head><body><main><h1>${title}</h1><p>${message}</p>${form}</main></body></html>`,
    { status: 200, headers: pageHeaders }
  );
}

/**
 * A GET never changes subscription state. This is intentional because email
 * security scanners routinely follow links before a person sees a message.
 */
export async function GET(_req: NextRequest, { params }: Params) {
  const { token } = await params;
  const payload = verifyUnsubscribeToken(token);
  if (!payload) {
    return page(
      "This link is no longer available",
      "The unsubscribe link is invalid or expired. Reply to the sender and ask to be removed."
    );
  }
  return page(
    "Stop emails from this sender?",
    "Confirm once and Cadence will add this address to the sender's do-not-email list.",
    `/api/u/${encodeURIComponent(token)}`
  );
}

export async function POST(req: NextRequest, { params }: Params) {
  const { token } = await params;
  const payload = verifyUnsubscribeToken(token);
  if (!payload) {
    return page(
      "This link is no longer available",
      "The unsubscribe link is invalid or expired. Reply to the sender and ask to be removed."
    );
  }

  const contentType = req.headers.get("content-type") ?? "";
  let confirmed = false;
  if (contentType.includes("application/x-www-form-urlencoded")) {
    const form = await req.formData().catch(() => null);
    confirmed = form?.get("List-Unsubscribe") === "One-Click";
  }
  if (!confirmed) {
    return new NextResponse("List-Unsubscribe=One-Click is required.", {
      status: 400,
      headers: { "Cache-Control": "no-store" },
    });
  }

  const key = crypto.createHash("sha256").update(token).digest("hex").slice(0, 40);
  const allowed = await enforceRateLimit(
    "one-click-unsubscribe",
    key,
    12,
    60 * 60 * 1000,
    { failClosed: true }
  );
  if (!allowed) {
    return new NextResponse("Too many requests. Try again later.", {
      status: 429,
      headers: { "Cache-Control": "no-store", "Retry-After": "60" },
    });
  }

  const owner: OwnerRef = {
    userId: payload.ownerUserId,
    organizationId: payload.organizationId,
  };
  try {
    const [campaign, recipient] = await Promise.all([
      getCampaign(owner, payload.campaignId),
      getRecipient(owner, payload.campaignId, payload.recipientId),
    ]);
    if (!campaign || !recipient) {
      return page(
        "Request received",
        "This address is protected from further campaign email."
      );
    }
    const now = Date.now();
    const applied = await commitRecipientOutcome(
      owner,
      payload.campaignId,
      payload.recipientId,
      "UNSUBSCRIBE",
      { status: "UNSUBSCRIBED", unsubscribedAt: now },
      localDayKey(now, campaign.schedule.timezone),
      { suppressionSource: "ONE_CLICK" }
    );

    await cancelRecipientQueue(
      owner,
      payload.campaignId,
      payload.recipientId
    );
    if (applied) {
      await Promise.all([
        recordEngagementByEmail(
          owner,
          recipient.normalizedEmailSnapshot,
          "UNSUBSCRIBED",
          now
        ),
        recordEvent(owner, payload.campaignId, {
          type: "UNSUBSCRIBE",
          message: `${recipient.emailSnapshot} used the one-click unsubscribe link.`,
          severity: "WARNING",
          recipientEmail: recipient.emailSnapshot,
        }),
        addNotification(owner, {
          type: "UNSUBSCRIBE",
          title: "Unsubscribe received",
          body: `${recipient.emailSnapshot} opted out and was added to your do-not-email list.`,
          severity: "WARNING",
          campaignId: payload.campaignId,
        }),
      ]);
    }
  } catch (error) {
    reportError(error, { scope: "one-click-unsubscribe" });
    return new NextResponse("Unable to process the request right now.", {
      status: 503,
      headers: { "Cache-Control": "no-store", "Retry-After": "60" },
    });
  }

  return page(
    "You are unsubscribed",
    "This address was added to the sender's do-not-email list. No further action is needed."
  );
}
