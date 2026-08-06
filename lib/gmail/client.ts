import "server-only";
import { google, type gmail_v1 } from "googleapis";
import { oauthClient } from "@/lib/google/oauth";
import { decryptSecret } from "@/lib/kms/crypto";
import {
  getConnection,
  getConnectionById,
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
export async function gmailForUser(
  userId: string,
  /** Which inbox to authorize as. Omitted means the user's default, which is
   * what every non-sending caller wants (the reply scanner, the deliverability
   * page, the setup test). The send path names one explicitly, because sending
   * from a different address than the one chosen is a visible error. */
  connectionId?: string
): Promise<gmail_v1.Gmail> {
  const connection = connectionId
    ? await getConnectionById(userId, connectionId)
    : await getConnection(userId);
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
    await markNeedsReconnect(userId, connection.connectionId);
    throw new GmailNotConnectedError();
  }

  await recordSuccessfulApiCall(userId, connection.connectionId);
  return google.gmail({ version: "v1", auth });
}
