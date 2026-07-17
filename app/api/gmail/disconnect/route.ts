import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/requireUser";
import { getConnection, markDisconnected } from "@/lib/repositories/gmailConnections";
import { decryptSecret } from "@/lib/kms/crypto";
import { oauthClient } from "@/lib/google/oauth";
import { handleApiErrors } from "@/lib/api";

/** Disconnect Gmail: revoke the Google grant, then mark the stored
 * connection revoked (token is overwritten, never returned). */
export const POST = handleApiErrors(async () => {
  const ctx = await requireUser();
  const connection = await getConnection(ctx.userId);
  if (!connection || connection.status === "REVOKED") {
    return NextResponse.json({ ok: true, alreadyDisconnected: true });
  }

  try {
    const refreshToken = await decryptSecret(connection.encryptedRefreshToken);
    await oauthClient().revokeToken(refreshToken);
  } catch {
    // Grant may already be revoked on Google's side; proceed with local cleanup.
  }

  await markDisconnected(ctx.userId);
  return NextResponse.json({ ok: true });
});
