import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/requireUser";
import { handleApiErrors } from "@/lib/api";
import { billingConfigured } from "@/lib/billing/stripe";
import { PLANS } from "@/lib/billing/plans";
import { getOrgSettings } from "@/lib/repositories/orgSettings";

/** Current plan + subscription state for the billing UI. */
export const GET = handleApiErrors(async () => {
  const ctx = await requireRole("ADMIN");
  const settings = await getOrgSettings(ctx.organizationId);
  const b = settings.billing;
  return NextResponse.json({
    configured: billingConfigured(),
    plan: b.plan,
    planName: PLANS[b.plan].name,
    status: b.status,
    seats: b.seats,
    currentPeriodEnd: b.currentPeriodEnd,
    hasSubscription: Boolean(b.stripeCustomerId),
  });
});
