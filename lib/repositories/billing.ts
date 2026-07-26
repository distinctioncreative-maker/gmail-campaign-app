import "server-only";
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
