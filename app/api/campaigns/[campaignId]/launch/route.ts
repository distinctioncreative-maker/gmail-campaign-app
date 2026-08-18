import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth/requireUser";
import { handleApiErrors } from "@/lib/api";
import { assertWritesAllowed } from "@/lib/platform/readonly";
import { enforceUserRateLimit, RATE_LIMITS } from "@/lib/util/userRateLimit";
import {
  claimCampaignLaunch,
  getCampaign,
  ownerFromCtx,
  releaseCampaignLaunch,
} from "@/lib/repositories/campaigns";
import { launchCampaign, validateForLaunch } from "@/lib/campaigns/launch";
import { assessPaceRisk } from "@/lib/campaigns/paceSafety";
import { getOrgSettings } from "@/lib/repositories/orgSettings";
import { PLANS } from "@/lib/billing/plans";
import {
  needsSendConfirmation,
  SEND_CONFIRM_WORD,
} from "@/lib/campaigns/confirmThreshold";


const BodySchema = z.object({
  selections: z
    .array(
      z.object({
        contactId: z.string().min(1),
        included: z.boolean(),
        overrideReason: z.string().max(500).nullable().default(null),
      })
    )
    .min(1)
    .max(5000),
  startNow: z.boolean().default(true),
  confirmText: z.string().optional(),
  validateOnly: z.boolean().default(false),
  personalize: z.boolean().default(false),
  acceptPaceRisk: z.boolean().default(false),
});

/** Validate and launch a campaign with the selected recipients. */
export const POST = handleApiErrors(async (req: NextRequest, { params }: { params: Promise<{ campaignId: string }> }) => {
  const ctx = await requireUser();
  await enforceUserRateLimit(ctx, RATE_LIMITS.campaignLaunch);
  // An incident halt has to cover launching, not only sending: a campaign
  // launched behind a halt would queue up and release all at once when it lifts.
  await assertWritesAllowed();
  const { campaignId } = await params;
  const owner = ownerFromCtx(ctx);
  const campaign = await getCampaign(owner, campaignId);
  if (!campaign) return NextResponse.json({ error: "Campaign not found." }, { status: 404 });

  if (campaign.deletedAt !== null) {
    return NextResponse.json(
      { error: "Restore this campaign from Recently Deleted before launching it." },
      { status: 400 }
    );
  }

  if (campaign.status !== "DRAFT" && campaign.status !== "READY") {
    return NextResponse.json(
      { error: "This campaign has already been started." },
      { status: 400 }
    );
  }

  const body = BodySchema.parse(await req.json());
  const validation = await validateForLaunch(ctx, campaign);

  if (body.validateOnly) return NextResponse.json({ validation });

  if (!validation.ok) {
    return NextResponse.json(
      { error: validation.problems[0], validation },
      { status: 400 }
    );
  }

  const settings = await getOrgSettings(ctx.organizationId);
  const planCap = PLANS[settings.billing.plan].maxDailySends;
  if (campaign.schedule.dailySendLimit > planCap) {
    return NextResponse.json(
      {
        error: `Your ${PLANS[settings.billing.plan].name} plan allows up to ${planCap} emails per day. Lower this campaign's pace before launching.`,
      },
      { status: 400 }
    );
  }

  const paceRisk = assessPaceRisk(campaign.schedule);
  if (paceRisk.risky && !body.acceptPaceRisk) {
    return NextResponse.json(
      {
        error: "This pace risks your sender reputation. Review the warning and explicitly confirm it before launching.",
        requiresPaceConfirmation: true,
        reasons: paceRisk.reasons,
      },
      { status: 400 }
    );
  }

  const selections = [...new Map(body.selections.map((s) => [s.contactId, s])).values()];
  const includedCount = selections.filter((s) => s.included).length;
  if (needsSendConfirmation(includedCount) && body.confirmText !== SEND_CONFIRM_WORD) {
    return NextResponse.json(
      {
        error: `This campaign will email ${includedCount} people. Type SEND to confirm.`,
        requiresConfirmation: true,
      },
      { status: 400 }
    );
  }

  const claimed = await claimCampaignLaunch(owner, campaignId);
  if (!claimed) {
    return NextResponse.json(
      { error: "This campaign is already launching or has already started." },
      { status: 409 }
    );
  }

  let result;
  try {
    result = await launchCampaign(
      ctx,
      claimed,
      selections.map((s) => ({
        contactId: s.contactId,
        included: s.included,
        exclusionReason: s.included ? null : "DESELECTED",
        warning: false,
        overrideReason: s.overrideReason,
      })),
      body.startNow,
      body.personalize
    );
  } catch (err) {
    await releaseCampaignLaunch(owner, campaignId);
    throw err;
  }

  return NextResponse.json({ ok: true, ...result, warnings: validation.warnings });
});
