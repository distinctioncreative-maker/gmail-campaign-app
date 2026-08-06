import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth/requireUser";
import { handleApiErrors } from "@/lib/api";
import { enforceUserRateLimit, RATE_LIMITS } from "@/lib/util/userRateLimit";
import { collectDiagnostics, recordSupportRequest } from "@/lib/support/requests";
import { SUPPORT_CATEGORIES, SUPPORT_RESPONSE_TARGET } from "@/lib/support/contact";

const BodySchema = z.object({
  category: z.enum(SUPPORT_CATEGORIES),
  subject: z.string().trim().min(3).max(200),
  message: z.string().trim().min(10).max(4000),
  /** Where to reply, when that differs from the sign-in address: a shared
   * workspace login is common, and a reply nobody reads is not a reply. */
  replyTo: z.union([z.literal(""), z.string().trim().email().max(200)]).default(""),
  /** The page the customer was on. Cheap context, and it is the one thing
   * the server cannot work out for itself. */
  reportedFrom: z.string().trim().max(200).default(""),
});

/**
 * Send a support request.
 *
 * Authenticated on purpose: the diagnostic context that makes a ticket
 * actionable comes from the session, and an unauthenticated form here would
 * be an open write endpoint on a shared collection. Someone who cannot sign
 * in is served by the public /support page, which carries a plain address.
 */
export const POST = handleApiErrors(async (req: NextRequest) => {
  const ctx = await requireUser();
  await enforceUserRateLimit(ctx, RATE_LIMITS.supportRequest);

  const input = BodySchema.parse(await req.json());
  const diagnostics = await collectDiagnostics(ctx, {
    userAgent: req.headers.get("user-agent") ?? "",
    reportedFrom: input.reportedFrom,
  });

  const record = await recordSupportRequest(ctx, {
    category: input.category,
    subject: input.subject,
    message: input.message,
    replyTo: input.replyTo || ctx.email,
    diagnostics,
  });

  return NextResponse.json({
    reference: record.reference,
    replyTo: record.replyTo,
    message: `Sent. Your reference is ${record.reference} and we reply within ${SUPPORT_RESPONSE_TARGET}.`,
  });
});
