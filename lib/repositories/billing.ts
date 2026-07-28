import "server-only";
import { Timestamp } from "firebase-admin/firestore";
import { firestore } from "@/lib/firebase/admin";

/** Map a Stripe customer id to an organization, so subscription webhooks can
 * resolve the org in a single read instead of scanning. */
export async function setCustomerPointer(customerId: string, organizationId: string): Promise<void> {
  await firestore().collection("stripeCustomers").doc(customerId).set({ organizationId, updatedAt: Date.now() });
}

export async function orgForCustomer(customerId: string): Promise<string | null> {
  const snap = await firestore().collection("stripeCustomers").doc(customerId).get();
  return snap.exists ? ((snap.data()?.organizationId as string) ?? null) : null;
}

export type StripeEventClaim = "CLAIMED" | "PROCESSED" | "BUSY";

/** Idempotently claim a Stripe event. A stale/failed processing claim may be
 * reclaimed on Stripe's next delivery; a completed event never runs twice. */
export async function claimStripeEvent(input: {
  eventId: string;
  type: string;
  created: number;
}): Promise<StripeEventClaim> {
  const ref = firestore().collection("stripeEvents").doc(input.eventId);
  return firestore().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const data = snap.data();
    if (data?.status === "PROCESSED") return "PROCESSED";
    if (
      data?.status === "PROCESSING" &&
      typeof data.processingStartedAt === "number" &&
      Date.now() - data.processingStartedAt < 5 * 60 * 1000
    ) {
      return "BUSY";
    }
    tx.set(
      ref,
      {
        eventId: input.eventId,
        type: input.type,
        eventCreated: input.created,
        status: "PROCESSING",
        processingStartedAt: Date.now(),
        lastError: null,
        updatedAt: Date.now(),
      },
      { merge: true }
    );
    return "CLAIMED";
  });
}

export async function completeStripeEvent(eventId: string): Promise<void> {
  await firestore().collection("stripeEvents").doc(eventId).set(
    {
      status: "PROCESSED",
      processedAt: Date.now(),
      updatedAt: Date.now(),
      lastError: null,
      // Keep a long replay-deduplication window without retaining webhook
      // payload metadata forever.
      expiresAt: Timestamp.fromMillis(
        Date.now() + 180 * 24 * 60 * 60 * 1000
      ),
    },
    { merge: true }
  );
}

export async function failStripeEvent(eventId: string, error: string): Promise<void> {
  await firestore().collection("stripeEvents").doc(eventId).set(
    {
      status: "FAILED",
      lastError: error.slice(0, 300),
      updatedAt: Date.now(),
      expiresAt: Timestamp.fromMillis(
        Date.now() + 30 * 24 * 60 * 60 * 1000
      ),
    },
    { merge: true }
  );
}
