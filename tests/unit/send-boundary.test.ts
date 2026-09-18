import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Where the risk of a duplicate begins.
 *
 * The send worker refuses to retry anything that happens after
 * `reachedDeliveryAttempt = true`, which is correct: Gmail may hold a message
 * it never got to acknowledge, and a retry would put a second copy in front of
 * a real person.
 *
 * The flag used to be set before `sendEmail()`, and six things inside that
 * function run before an email leaves: the connection lookup, the token
 * decrypt, the OAuth token refresh, an API-call record, the safety gate and
 * the MIME build. A Gmail token that would not refresh was therefore filed as
 * "may have been delivered, cannot confirm" and the recipient was stranded
 * permanently, never having been written to, while five such failures paused
 * the campaign.
 */

const gmailForUser = vi.fn();
vi.mock("@/lib/gmail/client", () => ({
  gmailForUser: (...args: unknown[]) => gmailForUser(...args),
  GmailNotConnectedError: class extends Error {},
}));
vi.mock("@/lib/gmail/safety", () => ({
  applySendSafety: (input: { to: string; subject: string }) => input,
}));

const { prepareSend, dispatchSend, dispatchDraft } = await import("@/lib/gmail/send");

const INPUT = {
  userId: "u1",
  to: "lead@example.com",
  subject: "Hello",
  htmlBody: "<p>Hi</p>",
  testMode: false,
};

afterEach(() => vi.clearAllMocks());

describe("prepareSend", () => {
  it("does the token refresh, so a dead token fails before anything is sent", async () => {
    const send = vi.fn();
    gmailForUser.mockRejectedValueOnce(new Error("invalid_grant"));

    await expect(prepareSend(INPUT)).rejects.toThrow("invalid_grant");
    // The whole point: nothing was dispatched, so this failure is retryable.
    expect(send).not.toHaveBeenCalled();
  });

  it("returns a message ready to send without having sent it", async () => {
    const send = vi.fn();
    gmailForUser.mockResolvedValueOnce({ users: { messages: { send } } });

    const prepared = await prepareSend(INPUT);

    expect(typeof prepared.raw).toBe("string");
    expect(prepared.raw.length).toBeGreaterThan(0);
    expect(send).not.toHaveBeenCalled();
  });

  it("fails on an unsendable unsubscribe URL, still before the wire", async () => {
    const send = vi.fn();
    gmailForUser.mockResolvedValueOnce({ users: { messages: { send } } });
    await expect(
      prepareSend({ ...INPUT, unsubscribeUrl: "javascript:alert(1)" })
    ).rejects.toThrow();
    expect(send).not.toHaveBeenCalled();
  });
});

describe("dispatchSend", () => {
  it("is one API call and nothing else", async () => {
    const send = vi.fn().mockResolvedValue({ data: { id: "m1", threadId: "t1" } });
    gmailForUser.mockResolvedValueOnce({ users: { messages: { send } } });

    const prepared = await prepareSend(INPUT);
    gmailForUser.mockClear();
    const result = await dispatchSend(prepared);

    expect(result.gmailMessageId).toBe("m1");
    expect(send).toHaveBeenCalledTimes(1);
    // No second token refresh: the credential was resolved during prepare.
    expect(gmailForUser).not.toHaveBeenCalled();
  });

  it("treats a reply with no identifiers as a failure rather than a success", async () => {
    const send = vi.fn().mockResolvedValue({ data: {} });
    gmailForUser.mockResolvedValueOnce({ users: { messages: { send } } });
    const prepared = await prepareSend(INPUT);
    await expect(dispatchSend(prepared)).rejects.toThrow(/without a message\/thread identifier/);
  });

  it("has a draft twin that follows the same rule", async () => {
    const create = vi
      .fn()
      .mockResolvedValue({ data: { id: "d1", message: { id: "m1", threadId: "t1" } } });
    gmailForUser.mockResolvedValueOnce({ users: { drafts: { create } } });
    const prepared = await prepareSend(INPUT);
    const result = await dispatchDraft(prepared);
    expect(result.gmailDraftId).toBe("d1");
    expect(create).toHaveBeenCalledTimes(1);
  });
});

describe("the worker's boundary", () => {
  /**
   * A source assertion, because this is a question of ORDER and the bug was an
   * ordering bug. A behavioural test of the whole route would not have caught
   * it; reading the two lines in sequence does.
   */
  const route = readFileSync("app/api/tasks/send-message/route.ts", "utf8");

  it("prepares before it declares the point of no return", () => {
    const prepare = route.indexOf("await prepareSend(");
    const flag = route.indexOf("reachedDeliveryAttempt = true;\n    const result");
    expect(prepare).toBeGreaterThan(0);
    expect(flag).toBeGreaterThan(0);
    expect(prepare).toBeLessThan(flag);
  });

  it("never calls the all-in-one sendEmail from the campaign worker", () => {
    // sendEmail() still exists for callers with no duplicate to fear (the
    // setup test send). Using it here would put the token refresh back on the
    // wrong side of the boundary.
    expect(route).not.toMatch(/\bsendEmail\(/);
    expect(route).not.toMatch(/\bcreateEmailDraft\(/);
  });
});
