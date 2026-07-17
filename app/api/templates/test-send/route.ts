import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth/requireUser";
import { handleApiErrors } from "@/lib/api";
import { renderForPreview } from "@/lib/personalization/preview";
import { sanitizeEmailHtml } from "@/lib/sanitize/html";
import { sendEmail } from "@/lib/gmail/send";
import { updateOnboardingStatus } from "@/lib/repositories/users";

const BodySchema = z.object({
  subjectTemplate: z.string().min(1).max(500),
  htmlTemplate: z.string().min(1).max(500_000),
  contactId: z.string().nullable().optional(),
});

/**
 * Send a test email of this template to the signed-in user through their
 * own Gmail. The global safety gate applies: while TEST_MODE is on the
 * message goes to the configured test destination with a [TEST] subject.
 */
export const POST = handleApiErrors(async (req: NextRequest) => {
  const ctx = await requireUser();
  const { subjectTemplate, htmlTemplate, contactId } = BodySchema.parse(await req.json());

  const rendered = await renderForPreview(
    ctx,
    subjectTemplate,
    sanitizeEmailHtml(htmlTemplate),
    contactId
  );

  const result = await sendEmail({
    userId: ctx.userId,
    to: ctx.email,
    subject: `[TEST] ${rendered.subject}`,
    htmlBody: rendered.html,
  });

  if (ctx.user.onboardingStatus === "DEFAULTS_SET") {
    await updateOnboardingStatus(ctx.userId, "TEST_PASSED");
  }

  return NextResponse.json({
    ok: true,
    sentTo: result.effectiveTo,
    subject: result.effectiveSubject,
    unresolved: rendered.unresolved,
  });
});
