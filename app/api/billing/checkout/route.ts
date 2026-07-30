import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth/requireUser";
import { handleApiErrors } from "@/lib/api";
import { env } from "@/lib/env";
import { PLANS } from "@/lib/billing/plans";
import { billingConfigured, createCheckoutSession } from "@/lib/billing/stripe";
import { getOrgSettings } from "@/lib/repositories/orgSettings";
import { listMembers } from "@/lib/repositories/orgSettings";

const BodySchema = z.object({
  plan: z.enum(["STARTER", "TEAM"]),
  seats: z.number().int().min(1).max(500).optional(),
});

/** Start a Stripe Checkout for a subscription; returns the hosted URL. */
export const POST = handleApiErrors(async (req: NextRequest) => {
  const ctx = await requireRole("ADMIN");
  if (!billingConfigured()) {
    return NextResponse.json({ error: "Billing isn't available yet." }, { status: 503 });
  }
  const { plan, seats } = BodySchema.parse(await req.json());

  const priceEnv = PLANS[plan].stripePriceEnv;
  const priceId = priceEnv ? (env[priceEnv as keyof typeof env] as string) : "";
  if (!priceId) {
    return NextResponse.json({ error: "That plan isn't configured for checkout." }, { status: 503 });
  }

  const settings = await getOrgSettings(ctx.organizationId);
  if (
    settings.billing.stripeSubscriptionId &&
    ["trialing", "active", "past_due"].includes(settings.billing.status)
  ) {
    return NextResponse.json(
      { error: "Use Manage billing to change an existing subscription." },
      { status: 409 }
    );
  }

  // Charge for at least every active member. A client cannot submit a lower
  // seat count than the roster it is purchasing team access for.
  const activeMembers =
    plan === "TEAM"
      ? (await listMembers(ctx.organizationId)).filter((member) => member.active).length
      : 1;
  const quantity =
    plan === "TEAM"
      ? Math.max(PLANS.TEAM.minimumSeats, activeMembers, seats ?? activeMembers)
      : 1;

  const base = env.APP_BASE_URL.replace(/\/$/, "");
  const session = await createCheckoutSession({
    priceId,
    quantity,
    customerId: settings.billing.stripeCustomerId,
    customerEmail: ctx.email,
    clientReferenceId: ctx.organizationId,
    metadata: {
      organizationId: ctx.organizationId,
      plan,
      seats: String(quantity),
    },
    successUrl: `${base}/settings?billing=success`,
    cancelUrl: `${base}/settings?billing=cancelled`,
  });
  return NextResponse.json({ url: session.url });
});
