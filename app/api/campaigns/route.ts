import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth/requireUser";
import { handleApiErrors } from "@/lib/api";
import { getOrgSettings } from "@/lib/repositories/orgSettings";
import { PLANS } from "@/lib/billing/plans";
import {
  createCampaign,
  listCampaigns,
  ownerFromCtx,
} from "@/lib/repositories/campaigns";
import {
  CampaignScheduleSchema,
  DraftStrategySchema,
  PriorContactPolicySchema,
} from "@/schemas/campaign";
import { getSenderProfile } from "@/lib/repositories/userSettings";

export const GET = handleApiErrors(async () => {
  const ctx = await requireUser();
  const campaigns = await listCampaigns(ownerFromCtx(ctx));
  return NextResponse.json({ campaigns });
});

const CreateSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(1000).default(""),
  initialTemplateId: z.string().nullable().default(null),
  templateRotation: z.array(z.string()).max(10).default([]),
  sequenceId: z.string().nullable().default(null),
  schedule: CampaignScheduleSchema.partial().default({}),
  priorContactPolicy: PriorContactPolicySchema.default("ONLY_NEW"),
  priorContactExcludeDays: z.number().int().min(1).max(365).default(30),
  draftStrategy: DraftStrategySchema.default("SEND"),
  /** When the campaign was started from a saved lead list, its id. */
  sourceListId: z.string().nullable().default(null),
});

/** Create a DRAFT campaign, defaulting schedule values from the user's
 * sending defaults. */
export const POST = handleApiErrors(async (req: NextRequest) => {
  const ctx = await requireUser();
  const input = CreateSchema.parse(await req.json());
  const [profile, settings] = await Promise.all([getSenderProfile(ctx), getOrgSettings(ctx.organizationId)]);

  // Daily volume is capped by the org's plan (Solo/FREE lowest, higher tiers
  // raise it) for deliverability safety.
  const cap = PLANS[settings.billing.plan].maxDailySends;
  const requestedLimit = input.schedule?.dailySendLimit ?? profile.sendingDefaults.dailySendLimit;
  const dailySendLimit = Math.min(requestedLimit, cap);

  const campaign = await createCampaign(ctx, {
    name: input.name,
    description: input.description,
    status: "DRAFT",
    initialTemplateId: input.initialTemplateId,
    templateRotation: input.templateRotation,
    sequenceId: input.sequenceId,
    sourceType: input.sourceListId ? "LEAD_LIST" : "CONTACTS",
    sourceReference: input.sourceListId,
    schedule: CampaignScheduleSchema.parse({
      timezone: profile.timezone,
      allowedWeekdays: profile.sendingDefaults.allowedWeekdays,
      sendWindowStart: profile.sendingDefaults.sendWindowStart,
      sendWindowEnd: profile.sendingDefaults.sendWindowEnd,
      emailsPerBatch: profile.sendingDefaults.emailsPerBatch,
      minDelaySeconds: profile.sendingDefaults.minDelaySeconds,
      maxDelaySeconds: profile.sendingDefaults.maxDelaySeconds,
      interBatchDelayMinutes: profile.sendingDefaults.interBatchDelayMinutes,
      ...input.schedule,
      // Enforce the tenant's safe ceiling regardless of requested/default.
      dailySendLimit,
    }),
    gmailQuotaReserve: 50,
    priorContactPolicy: input.priorContactPolicy,
    priorContactExcludeDays: input.priorContactExcludeDays,
    draftStrategy: input.draftStrategy,
    totalRecipients: 0,
    eligibleRecipients: 0,
    excludedRecipients: 0,
    draftedCount: 0,
    sentCount: 0,
    replyCount: 0,
    bounceCount: 0,
    unsubscribeCount: 0,
    followupSentCount: 0,
    errorCount: 0,
    followupsPaused: false,
    startedAt: null,
    pausedAt: null,
    deferredDayKey: null,
    archived: false,
    resumedAt: null,
    stoppedAt: null,
    completedAt: null,
  });

  return NextResponse.json({ campaign });
});
