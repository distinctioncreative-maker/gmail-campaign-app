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
