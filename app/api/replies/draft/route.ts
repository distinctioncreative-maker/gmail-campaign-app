import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth/requireUser";
import { handleApiErrors } from "@/lib/api";
import { getRecipient, ownerFromCtx } from "@/lib/repositories/campaigns";
import { getOrgSettings } from "@/lib/repositories/orgSettings";
import { getSenderProfile } from "@/lib/repositories/userSettings";
import { generateReply } from "@/lib/ai/generateReply";
import { AiNotConfiguredError } from "@/lib/ai/generateEmail";
import { createReplyDraft } from "@/lib/gmail/drafts";
import { getThreadSubject } from "@/lib/gmail/threads";

const BodySchema = z.object({
  campaignId: z.string().min(1),
  recipientId: z.string().min(1),
});

/** Fill the reply's placeholders directly (the draft goes straight to Gmail,
 * so it can't rely on the campaign send-time renderer). */
function fill(html: string, v: { firstName: string; businessName: string; signature: string }): string {
  return html
    .replace(/\{\{\s*(firstName|first_name)\s*\}\}/g, v.firstName || "there")
    .replace(/\{\{\s*(businessName|business_name)\s*\}\}/g, v.businessName || "")
    .replace(/\{\{\s*signature\s*\}\}/g, v.signature || "");
}

/**
 * Draft an AI reply to a prospect and drop it into the Gmail thread as a
 * draft (never sent automatically). The rep opens Gmail, edits, and sends.
 */
export const POST = handleApiErrors(async (req: NextRequest) => {
  const ctx = await requireUser();
  const owner = ownerFromCtx(ctx);
  const { campaignId, recipientId } = BodySchema.parse(await req.json());

  const recipient = await getRecipient(owner, campaignId, recipientId);
  if (!recipient) {
    return NextResponse.json({ error: "That reply could not be found." }, { status: 404 });
  }
  if (!recipient.gmailThreadId) {
    return NextResponse.json(
      { error: "No Gmail thread is linked to this reply yet — open it in Gmail and reply there." },
      { status: 409 }
    );
  }

  const [settings, profile] = await Promise.all([
    getOrgSettings(ctx.organizationId),
    getSenderProfile(ctx),
  ]);

  let reply;
  try {
    reply = await generateReply({
      replyText: recipient.lastReplySnippet,
      firstName: recipient.firstNameSnapshot,
      businessName: recipient.businessNameSnapshot,
      brandContext: settings.aiBrandContext,
    });
  } catch (err) {
    if (err instanceof AiNotConfiguredError) {
      return NextResponse.json({ error: err.message }, { status: 503 });
    }
    throw err;
  }

  const html = fill(reply.html, {
    firstName: recipient.firstNameSnapshot,
    businessName: recipient.businessNameSnapshot,
    signature: profile.signature ?? "",
  });

  const original = await getThreadSubject(ctx.userId, recipient.gmailThreadId);
  const subject = original
    ? /^re:/i.test(original)
      ? original
      : `Re: ${original}`
    : "Re: your message";

  const { draftId } = await createReplyDraft(ctx.userId, {
    threadId: recipient.gmailThreadId,
    to: recipient.emailSnapshot,
    subject,
    htmlBody: html,
  });

  return NextResponse.json({
    draftId,
    threadId: recipient.gmailThreadId,
    message: "Draft ready in Gmail — open the thread to review and send.",
  });
});
