import "server-only";
import { google } from "googleapis";
import type { OAuth2Client } from "googleapis-common";
import { env } from "@/lib/env";
import { parseAllowedDomains } from "@/lib/auth/domains";

/**
 * OAuth client for the Gmail-connect flow (separate from app sign-in).
 *
 * Scope choices (least privilege for current features):
 * - gmail.compose  — create drafts and send them as the connected user.
 *   Narrower than gmail.modify/mail.google.com; cannot read the mailbox.
 * - gmail.readonly — read thread/message metadata and content for reply
 *   and bounce detection. Added now because reply detection is a core
 *   safety feature (stops follow-ups); revisit if labels ship (would need
 *   gmail.modify instead).
 */
export const GMAIL_SCOPES = [
  "https://www.googleapis.com/auth/gmail.compose",
  "https://www.googleapis.com/auth/gmail.readonly",
];

export function oauthClient(): OAuth2Client {
  if (!env.GOOGLE_OAUTH_CLIENT_ID || !env.GOOGLE_OAUTH_CLIENT_SECRET) {
    throw new Error("Google OAuth client is not configured (GOOGLE_OAUTH_CLIENT_ID/SECRET).");
  }
  return new google.auth.OAuth2({
    clientId: env.GOOGLE_OAUTH_CLIENT_ID,
    clientSecret: env.GOOGLE_OAUTH_CLIENT_SECRET,
    redirectUri: env.GOOGLE_OAUTH_REDIRECT_URI,
  });
}

export function buildGmailConsentUrl(state: string, loginHint: string): string {
  // hd can hint only a single domain; with a multi-domain allowlist the
  // account picker is left unrestricted (the server still enforces the list).
  const allowed = parseAllowedDomains(env.ALLOWED_GOOGLE_WORKSPACE_DOMAIN);
  return oauthClient().generateAuthUrl({
    access_type: "offline",
    prompt: "consent", // guarantee a refresh token on (re)connect
    scope: GMAIL_SCOPES,
    include_granted_scopes: true,
    state,
    login_hint: loginHint,
    hd: allowed.length === 1 ? allowed[0] : undefined,
  });
}
