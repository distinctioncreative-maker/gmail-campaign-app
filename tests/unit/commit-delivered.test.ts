import { afterEach, describe, expect, it, vi } from "vitest";

const commitDeliveryResult = vi.fn();
const getIdempotencyStatus = vi.fn();
vi.mock("@/lib/repositories/campaigns", () => ({
  commitDeliveryResult: (...a: unknown[]) => commitDeliveryResult(...a),
  getIdempotencyStatus: (...a: unknown[]) => getIdempotencyStatus(...a),
}));

const { commitDelivered } = await import("@/lib/campaigns/commitDelivered");

/**
 * The bookkeeping after a delivery that already happened.
 *
 * Gmail returned a message id, so the outcome is known and only the record is
 * outstanding. A transient Firestore failure here used to be filed as "we
 * cannot confirm whether this was delivered" and counted toward the auto-pause
 * as though the mailbox were broken.
 */

const OWNER = { userId: "u1", organizationId: "o1" };
// The shape is not what this is testing; the retry policy is.
const INPUT = { idempotencyKey: "k1" } as never;

afterEach(() => vi.clearAllMocks());

describe("commitDelivered", () => {
  it("rides out a transient failure instead of calling the delivery unknown", async () => {
    commitDeliveryResult
      .mockRejectedValueOnce(new Error("DEADLINE_EXCEEDED"))
      .mockResolvedValueOnce({ nextFollowupCommitted: true });
    getIdempotencyStatus.mockResolvedValue("RESERVED");

    await expect(commitDelivered(OWNER, "c1", "k1", INPUT)).resolves.toEqual({
      nextFollowupCommitted: true,
    });
    expect(commitDeliveryResult).toHaveBeenCalledTimes(2);
  });

  it("stops the moment an earlier attempt turns out to have won", async () => {
    /**
     * The transaction is guarded by the reservation still being RESERVED, so a
     * status of SENT means a previous attempt committed and only its answer
     * was lost. Committing again is impossible; reporting failure would be a
     * lie.
     */
    commitDeliveryResult.mockRejectedValue(new Error("ABORTED"));
    getIdempotencyStatus.mockResolvedValueOnce("SENT");

    await expect(commitDelivered(OWNER, "c1", "k1", INPUT)).resolves.toEqual({
      nextFollowupCommitted: false,
    });
    // Did not keep hammering a transaction that cannot succeed.
    expect(commitDeliveryResult).toHaveBeenCalledTimes(1);
  });

  it("treats a committed draft the same way", async () => {
    commitDeliveryResult.mockRejectedValue(new Error("ABORTED"));
    getIdempotencyStatus.mockResolvedValueOnce("DRAFTED");
    await expect(commitDelivered(OWNER, "c1", "k1", INPUT)).resolves.toEqual({
      nextFollowupCommitted: false,
    });
  });

  it("gives up after a bounded number of attempts and rethrows", async () => {
    // Never silently swallow: a delivery that genuinely cannot be recorded has
    // to reach the caller so it is logged and surfaced.
    const err = new Error("DEADLINE_EXCEEDED");
    commitDeliveryResult.mockRejectedValue(err);
    getIdempotencyStatus.mockResolvedValue("RESERVED");

    await expect(commitDelivered(OWNER, "c1", "k1", INPUT)).rejects.toBe(err);
    expect(commitDeliveryResult).toHaveBeenCalledTimes(3);
  });

  it("never sends anything, whatever happens", async () => {
    // The property that makes retrying safe here and unsafe one step earlier.
    const source = (await import("node:fs")).readFileSync(
      "lib/campaigns/commitDelivered.ts",
      "utf8"
    );
    expect(source).not.toMatch(/dispatchSend|sendEmail|users\.messages/);
  });

  it("keeps working when the status probe itself fails", async () => {
    commitDeliveryResult
      .mockRejectedValueOnce(new Error("ABORTED"))
      .mockResolvedValueOnce({ nextFollowupCommitted: false });
    getIdempotencyStatus.mockRejectedValueOnce(new Error("unreachable"));
    await expect(commitDelivered(OWNER, "c1", "k1", INPUT)).resolves.toEqual({
      nextFollowupCommitted: false,
    });
  });
});
