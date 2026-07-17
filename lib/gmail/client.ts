import "server-only";
import { google, type gmail_v1 } from "googleapis";
import { oauthClient } from "@/lib/google/oauth";
import { decryptSecret } from "@/lib/kms/crypto";
import {
  getConnection,
  markNeedsReconnect,
  recordSuccessfulApiCall,
} from "@/lib/repositories/gmailConnections";

export class GmailNotConnectedError extends Error {
  constructor() {
    super("Your Gmail connection expired. Reconnect Gmail to continue.");
  }
}

/**
 * Build an authorized Gmail client for a user from their encrypted
 * refresh token. Decryption happens only here, server-side; the token
 * never leaves this module.
 */
export async function gmailForUser(userId: string): Promise<gmail_v1.Gmail> {
  const connection = await getConnection(userId);
  if (!connection || connection.status !== "CONNECTED") {
    throw new GmailNotConnectedError();
  }

  const auth = oauthClient();
  auth.setCredentials({
    refresh_token: await decryptSecret(connection.encryptedRefreshToken),
  });

  try {
    await auth.getAccessToken();
  } catch {
    await markNeedsReconnect(userId);
    throw new GmailNotConnectedError();
  }

  await recordSuccessfulApiCall(userId);
  return google.gmail({ version: "v1", auth });
}
