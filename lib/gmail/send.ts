import "server-only";
import { gmailForUser } from "./client";
import { applySendSafety } from "./safety";

export interface SendEmailInput {
  userId: string;
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
}

function encodeMessage(raw: string): string {
  return Buffer.from(raw).toString("base64url");
}

function buildMime(input: {
  to: string;
  subject: string;
  htmlBody: string;
  textBody?: string;
  inReplyToMessageId?: string;
  references?: string;
}): string {
  const boundary = `b_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`;
  const encodedSubject = `=?UTF-8?B?${Buffer.from(input.subject, "utf8").toString("base64")}?=`;
  const text = input.textBody ?? input.htmlBody.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  const headers = [
    `To: ${input.to}`,
    `Subject: ${encodedSubject}`,
    "MIME-Version: 1.0",
  ];
  if (input.inReplyToMessageId) {
    headers.push(`In-Reply-To: ${input.inReplyToMessageId}`);
    headers.push(`References: ${input.references ?? input.inReplyToMessageId}`);
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
 * safety gate is applied here, immediately before the API call — there
 * is no send path around it.
 */
export async function sendEmail(input: SendEmailInput): Promise<{
  gmailMessageId: string;
  gmailThreadId: string;
  effectiveTo: string;
  effectiveSubject: string;
}> {
  const safe = applySendSafety({ to: input.to, subject: input.subject }, input.testMode);
  const gmail = await gmailForUser(input.userId);

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
        })
      ),
    },
  });

  return {
    gmailMessageId: res.data.id ?? "",
    gmailThreadId: res.data.threadId ?? "",
    effectiveTo: safe.to,
    effectiveSubject: safe.subject,
  };
}
