import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth/requireUser";
import { handleApiErrors } from "@/lib/api";
import { getCampaign, ownerFromCtx } from "@/lib/repositories/campaigns";
import { launchCampaign, validateForLaunch } from "@/lib/campaigns/launch";

const SEND_CONFIRM_THRESHOLD = 100;

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
});

/** Validate and launch a campaign with the selected recipients. */
export const POST = handleApiErrors(async (req: NextRequest, { params }: { params: Promise<{ campaignId: string }> }) => {
  const ctx = await requireUser();
  const { campaignId } = await params;
  const owner = ownerFromCtx(ctx);
  const campaign = await getCampaign(owner, campaignId);
  if (!campaign) return NextResponse.json({ error: "Campaign not found." }, { status: 404 });

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

  const includedCount = body.selections.filter((s) => s.included).length;
  if (includedCount > SEND_CONFIRM_THRESHOLD && body.confirmText !== "SEND") {
    return NextResponse.json(
      {
        error: `This campaign will email ${includedCount} people. Type SEND to confirm.`,
        requiresConfirmation: true,
      },
      { status: 400 }
    );
  }

  const result = await launchCampaign(
    ctx,
    campaign,
    body.selections.map((s) => ({
      contactId: s.contactId,
      included: s.included,
      exclusionReason: s.included ? null : "DESELECTED",
      warning: false,
      overrideReason: s.overrideReason,
    })),
    body.startNow,
    body.personalize
  );

  return NextResponse.json({ ok: true, ...result, warnings: validation.warnings });
});
