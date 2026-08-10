import "server-only";
import { firestore } from "@/lib/firebase/admin";
import { env } from "@/lib/env";
import { applyUsage, monthKey, type CreditState } from "@/lib/sourcing/quota";

/**
 * The sourcing credit counter, per workspace.
 *
 * One document rather than a subcollection, because the only question ever asked
 * of it is "how many this month", and the only writer is a search.
 *
 * Reserved before the vendor call and reconciled after. Charging only after the
 * response would let a burst of concurrent searches all read the same remaining
 * balance and every one of them pass, which is exactly the shape of the problem
 * the ceiling exists to prevent. Over-reserving and refunding the difference
 * errs toward spending less of the customer's money than they asked for, which is
 * the right direction to be wrong in.
 */

const usageRef = (organizationId: string) =>
  firestore().collection("organizations").doc(organizationId).collection("sourcing").doc("credits");

function defaultState(): CreditState {
  return { month: monthKey(), used: 0, limit: env.SOURCING_MONTHLY_CREDITS };
}

export async function getCreditState(organizationId: string): Promise<CreditState> {
  const snap = await usageRef(organizationId).get();
  if (!snap.exists) return defaultState();
  const data = snap.data() ?? {};
  return {
    month: String(data.month ?? monthKey()),
    used: Number(data.used) || 0,
    // The env value wins over a stored one, so raising the ceiling is a config
    // change rather than a migration across every workspace document.
    limit: env.SOURCING_MONTHLY_CREDITS,
  };
}

/**
 * Reserve credits inside a transaction, returning what was actually granted.
 *
 * Zero means the workspace has none left. The caller must reconcile with
 * `settleReservation` once the vendor says what it charged.
 */
export async function reserveCredits(
  organizationId: string,
  wanted: number
): Promise<{ granted: number; state: CreditState }> {
  const ref = usageRef(organizationId);
  return firestore().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const stored: CreditState = snap.exists
      ? {
          month: String(snap.data()?.month ?? monthKey()),
          used: Number(snap.data()?.used) || 0,
          limit: env.SOURCING_MONTHLY_CREDITS,
        }
      : defaultState();

    const month = monthKey();
    const priorUsed = stored.month === month ? stored.used : 0;
    const available = Math.max(0, stored.limit - priorUsed);
    const granted = Math.max(0, Math.min(Math.floor(wanted), available));

    const next: CreditState = { month, used: priorUsed + granted, limit: stored.limit };
    tx.set(ref, { ...next, updatedAt: Date.now() }, { merge: true });
    return { granted, state: next };
  });
}

/**
 * Correct a reservation to what the vendor actually charged.
 *
 * Almost always a refund, since a search that returned fewer rows than it was
 * allowed to should not cost the difference. A charge above the reservation is
 * possible if a vendor returns more than asked, and is honoured rather than
 * clamped: the money is already spent, and a counter that hides it would let the
 * ceiling be exceeded quietly.
 */
export async function settleReservation(
  organizationId: string,
  reserved: number,
  actuallyUsed: number
): Promise<void> {
  const delta = Math.floor(actuallyUsed) - Math.floor(reserved);
  if (delta === 0) return;
  const ref = usageRef(organizationId);
  await firestore().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const stored: CreditState = snap.exists
      ? {
          month: String(snap.data()?.month ?? monthKey()),
          used: Number(snap.data()?.used) || 0,
          limit: env.SOURCING_MONTHLY_CREDITS,
        }
      : defaultState();
    // A month that rolled over between the reservation and the settlement makes
    // the refund meaningless: the reservation belongs to a total that is no
    // longer being counted.
    if (stored.month !== monthKey()) return;
    const next = applyUsage(stored, delta);
    tx.set(ref, { ...next, updatedAt: Date.now() }, { merge: true });
  });
}
