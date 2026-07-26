import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/requireUser";
import { handleApiErrors } from "@/lib/api";
import { env } from "@/lib/env";
import { billingConfigured, createPortalSession } from "@/lib/billing/stripe";
import { getOrgSettings } from "@/lib/repositories/orgSettings";

/** Open the Stripe billing portal so an admin can manage or cancel. */
export const POST = handleApiErrors(async () => {
  const ctx = await requireRole("ADMIN");
  if (!billingConfigured()) {
    return NextResponse.json({ error: "Billing isn't available yet." }, { status: 503 });
  }
  const settings = await getOrgSettings(ctx.organizationId);
  if (!settings.billing.stripeCustomerId) {
    return NextResponse.json({ error: "No subscription to manage yet." }, { status: 400 });
  }
  const base = env.APP_BASE_URL.replace(/\/$/, "");
  const session = await createPortalSession(settings.billing.stripeCustomerId, `${base}/settings`);
  return NextResponse.json({ url: session.url });
});
