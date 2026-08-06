import "server-only";
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
 * Send one email through the user's connected Gmail. The test-mode
 * safety gate is applied here, immediately before the API call: there
 * is no send path around it.
 */
export async function sendEmail(input: SendEmailInput): Promise<{
  gmailMessageId: string;
  gmailThreadId: string;
  effectiveTo: string;
  effectiveSubject: string;
}> {
  const safe = applySendSafety(
    { to: input.to, subject: input.subject },
    input.testMode,
    input.verifiedTestDestination
  );
  const gmail = await gmailForUser(input.userId, input.connectionId);

  const res = await gmail.users.messages.send({
    userId: "me",
    requestBody: {
      threadId: input.threadId,
      raw: encodeMessage(
        buildMime({
          to: safe.to,
          subject: safe.subject,
          htmlBody: input.htmlBody,
          textBody: input.textBody,
          inReplyToMessageId: input.inReplyToMessageId,
          references: input.references,
          unsubscribeUrl: input.unsubscribeUrl,
        })
      ),
    },
  });
  if (!res.data.id || !res.data.threadId) {
    throw new Error("Gmail accepted the request without a message/thread identifier");
  }

  return {
    gmailMessageId: res.data.id,
    gmailThreadId: res.data.threadId,
    effectiveTo: safe.to,
    effectiveSubject: safe.subject,
  };
}

/**
 * Create one Gmail draft without sending it. Draft campaigns use the same
 * destination safety gate as sends, so a TEST workspace never leaves a draft
 * addressed to a real recipient that could be sent accidentally from Gmail.
 */
export async function createEmailDraft(input: SendEmailInput): Promise<GmailDeliveryResult & {
  gmailDraftId: string;
}> {
  const safe = applySendSafety(
    { to: input.to, subject: input.subject },
    input.testMode,
    input.verifiedTestDestination
  );
  const gmail = await gmailForUser(input.userId, input.connectionId);

  const res = await gmail.users.drafts.create({
    userId: "me",
    requestBody: {
      message: {
        threadId: input.threadId,
        raw: encodeMessage(
          buildMime({
            to: safe.to,
            subject: safe.subject,
            htmlBody: input.htmlBody,
            textBody: input.textBody,
            inReplyToMessageId: input.inReplyToMessageId,
            references: input.references,
            unsubscribeUrl: input.unsubscribeUrl,
          })
        ),
      },
    },
  });
  if (!res.data.id || !res.data.message?.id || !res.data.message.threadId) {
    throw new Error("Gmail accepted the draft without complete identifiers");
  }

  return {
    gmailDraftId: res.data.id,
    gmailMessageId: res.data.message.id,
    gmailThreadId: res.data.message.threadId,
    effectiveTo: safe.to,
    effectiveSubject: safe.subject,
  };
}
