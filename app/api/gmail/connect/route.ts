import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/requireUser";
import { buildGmailConsentUrl } from "@/lib/google/oauth";
import { signOauthState } from "@/lib/google/oauthState";
import { handleApiErrors } from "@/lib/api";

/** Start the Gmail-connect OAuth flow (incremental authorization). */
export const GET = handleApiErrors(async () => {
  const ctx = await requireUser();
  const state = await signOauthState(ctx.userId);
  return NextResponse.redirect(buildGmailConsentUrl(state, ctx.email));
});
