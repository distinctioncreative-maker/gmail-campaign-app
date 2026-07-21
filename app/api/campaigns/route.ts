import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth/requireUser";
import { handleApiErrors } from "@/lib/api";
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
});

/** Create a DRAFT campaign, defaulting schedule values from the user's
 * sending defaults. */
export const POST = handleApiErrors(async (req: NextRequest) => {
  const ctx = await requireUser();
  const input = CreateSchema.parse(await req.json());
  const profile = await getSenderProfile(ctx);

  const campaign = await createCampaign(ctx, {
    name: input.name,
    description: input.description,
    status: "DRAFT",
    initialTemplateId: input.initialTemplateId,
    templateRotation: input.templateRotation,
    sequenceId: input.sequenceId,
    sourceType: "CONTACTS",
    sourceReference: null,
    schedule: CampaignScheduleSchema.parse({
      timezone: profile.timezone,
      allowedWeekdays: profile.sendingDefaults.allowedWeekdays,
      sendWindowStart: profile.sendingDefaults.sendWindowStart,
      sendWindowEnd: profile.sendingDefaults.sendWindowEnd,
      dailySendLimit: profile.sendingDefaults.dailySendLimit,
      emailsPerBatch: profile.sendingDefaults.emailsPerBatch,
      minDelaySeconds: profile.sendingDefaults.minDelaySeconds,
      maxDelaySeconds: profile.sendingDefaults.maxDelaySeconds,
      interBatchDelayMinutes: profile.sendingDefaults.interBatchDelayMinutes,
      ...input.schedule,
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
    resumedAt: null,
    stoppedAt: null,
    completedAt: null,
  });

  return NextResponse.json({ campaign });
});
