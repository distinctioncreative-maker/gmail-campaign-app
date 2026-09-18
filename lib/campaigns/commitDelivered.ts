import "server-only";
import {
  commitDeliveryResult,
  getIdempotencyStatus,
  type OwnerRef,
} from "@/lib/repositories/campaigns";

/** Attempts allowed for the bookkeeping AFTER a delivery that already happened. */
const MAX_COMMIT_ATTEMPTS = 3;

/**
 * Record a delivery that has already left.
 *
 * Gmail returned a message id, so the outcome is not ambiguous: it is known,
 * and only the bookkeeping is outstanding. A transient Firestore failure here
 * used to be filed as "we cannot confirm whether this was delivered", which is
 * false, and it counted toward the auto-pause as though the mailbox were
 * broken.
 *
 * Retrying is safe in a way retrying a send never is. The transaction is
 * guarded by the reservation still being RESERVED, so an attempt either
 * commits or discovers that an earlier one already did. It cannot send a
 * second email, because it does not send.
 *
 * On discovering an earlier attempt won, the follow-up's committed-ness is
 * unknown and reported as false. That is deliberately safe: the follow-up is a
 * durable outbox record written inside the same transaction, and
 * `repairOwner` publishes SCHEDULED items that carry no Cloud Task name. The
 * worst case is that the next step is enqueued by the sweep instead of here.
 */
export async function commitDelivered(
  owner: OwnerRef,
  campaignId: string,
  idempotencyKey: string,
  input: Parameters<typeof commitDeliveryResult>[2]
): Promise<{ nextFollowupCommitted: boolean }> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_COMMIT_ATTEMPTS; attempt++) {
    try {
      return await commitDeliveryResult(owner, campaignId, input);
    } catch (err) {
      lastError = err;
      const status = await getIdempotencyStatus(owner, campaignId, idempotencyKey).catch(
        () => null
      );
      if (status === "SENT" || status === "DRAFTED") {
        return { nextFollowupCommitted: false };
      }
      if (attempt < MAX_COMMIT_ATTEMPTS) {
        await new Promise((resolve) => setTimeout(resolve, 200 * 2 ** (attempt - 1)));
      }
    }
  }
  throw lastError;
}
