import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { resolveStripeSeatCount, verifyWebhook } from "@/lib/billing/stripe";
import { saveBillingFromStripe, type SubscriptionStatus } from "@/lib/repositories/orgSettings";
import {
  claimStripeEvent,
  completeStripeEvent,
  failStripeEvent,
  setCustomerPointer,
  orgForCustomer,
} from "@/lib/repositories/billing";
import { isPlanId } from "@/lib/billing/plans";
import { reportError } from "@/lib/observability/report";

export const dynamic = "force-dynamic";

const EventSchema = z.object({
  id: z.string().min(1),
  type: z.string().min(1),
  created: z.number().int().nonnegative(),
  data: z.object({ object: z.record(z.string(), z.unknown()) }),
});

function mapStatus(s: string): SubscriptionStatus {
  if (s === "active" || s === "trialing" || s === "past_due" || s === "canceled") return s;
  return s === "incomplete" || s === "unpaid" ? "past_due" : "none";
}

function stringId(value: unknown): string | null {
  return typeof value === "string" && value ? value : null;
}

function metadata(obj: Record<string, unknown>): Record<string, string> {
  const raw = obj.metadata;
  if (!raw || typeof raw !== "object") return {};
  return Object.fromEntries(
    Object.entries(raw).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string"
    )
  );
}

/**
 * Stripe webhook. Public but authenticated by signature (no session). Keeps the
 * org's plan/subscription state in sync. Returns 200 for completed/duplicate
 * events, 400 for an invalid signature, and 500 for transient handler failures
 * so Stripe retries instead of silently losing subscription state.
 */
export async function POST(req: NextRequest) {
  const payload = await req.text();
  const sig = req.headers.get("stripe-signature") ?? "";
  let event: z.infer<typeof EventSchema>;
  try {
    event = EventSchema.parse(verifyWebhook(payload, sig));
  } catch (err) {
    reportError(err, { scope: "billing-webhook" });
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  const claim = await claimStripeEvent({
    eventId: event.id,
    type: event.type,
    created: event.created,
  });
  if (claim === "PROCESSED") {
    return NextResponse.json({ received: true, duplicate: true });
  }
  if (claim === "BUSY") {
    // Do not acknowledge a concurrent in-flight delivery. If that worker
    // crashes, Stripe must retain this delivery for a later retry.
    return NextResponse.json({ error: "Event is already processing" }, { status: 409 });
  }

  try {
    const obj = event.data.object;
    if (event.type === "checkout.session.completed") {
      const meta = metadata(obj);
      const orgId = meta.organizationId || stringId(obj.client_reference_id) || "";
      const customer = stringId(obj.customer);
      const subscription = stringId(obj.subscription);
      if (orgId && isPlanId(meta.plan)) {
        if (customer) await setCustomerPointer(customer, orgId);
        await saveBillingFromStripe(
          orgId,
          event.created,
          {
            plan: meta.plan,
            status:
              obj.payment_status === "paid" || obj.payment_status === "no_payment_required"
                ? "active"
                : "past_due",
            stripeCustomerId: customer ?? null,
            stripeSubscriptionId: subscription ?? null,
            seats: resolveStripeSeatCount(obj, meta, false),
          },
          1
        );
      }
    } else if (event.type === "customer.subscription.updated") {
      const meta = metadata(obj);
      const customer = stringId(obj.customer);
      const orgId =
        meta.organizationId || (customer ? await orgForCustomer(customer) : null);
      if (orgId) {
        await saveBillingFromStripe(
          orgId,
          event.created,
          {
            status: mapStatus(String(obj.status)),
            currentPeriodEnd:
              typeof obj.current_period_end === "number"
                ? obj.current_period_end * 1000
                : null,
            seats: resolveStripeSeatCount(obj, meta, true),
            ...(isPlanId(meta.plan) ? { plan: meta.plan } : {}),
          },
          2
        );
      }
    } else if (event.type === "customer.subscription.deleted") {
      const meta = metadata(obj);
      const customer = stringId(obj.customer);
      const orgId =
        meta.organizationId || (customer ? await orgForCustomer(customer) : null);
      if (orgId) {
        await saveBillingFromStripe(
          orgId,
          event.created,
          {
            status: "canceled",
            plan: "FREE",
            seats: 1,
            stripeSubscriptionId: null,
            currentPeriodEnd: null,
          },
          3
        );
      }
    }
    await completeStripeEvent(event.id);
  } catch (err) {
    reportError(err, { scope: "billing-webhook-handler" });
    const message = err instanceof Error ? err.message : String(err);
    await failStripeEvent(event.id, message).catch(() => undefined);
    // Non-2xx is intentional: Stripe retries transient Firestore/handler
    // failures, so subscription state cannot be silently lost.
    return NextResponse.json({ error: "Webhook processing failed" }, { status: 500 });
  }
  return NextResponse.json({ received: true });
}
