import "server-only";
import type { gmail_v1 } from "googleapis";
import { gmailForUser } from "./client";
import { applySendSafety } from "./safety";

export interface SendEmailInput {
  userId: string;
  /** Which connected inbox sends this. Omitted uses the default inbox, which
   * preserves every existing caller's behaviour exactly. */
  connectionId?: string;
  to: string;
  subject: string;
  htmlBody: string;
  textBody?: string;
  /**
   * REQUIRED. When true the message is redirected to the configured test
   * address with a [TEST] subject. Resolve it from the org's sending mode
   * (`lib/sending/mode.ts`) for campaign sends, or pass `true` for any
   * test/onboarding email that should always go only to the user.
   */
  testMode: boolean;
  /** For threaded follow-ups: reply within an existing Gmail thread. */
  threadId?: string;
  inReplyToMessageId?: string;
  references?: string;
  /** Server-verified destination for an explicit self-test action. Never pass
   * client or campaign data here. */
  verifiedTestDestination?: string;
  /** Server-generated RFC 8058 one-click opt-out URL for real outreach. */
  unsubscribeUrl?: string;
}

export type GmailDeliveryResult = {
  gmailMessageId: string;
  gmailThreadId: string;
  effectiveTo: string;
  effectiveSubject: string;
};

function encodeMessage(raw: string): string {
  return Buffer.from(raw).toString("base64url");
}

/** Strip CR/LF so a crafted address or subject can't inject extra MIME headers
 * (e.g. a hidden Bcc). Defense-in-depth on top of email validation at import. */
export function sanitizeHeaderValue(value: string): string {
  return value.replace(/[\r\n]+/g, " ").trim();
}

export function buildMime(input: {
  to: string;
  subject: string;
  htmlBody: string;
  textBody?: string;
  inReplyToMessageId?: string;
  references?: string;
  unsubscribeUrl?: string;
}): string {
  const boundary = `b_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`;
  const safeTo = sanitizeHeaderValue(input.to);
  const encodedSubject = `=?UTF-8?B?${Buffer.from(sanitizeHeaderValue(input.subject), "utf8").toString("base64")}?=`;
  const text = input.textBody ?? input.htmlBody.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  const headers = [
    `To: ${safeTo}`,
    `Subject: ${encodedSubject}`,
    "MIME-Version: 1.0",
  ];
  if (input.inReplyToMessageId) {
    headers.push(`In-Reply-To: ${sanitizeHeaderValue(input.inReplyToMessageId)}`);
    headers.push(
      `References: ${sanitizeHeaderValue(input.references ?? input.inReplyToMessageId)}`
    );
  }
  if (input.unsubscribeUrl) {
    const url = new URL(input.unsubscribeUrl);
    if (!["http:", "https:"].includes(url.protocol)) {
      throw new Error("Unsubscribe URL must use HTTP or HTTPS");
    }
    const safeUnsubscribeUrl = sanitizeHeaderValue(url.toString());
    headers.push(`List-Unsubscribe: <${safeUnsubscribeUrl}>`);
    headers.push("List-Unsubscribe-Post: List-Unsubscribe=One-Click");
  }
  headers.push(`Content-Type: multipart/alternative; boundary="${boundary}"`);
  return [
    ...headers,
    "",
    `--${boundary}`,
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    Buffer.from(text, "utf8").toString("base64"),
    `--${boundary}`,
    "Content-Type: text/html; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    Buffer.from(input.htmlBody, "utf8").toString("base64"),
    `--${boundary}--`,
    "",
  ].join("\r\n");
}

/**
 * Everything that must happen before an email can be sent, and nothing that
 * sends one.
 *
 * The split exists because the caller has to know when the risk of a duplicate
 * begins, and it does not begin here. Resolving the connection, decrypting the
 * refresh token, refreshing the access token, recording the API call, applying
 * the safety gate and building the MIME can all fail, and none of them put a
 * byte on the wire. The send worker used to treat a failure in any of them as
 * "Gmail may have accepted this, we cannot tell" and strand the recipient for
 * good. A token that would not refresh looked identical to a half-delivered
 * email.
 *
 * So: this half may fail freely and be retried. `dispatchSend` may not.
 */
