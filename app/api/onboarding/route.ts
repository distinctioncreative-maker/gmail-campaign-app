import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth/requireUser";
import { handleApiErrors } from "@/lib/api";
import { updateOnboardingStatus } from "@/lib/repositories/users";
import { OnboardingStatusSchema } from "@/schemas/user";
import { seedStarterTemplates } from "@/lib/onboarding/seed";

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

  // Also here, not only in the workspace step: an invited member joins an
  // existing workspace and never sees that step, and templates are per-user,
  // so without this they would land on an empty Templates page.
  const seeded = await seedStarterTemplates(ctx);

  return NextResponse.json({ ok: true, seededTemplates: seeded });
});
