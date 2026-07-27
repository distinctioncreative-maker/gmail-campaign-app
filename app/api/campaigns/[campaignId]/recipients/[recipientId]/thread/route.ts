import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/requireUser";
import { handleApiErrors } from "@/lib/api";
import { getRecipient, ownerFromCtx } from "@/lib/repositories/campaigns";
import { getConnectionPublic } from "@/lib/repositories/gmailConnections";
import { getInboundAfter } from "@/lib/gmail/threads";
import { stripQuotedText } from "@/lib/gmail/classifyReply";

type Params = { params: Promise<{ campaignId: string; recipientId: string }> };

/**
 * Everything this recipient has sent back in their Gmail thread, read live
 * (not the truncated 280-char lastReplySnippet cached on the recipient doc)
 * so the in-app reading view works for old replies too, not just ones
 * detected after this endpoint shipped. Read-only: never touches the thread.
 */
export const GET = handleApiErrors(async (_req: NextRequest, { params }: Params) => {
  const ctx = await requireUser();
  const owner = ownerFromCtx(ctx);
  const { campaignId, recipientId } = await params;

  const recipient = await getRecipient(owner, campaignId, recipientId);
  if (!recipient) return NextResponse.json({ error: "Recipient not found." }, { status: 404 });
  if (!recipient.gmailThreadId)
    return NextResponse.json({ error: "No Gmail thread for this recipient yet." }, { status: 404 });

  const connection = await getConnectionPublic(ctx.userId);
  if (!connection || connection.status !== "CONNECTED")
    return NextResponse.json({ error: "Gmail isn't connected." }, { status: 400 });

  const { inbound } = await getInboundAfter(ctx.userId, recipient.gmailThreadId, 0, connection.connectedEmail);
  return NextResponse.json({
    messages: inbound
      .sort((a, b) => Number(a.headers["Date"] ? Date.parse(a.headers["Date"]) : 0) - Number(b.headers["Date"] ? Date.parse(b.headers["Date"]) : 0))
      .map((m) => ({
        from: m.headers["From"] ?? "",
        subject: m.subject,
        bodyText: stripQuotedText(m.bodyText || m.snippet || ""),
        snippet: m.snippet,
      })),
  });
});
