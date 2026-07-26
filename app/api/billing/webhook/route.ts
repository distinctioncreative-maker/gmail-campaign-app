import { NextRequest, NextResponse } from "next/server";
import { verifyWebhook } from "@/lib/billing/stripe";
import { saveBilling, type SubscriptionStatus } from "@/lib/repositories/orgSettings";
import { setCustomerPointer, orgForCustomer } from "@/lib/repositories/billing";
import { isPlanId, type PlanId } from "@/lib/billing/plans";
import { reportError } from "@/lib/observability/report";

export const dynamic = "force-dynamic";

function mapStatus(s: string): SubscriptionStatus {
  if (s === "active" || s === "trialing" || s === "past_due" || s === "canceled") return s;
  return s === "incomplete" || s === "unpaid" ? "past_due" : "none";
}

/**
 * Stripe webhook. Public but authenticated by signature (no session). Keeps the
 * org's plan/subscription state in sync. Always returns 200 on handled events
 * so Stripe doesn't retry needlessly; returns 400 only on a bad signature.
 */
export async function POST(req: NextRequest) {
  const payload = await req.text();
  const sig = req.headers.get("stripe-signature") ?? "";
  let event: { type: string; data: { object: Record<string, unknown> } };
  try {
    event = verifyWebhook(payload, sig);
  } catch (err) {
    reportError(err, { scope: "billing-webhook" });
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  try {
    const obj = event.data.object;
    if (event.type === "checkout.session.completed") {
      const meta = (obj.metadata ?? {}) as Record<string, string>;
      const orgId = meta.organizationId || (obj.client_reference_id as string) || "";
      const customer = obj.customer as string | undefined;
      const subscription = obj.subscription as string | undefined;
      const plan: PlanId = isPlanId(meta.plan) ? meta.plan : "TEAM";
      if (orgId) {
        if (customer) await setCustomerPointer(customer, orgId);
        await saveBilling(orgId, {
          plan,
          status: "active",
          stripeCustomerId: customer ?? null,
          stripeSubscriptionId: subscription ?? null,
        });
      }
    } else if (event.type === "customer.subscription.updated") {
      const customer = obj.customer as string | undefined;
      const orgId = customer ? await orgForCustomer(customer) : null;
      if (orgId) {
        const meta = (obj.metadata ?? {}) as Record<string, string>;
        await saveBilling(orgId, {
          status: mapStatus(String(obj.status)),
          currentPeriodEnd: typeof obj.current_period_end === "number" ? obj.current_period_end * 1000 : null,
          ...(isPlanId(meta.plan) ? { plan: meta.plan } : {}),
        });
      }
    } else if (event.type === "customer.subscription.deleted") {
      const customer = obj.customer as string | undefined;
      const orgId = customer ? await orgForCustomer(customer) : null;
      if (orgId) {
        await saveBilling(orgId, { status: "canceled", plan: "FREE", stripeSubscriptionId: null });
      }
    }
  } catch (err) {
    reportError(err, { scope: "billing-webhook-handler" });
    // Still 200 so Stripe doesn't hammer retries on a transient our-side issue.
  }
  return NextResponse.json({ received: true });
}
