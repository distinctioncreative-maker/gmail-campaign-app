import "server-only";
import crypto from "node:crypto";
import { env } from "@/lib/env";

const API = "https://api.stripe.com/v1";

export function billingConfigured(): boolean {
  return Boolean(env.STRIPE_SECRET_KEY);
}

export class BillingNotConfiguredError extends Error {
  constructor() {
    super("Billing isn't set up yet.");
  }
}

function validSeatQuantity(value: unknown): number | null {
  const quantity = Number(value);
  return Number.isInteger(quantity) && quantity >= 1 && quantity <= 500
    ? quantity
    : null;
}

/**
 * Resolve the billable quantity from Stripe payloads. Checkout Sessions do
 * not include expanded line items, so their signed metadata is authoritative.
 * Subscription updates do include current items and must prefer them over the
 * original checkout metadata, which otherwise goes stale after a portal
 * quantity change.
 */
export function resolveStripeSeatCount(
  obj: Record<string, unknown>,
  metadata: Record<string, string>,
  preferSubscriptionItems: boolean
): number {
  const items = obj.items as { data?: Array<{ quantity?: unknown }> } | undefined;
  const fromItems = validSeatQuantity(items?.data?.[0]?.quantity);
  const fromMetadata = validSeatQuantity(metadata.seats);
  return preferSubscriptionItems
    ? fromItems ?? fromMetadata ?? 1
    : fromMetadata ?? fromItems ?? 1;
}

/** Encode a nested object as Stripe's form format (a[b]=c). */
function form(obj: Record<string, unknown>, prefix = ""): string {
  const parts: string[] = [];
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (typeof v === "object") parts.push(form(v as Record<string, unknown>, key));
    else parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(v))}`);
  }
  return parts.filter(Boolean).join("&");
}

async function stripe<T>(path: string, body: Record<string, unknown>): Promise<T> {
  if (!billingConfigured()) throw new BillingNotConfiguredError();
  const res = await fetch(`${API}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: form(body),
  });
  const json = (await res.json()) as T & { error?: { message?: string } };
  if (!res.ok) throw new Error(json.error?.message ?? `Stripe error (${res.status})`);
  return json;
}

/** Create a Checkout Session for a subscription and return its hosted URL. */
export async function createCheckoutSession(input: {
  priceId: string;
  quantity: number;
  customerId?: string | null;
  customerEmail?: string;
  clientReferenceId: string;
  metadata: Record<string, string>;
  successUrl: string;
  cancelUrl: string;
  /** Free days before the first charge. Zero means bill immediately. */
  trialDays?: number;
}): Promise<{ url: string; id: string }> {
  const body: Record<string, unknown> = {
    mode: "subscription",
    "line_items[0][price]": input.priceId,
    "line_items[0][quantity]": input.quantity,
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
    client_reference_id: input.clientReferenceId,
    allow_promotion_codes: "true",
  };
  if (input.trialDays && input.trialDays > 0) {
    body["subscription_data[trial_period_days]"] = String(input.trialDays);
    /**
     * Cancel rather than bill if the trial ends with no usable payment method.
     * Checkout collects a card up front, so this is the edge where that card
     * later fails or is removed. Cancelling leaves someone unsubscribed, which
     * they can fix; the alternative leaves a subscription in an unpaid state
     * that keeps retrying against a card its owner already withdrew.
     */
    body["subscription_data[trial_settings][end_behavior][missing_payment_method]"] = "cancel";
  }
  if (input.customerId) body.customer = input.customerId;
  else if (input.customerEmail) body.customer_email = input.customerEmail;
  // Carry plan + org on both the session and the resulting subscription so the
  // webhook can resolve them from either event.
  for (const [k, v] of Object.entries(input.metadata)) {
    body[`metadata[${k}]`] = v;
    body[`subscription_data[metadata][${k}]`] = v;
  }
  const s = await stripe<{ id: string; url: string }>("/checkout/sessions", body);
  return { url: s.url, id: s.id };
}

/** Create a Billing Portal session so a customer can manage/cancel. */
export async function createPortalSession(customerId: string, returnUrl: string): Promise<{ url: string }> {
  return stripe<{ url: string }>("/billing_portal/sessions", { customer: customerId, return_url: returnUrl });
}

/**
 * Verify a Stripe webhook signature (the `Stripe-Signature` header) using the
 * signing secret, without the SDK. Returns the parsed event when valid, or
 * throws. Guards against replay with a 5-minute tolerance.
 */
export function verifyWebhook(payload: string, sigHeader: string): { type: string; data: { object: Record<string, unknown> } } {
  const secret = env.STRIPE_WEBHOOK_SECRET;
  if (!secret) throw new Error("Webhook secret not configured");
  const parsed = sigHeader.split(",").map((part) => {
    const index = part.indexOf("=");
    return index > 0
      ? { key: part.slice(0, index).trim(), value: part.slice(index + 1).trim() }
      : { key: "", value: "" };
  });
  const t = parsed.find((part) => part.key === "t")?.value;
  const signatures = parsed
    .filter((part) => part.key === "v1")
    .map((part) => part.value);
  if (!t || signatures.length === 0 || !Number.isFinite(Number(t))) {
    throw new Error("Malformed signature header");
  }
  const expected = crypto.createHmac("sha256", secret).update(`${t}.${payload}`).digest("hex");
  const ok = signatures.some(
    (signature) =>
      expected.length === signature.length &&
      crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature))
  );
  if (!ok) throw new Error("Signature mismatch");
  if (Math.abs(Date.now() / 1000 - Number(t)) > 300) throw new Error("Timestamp outside tolerance");
  return JSON.parse(payload);
}
