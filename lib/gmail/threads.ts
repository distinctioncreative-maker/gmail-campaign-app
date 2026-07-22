import "server-only";
import { gmailForUser } from "./client";
import type { InboundMessage } from "./classifyReply";
import type { BounceMessage } from "./classifyBounce";

function headerMap(headers: { name?: string | null; value?: string | null }[] | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const h of headers ?? []) if (h.name) out[h.name] = h.value ?? "";
  return out;
}

function decodePart(data: string | null | undefined): string {
  return data ? Buffer.from(data, "base64url").toString("utf8") : "";
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractBodyText(payload: any): string {
  if (!payload) return "";
  if (payload.mimeType === "text/plain" && payload.body?.data) return decodePart(payload.body.data);
  for (const part of payload.parts ?? []) {
    const text = extractBodyText(part);
    if (text) return text;
  }
  if (payload.body?.data) return decodePart(payload.body.data);
  return "";
}

export interface ThreadInboundResult {
  inbound: InboundMessage[];
  latestInboundEpochMs: number | null;
}

/**
 * Read a thread and return inbound messages that arrived after the given
 * outbound timestamp (the app's own sends are outbound). Uses the
 * connected user's Gmail token.
 */
export async function getInboundAfter(
  userId: string,
  threadId: string,
  afterEpochMs: number,
  connectedEmail: string
): Promise<ThreadInboundResult> {
  const gmail = await gmailForUser(userId);
  const thread = await gmail.users.threads.get({ userId: "me", id: threadId, format: "full" });

  const inbound: InboundMessage[] = [];
  let latest: number | null = null;

  for (const message of thread.data.messages ?? []) {
    const internal = Number(message.internalDate ?? 0);
    if (internal <= afterEpochMs) continue;
    const headers = headerMap(message.payload?.headers);
    const from = (headers["From"] ?? "").toLowerCase();
    // Skip our own outbound copies in the thread.
    if (from.includes(connectedEmail.toLowerCase())) continue;

    inbound.push({
      headers,
      subject: headers["Subject"] ?? "",
      snippet: message.snippet ?? "",
      bodyText: extractBodyText(message.payload),
    });
    if (latest === null || internal > latest) latest = internal;
  }

  return { inbound, latestInboundEpochMs: latest };
}

/** Search the mailbox for recent delivery-failure messages. */
export async function findRecentBounces(
  userId: string,
  connectedEmail: string
): Promise<Array<BounceMessage & { internalDate: number }>> {
  const gmail = await gmailForUser(userId);
  void connectedEmail;
  const list = await gmail.users.messages.list({
    userId: "me",
    q: "from:(mailer-daemon OR postmaster) newer_than:3d",
    maxResults: 25,
  });

  const results: Array<BounceMessage & { internalDate: number }> = [];
  for (const ref of list.data.messages ?? []) {
    if (!ref.id) continue;
    const msg = await gmail.users.messages.get({ userId: "me", id: ref.id, format: "full" });
    const headers = headerMap(msg.data.payload?.headers);
    results.push({
      from: headers["From"] ?? "",
      subject: headers["Subject"] ?? "",
      bodyText: extractBodyText(msg.data.payload) || msg.data.snippet || "",
      internalDate: Number(msg.data.internalDate ?? 0),
    });
  }
  return results;
}

// ── Inbox sweep: catch replies that arrive in NEW threads ────────

export interface RecentInboundRef {
  messageId: string;
  threadId: string;
  fromEmail: string;
  internalDate: number;
}

function parseFromEmail(from: string): string {
  const angled = from.match(/<([^>]+)>/);
  const raw = (angled ? angled[1] : from).trim().toLowerCase();
  return raw.includes("@") ? raw : "";
}

/**
 * List recent inbox messages with just enough metadata to match senders
 * against campaign recipients. One list call + bounded-parallel metadata
 * fetches — this is what lets the scan catch someone who replied by
 * composing a brand-new email instead of replying in-thread.
 */
export async function listRecentInbound(userId: string): Promise<RecentInboundRef[]> {
  const { mapWithConcurrency } = await import("@/lib/util/pool");
  const gmail = await gmailForUser(userId);
  const list = await gmail.users.messages.list({
    userId: "me",
    q: "in:inbox newer_than:14d",
    maxResults: 100,
  });
  const refs = (list.data.messages ?? []).filter((m) => m.id && m.threadId);
  const rows = await mapWithConcurrency(refs, 10, async (ref) => {
    try {
      const msg = await gmail.users.messages.get({
        userId: "me",
        id: ref.id!,
        format: "metadata",
        metadataHeaders: ["From"],
      });
      const headers = headerMap(msg.data.payload?.headers);
      return {
        messageId: ref.id!,
        threadId: ref.threadId!,
        fromEmail: parseFromEmail(headers["From"] ?? ""),
        internalDate: Number(msg.data.internalDate ?? 0),
      };
    } catch {
      return null;
    }
  });
  return rows.filter((r): r is RecentInboundRef => r !== null && r.fromEmail !== "");
}

/** Fetch one message in full as a classifiable InboundMessage. */
export async function getMessageAsInbound(
  userId: string,
  messageId: string
): Promise<InboundMessage> {
  const gmail = await gmailForUser(userId);
  const msg = await gmail.users.messages.get({ userId: "me", id: messageId, format: "full" });
  const headers = headerMap(msg.data.payload?.headers);
  return {
    headers,
    subject: headers["Subject"] ?? "",
    snippet: msg.data.snippet ?? "",
    bodyText: extractBodyText(msg.data.payload),
  };
}