export async function prepareSend(input: SendEmailInput): Promise<PreparedSend> {
  const safe = applySendSafety(
    { to: input.to, subject: input.subject },
    input.testMode,
    input.verifiedTestDestination
  );
  // The token refresh lives in here, and it is the failure that made this
  // split necessary.
  const gmail = await gmailForUser(input.userId, input.connectionId);
  const raw = encodeMessage(
    buildMime({
      to: safe.to,
      subject: safe.subject,
      htmlBody: input.htmlBody,
      textBody: input.textBody,
      inReplyToMessageId: input.inReplyToMessageId,
      references: input.references,
      unsubscribeUrl: input.unsubscribeUrl,
    })
  );
  return { gmail, raw, threadId: input.threadId, safe };
}

/** A prepared message, ready for the one call that cannot be taken back. */
export interface PreparedSend {
  gmail: gmail_v1.Gmail;
  raw: string;
  threadId?: string;
  safe: { to: string; subject: string };
}

/**
 * The point of no return: one API call and nothing else.
 *
 * A failure here genuinely is ambiguous, because Gmail may have accepted the
 * message and lost the response. Nothing in this function may be retried.
 */
export async function dispatchSend(prepared: PreparedSend): Promise<{
  gmailMessageId: string;
  gmailThreadId: string;
  effectiveTo: string;
  effectiveSubject: string;
}> {
  const res = await prepared.gmail.users.messages.send({
    userId: "me",
    requestBody: { threadId: prepared.threadId, raw: prepared.raw },
  });
  if (!res.data.id || !res.data.threadId) {
    throw new Error("Gmail accepted the request without a message/thread identifier");
  }
  return {
    gmailMessageId: res.data.id,
    gmailThreadId: res.data.threadId,
    effectiveTo: prepared.safe.to,
    effectiveSubject: prepared.safe.subject,
  };
}

/**
 * Send one email through the user's connected Gmail. The test-mode safety gate
 * is applied in `prepareSend`: there is no send path around it.
 *
 * Kept for callers that have no duplicate to worry about (the setup test send,
 * the reply draft). The campaign send worker calls the two halves separately,
 * because only it needs to know where the boundary is.
 */
export async function sendEmail(input: SendEmailInput): Promise<{
  gmailMessageId: string;
  gmailThreadId: string;
  effectiveTo: string;
  effectiveSubject: string;
}> {
  return dispatchSend(await prepareSend(input));
}

/**
 * Create one Gmail draft without sending it. Draft campaigns use the same
 * destination safety gate as sends, so a TEST workspace never leaves a draft
 * addressed to a real recipient that could be sent accidentally from Gmail.
 */
/** The draft equivalent of `dispatchSend`. Same rule: one call, never retried. */
export async function dispatchDraft(prepared: PreparedSend): Promise<
  GmailDeliveryResult & { gmailDraftId: string }
> {
  const res = await prepared.gmail.users.drafts.create({
    userId: "me",
    requestBody: {
      message: { threadId: prepared.threadId, raw: prepared.raw },
    },
  });
  if (!res.data.id || !res.data.message?.id || !res.data.message.threadId) {
    throw new Error("Gmail accepted the draft without complete identifiers");
  }
  return {
    gmailDraftId: res.data.id,
    gmailMessageId: res.data.message.id,
    gmailThreadId: res.data.message.threadId,
    effectiveTo: prepared.safe.to,
    effectiveSubject: prepared.safe.subject,
  };
}

export async function createEmailDraft(input: SendEmailInput): Promise<GmailDeliveryResult & {
  gmailDraftId: string;
}> {
  return dispatchDraft(await prepareSend(input));
}
