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
  const parts = Object.fromEntries(sigHeader.split(",").map((p) => p.split("=") as [string, string]));
  const t = parts.t;
  const v1 = parts.v1;
  if (!t || !v1) throw new Error("Malformed signature header");
  const expected = crypto.createHmac("sha256", secret).update(`${t}.${payload}`).digest("hex");
  const ok =
    expected.length === v1.length &&
    crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(v1));
  if (!ok) throw new Error("Signature mismatch");
  if (Math.abs(Date.now() / 1000 - Number(t)) > 300) throw new Error("Timestamp outside tolerance");
  return JSON.parse(payload);
}
