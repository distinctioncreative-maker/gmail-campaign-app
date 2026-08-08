import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth/requireUser";
import { handleApiErrors } from "@/lib/api";
import {
  getCampaign,
  getRecipient,
  ownerFromCtx,
  recordEvent,
  setDealOutcome,
} from "@/lib/repositories/campaigns";
import { DealStatusSchema } from "@/schemas/campaign";
import { formatDealValue } from "@/lib/campaigns/outcomes";
import { emitWebhookEvent } from "@/lib/webhooks/emit";
import { dealUpdatedData } from "@/lib/webhooks/payload";

type Params = { params: Promise<{ campaignId: string; recipientId: string }> };

const BodySchema = z.object({
  /** Null clears the outcome entirely, which is the undo for a mis-click. */
  dealStatus: DealStatusSchema.nullable(),
  /** Minor units. The client parses currency text; the server only accepts a
   * whole number of cents so a malformed amount can never reach the rollup. */
  dealValueCents: z.number().int().nonnegative().max(1_000_000_000_00).nullable().default(null),
  dealNote: z.string().max(500).default(""),
});

const PAST_TENSE: Record<z.infer<typeof DealStatusSchema>, string> = {
  MEETING_BOOKED: "booked a meeting",
  WON: "was won",
  LOST: "was lost",
};

/**
 * Record what a reply turned into.
 *
 * This is the only place the product learns whether outreach earned anything,
 * so it is deliberately a human action: nothing is inferred from message text.
 * The counter arithmetic happens in a transaction inside `setDealOutcome`,
 * because correcting a value or undoing a mark has to unwind the previous
 * state rather than add to it.
 */
export const POST = handleApiErrors(async (req: NextRequest, { params }: Params) => {
  const ctx = await requireUser();
  const { campaignId, recipientId } = await params;
  const owner = ownerFromCtx(ctx);

  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid outcome." }, { status: 400 });
  }
  const { dealStatus, dealValueCents, dealNote } = parsed.data;

  const campaign = await getCampaign(owner, campaignId);
  if (!campaign) return NextResponse.json({ error: "Campaign not found." }, { status: 404 });
  const recipient = await getRecipient(owner, campaignId, recipientId);
  if (!recipient) return NextResponse.json({ error: "Recipient not found." }, { status: 404 });
  // An outcome describes a conversation, and there is no conversation until
  // someone replies. Without this a stale tab could book revenue against a
  // lead who never answered.
  if (recipient.repliedAt === null) {
    return NextResponse.json(
      { error: "You can only record an outcome once this person has replied." },
      { status: 409 }
    );
  }

  const ok = await setDealOutcome(owner, campaignId, recipientId, {
    dealStatus,
    dealValueCents,
    dealNote,
  });
  if (!ok) return NextResponse.json({ error: "Recipient not found." }, { status: 404 });

  if (dealStatus !== null) {
    const value =
      dealStatus === "WON" && dealValueCents !== null
        ? ` (${formatDealValue(dealValueCents)})`
        : "";
    await recordEvent(owner, campaignId, {
      type: "REPLY",
      message: `${recipient.emailSnapshot} ${PAST_TENSE[dealStatus]}${value}.`,
      severity: "INFO",
      recipientEmail: recipient.emailSnapshot,
    });
  }

  // Emitted for a clear as well as for a mark: a CRM that created a record from
  // the first event has to hear about the undo, or a mis-click stays a booked
  // meeting in their system forever.
  await emitWebhookEvent(
    { organizationId: owner.organizationId, ownerUserId: owner.userId },
    "deal.updated",
    dealUpdatedData({
      campaignId,
      campaignName: campaign.name,
      recipientId,
      email: recipient.emailSnapshot,
      dealStatus,
      dealValueCents,
      dealNote,
      updatedAt: Date.now(),
    })
  );

  return NextResponse.json({ ok: true, dealStatus, dealValueCents, dealNote });
});
