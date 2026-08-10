import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth/requireUser";
import {
  getConnection,
  getConnectionById,
  listConnections,
  markDisconnected,
} from "@/lib/repositories/gmailConnections";
import { decryptSecret } from "@/lib/kms/crypto";
import { oauthClient } from "@/lib/google/oauth";
import { handleApiErrors } from "@/lib/api";
import { auditActor, recordAudit } from "@/lib/audit/log";

/** Disconnect Gmail: revoke the Google grant, then mark the stored
 * connection revoked (token is overwritten, never returned). */
const BodySchema = z.object({ connectionId: z.string().min(1).optional() });

export const POST = handleApiErrors(async (req: NextRequest) => {
  const ctx = await requireUser();
  // Which inbox. Omitted means the default one, so an older client that posts
  // an empty body keeps working exactly as it did.
  const body = await req.json().catch(() => ({}));
  const { connectionId } = BodySchema.parse(body);
  if (connectionId) {
    const owned = await listConnections(ctx.userId);
    if (!owned.some((c) => c.connectionId === connectionId)) {
      return NextResponse.json({ error: "That inbox is not connected." }, { status: 404 });
    }
  }
  const connection = connectionId
    ? await getConnectionById(ctx.userId, connectionId)
    : await getConnection(ctx.userId);
  if (!connection || connection.status === "REVOKED") {
    return NextResponse.json({ ok: true, alreadyDisconnected: true });
  }

  try {
    const refreshToken = await decryptSecret(connection.encryptedRefreshToken);
    await oauthClient().revokeToken(refreshToken);
  } catch {
    // Grant may already be revoked on Google's side; proceed with local cleanup.
  }

  await markDisconnected(ctx.userId, connection.connectionId);
  await recordAudit(auditActor(ctx), {
    action: "gmail.disconnected",
    subject: connection.connectedEmail,
    summary: `${ctx.email} disconnected the mailbox ${connection.connectedEmail}.`,
  });
  return NextResponse.json({ ok: true });
});
