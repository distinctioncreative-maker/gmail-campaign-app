import "server-only";
import type { gmail_v1 } from "googleapis";
import { gmailForUser } from "./client";

export interface DraftSummary {
  draftId: string;
  subject: string;
  snippet: string;
}

export interface DraftContent {
  draftId: string;
  subject: string;
  htmlBody: string;
  textBody: string;
}

function headerValue(payload: gmail_v1.Schema$MessagePart | undefined, name: string): string {
  return (
    payload?.headers?.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value ?? ""
  );
}

function decodeBody(data: string | null | undefined): string {
  return data ? Buffer.from(data, "base64url").toString("utf8") : "";
}

function findPart(
  part: gmail_v1.Schema$MessagePart | undefined,
  mimeType: string
): gmail_v1.Schema$MessagePart | undefined {
  if (!part) return undefined;
  if (part.mimeType === mimeType && part.body?.data) return part;
  for (const child of part.parts ?? []) {
    const found = findPart(child, mimeType);
    if (found) return found;
  }
  return undefined;
}

function encodeSubject(subject: string): string {
  return `=?UTF-8?B?${Buffer.from(subject, "utf8").toString("base64")}?=`;
}

/** Build a minimal HTML MIME message for a threaded reply draft. */
function buildReplyMime(input: { to: string; subject: string; htmlBody: string }): string {
  const boundary = `b_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`;
  const text = input.htmlBody.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  return [
    `To: ${input.to}`,
    `Subject: ${encodeSubject(input.subject)}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
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
 * Create a Gmail draft that lives inside an existing thread. Drafts never
 * send on their own, so this is safe regardless of test/live mode — the rep
 * opens it in Gmail, edits, and sends manually.
 */
export async function createReplyDraft(
  userId: string,
  input: { threadId: string; to: string; subject: string; htmlBody: string }
): Promise<{ draftId: string }> {
  const gmail = await gmailForUser(userId);
  const res = await gmail.users.drafts.create({
    userId: "me",
    requestBody: {
      message: {
        threadId: input.threadId,
        raw: Buffer.from(buildReplyMime(input)).toString("base64url"),
      },
    },
  });
  return { draftId: res.data.id ?? "" };
}

export async function listRecentDrafts(
  userId: string,
  query?: string
): Promise<DraftSummary[]> {
  const gmail = await gmailForUser(userId);
  const list = await gmail.users.drafts.list({
    userId: "me",
    maxResults: 20,
    q: query || undefined,
  });

  const summaries: DraftSummary[] = [];
  for (const draft of list.data.drafts ?? []) {
    if (!draft.id) continue;
    const full = await gmail.users.drafts.get({
      userId: "me",
      id: draft.id,
      format: "metadata",
    });
    summaries.push({
      draftId: draft.id,
      subject: headerValue(full.data.message?.payload, "Subject") || "(no subject)",
      snippet: full.data.message?.snippet ?? "",
    });
  }
  return summaries;
}

export async function getDraftContent(userId: string, draftId: string): Promise<DraftContent> {
  const gmail = await gmailForUser(userId);
  const full = await gmail.users.drafts.get({ userId: "me", id: draftId, format: "full" });
  const payload = full.data.message?.payload;

  const htmlPart = findPart(payload, "text/html");
  const textPart = findPart(payload, "text/plain");
  // Single-part messages carry the body directly on the payload.
  const direct = payload?.body?.data ? decodeBody(payload.body.data) : "";

  return {
    draftId,
    subject: headerValue(payload, "Subject") || "(no subject)",
    htmlBody: htmlPart ? decodeBody(htmlPart.body?.data) : direct,
    textBody: textPart ? decodeBody(textPart.body?.data) : "",
  };
}
