import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/requireUser";
import { handleApiErrors } from "@/lib/api";
import {
  getCampaign,
  getRecipient,
  incrementCampaignCounters,
  ownerFromCtx,
  recordEvent,
  updateRecipient,
} from "@/lib/repositories/campaigns";
import { undoContactUnsubscribe } from "@/lib/repositories/contacts";
import { listSuppressions, deactivateSuppression } from "@/lib/repositories/suppressions";

type Params = { params: Promise<{ campaignId: string; recipientId: string }> };

/**
 * Reverse a false-positive unsubscribe: the person replied normally but the
 * detector read it as an opt-out. Reclassifies the recipient as REPLIED,
 * lifts the do-not-email suppression, and fixes the counters. Follow-ups
 * that were cancelled stay cancelled (they replied — sequences stop anyway).
 */
export const POST = handleApiErrors(async (_req: NextRequest, { params }: Params) => {
  const ctx = await requireUser();
  const { campaignId, recipientId } = await params;
  const owner = ownerFromCtx(ctx);

  const campaign = await getCampaign(owner, campaignId);
  if (!campaign) return NextResponse.json({ error: "Campaign not found." }, { status: 404 });
  const recipient = await getRecipient(owner, campaignId, recipientId);
  if (!recipient) return NextResponse.json({ error: "Recipient not found." }, { status: 404 });
  if (recipient.status !== "UNSUBSCRIBED" || recipient.unsubscribedAt === null) {
    return NextResponse.json(
      { error: "This person isn't marked as unsubscribed." },
      { status: 409 }
    );
  }

  const repliedAt = recipient.unsubscribedAt;

  await updateRecipient(owner, campaignId, recipientId, {
    status: "REPLIED",
    repliedAt,
    unsubscribedAt: null,
  });
  await incrementCampaignCounters(owner, campaignId, { unsubscribeCount: -1, replyCount: 1 });

  // Lift the do-not-email entry the monitor created for this address.
  const suppressions = await listSuppressions(ctx, 500);
  const match = suppressions.find(
    (s) =>
      s.active &&
      s.normalizedEmail === recipient.normalizedEmailSnapshot &&
      s.reason === "UNSUBSCRIBED"
  );
  if (match) {
    await deactivateSuppression(ctx, match.suppressionId, match.scope, "Undo: real reply, not an unsubscribe");
  }

  await undoContactUnsubscribe(owner, recipient.normalizedEmailSnapshot, repliedAt);

  await recordEvent(owner, campaignId, {
    type: "REPLY",
    message: `${recipient.emailSnapshot} was mistakenly marked unsubscribed — corrected to a real reply and removed from the do-not-email list.`,
    severity: "INFO",
    recipientEmail: recipient.emailSnapshot,
  });

  return NextResponse.json({
    ok: true,
    message: `${recipient.emailSnapshot} is now counted as a reply and can be emailed again.`,
  });
});
