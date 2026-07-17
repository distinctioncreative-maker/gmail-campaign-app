import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/requireUser";
import { oauthClient } from "@/lib/google/oauth";
import { verifyOauthState } from "@/lib/google/oauthState";
import { encryptSecret } from "@/lib/kms/crypto";
import { saveConnection } from "@/lib/repositories/gmailConnections";
import { updateOnboardingStatus } from "@/lib/repositories/users";
import { env } from "@/lib/env";
import { handleApiErrors } from "@/lib/api";

function settingsRedirect(params: Record<string, string>): NextResponse {
  const url = new URL("/settings", env.APP_BASE_URL);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return NextResponse.redirect(url);
}

/** OAuth callback: exchange code, encrypt + store the refresh token. */
export const GET = handleApiErrors(async (req: NextRequest) => {
  const ctx = await requireUser();
  const params = req.nextUrl.searchParams;

  if (params.get("error")) {
    return settingsRedirect({ gmail: "denied" });
  }

  const code = params.get("code");
  const state = params.get("state");
  if (!code || !state) return settingsRedirect({ gmail: "error" });

  // The state must have been minted for this same signed-in user.
  const stateUserId = await verifyOauthState(state);
  if (stateUserId !== ctx.userId) return settingsRedirect({ gmail: "error" });

  const client = oauthClient();
  const { tokens } = await client.getToken(code);

  if (!tokens.refresh_token) {
    // Can happen if consent was skipped; user must re-consent.
    return settingsRedirect({ gmail: "no_refresh_token" });
  }

  // Identify the connected mailbox from the ID token (no extra scope needed).
  let connectedEmail = ctx.email;
  if (tokens.id_token) {
    const ticket = await client.verifyIdToken({
      idToken: tokens.id_token,
      audience: env.GOOGLE_OAUTH_CLIENT_ID,
    });
    const email = ticket.getPayload()?.email;
    if (email) connectedEmail = email.toLowerCase();
  }

  const encryptedRefreshToken = await encryptSecret(tokens.refresh_token);
  await saveConnection({
    userId: ctx.userId,
    connectedEmail,
    encryptedRefreshToken,
    grantedScopes: tokens.scope?.split(" ") ?? [],
  });

  if (ctx.user.onboardingStatus === "NEW") {
    await updateOnboardingStatus(ctx.userId, "GMAIL_CONNECTED");
  }

  return settingsRedirect({ gmail: "connected" });
});
