import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth/requireUser";
import { handleApiErrors } from "@/lib/api";
import { updateOnboardingStatus } from "@/lib/repositories/users";
import { OnboardingStatusSchema } from "@/schemas/user";

const ORDER = [
  "NEW",
  "GMAIL_CONNECTED",
  "PROFILE_COMPLETE",
  "DEFAULTS_SET",
  "TEST_PASSED",
  "COMPLETE",
] as const;

const BodySchema = z.object({ status: OnboardingStatusSchema });

/** Advance onboarding. Only forward moves are allowed. */
export const POST = handleApiErrors(async (req: NextRequest) => {
  const ctx = await requireUser();
  const { status } = BodySchema.parse(await req.json());

  const current = ORDER.indexOf(ctx.user.onboardingStatus);
  const next = ORDER.indexOf(status);
  if (next > current) await updateOnboardingStatus(ctx.userId, status);

  return NextResponse.json({ ok: true });
});
