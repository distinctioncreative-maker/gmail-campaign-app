import { z } from "zod";
import { EpochMillis } from "./common";

export const GmailConnectionStatusSchema = z.enum([
  "CONNECTED",
  "NEEDS_RECONNECT",
  "REVOKED",
]);

export const GmailConnectionSchema = z.object({
  connectionId: z.string().min(1),
  userId: z.string().min(1),
  connectedEmail: z.string().email(),
  // KMS-encrypted refresh token, base64. Never sent to the client.
  encryptedRefreshToken: z.string().min(1),
  grantedScopes: z.array(z.string()),
  status: GmailConnectionStatusSchema,
  lastRefreshAt: EpochMillis.nullable(),
  lastSuccessfulApiCallAt: EpochMillis.nullable(),
  revokedAt: EpochMillis.nullable(),
  tokenVersion: z.number().int().nonnegative(),
  createdAt: EpochMillis,
  updatedAt: EpochMillis,
});
export type GmailConnection = z.infer<typeof GmailConnectionSchema>;

/** Shape safe to return to the browser. */
export const GmailConnectionPublicSchema = GmailConnectionSchema.omit({
  encryptedRefreshToken: true,
});
export type GmailConnectionPublic = z.infer<typeof GmailConnectionPublicSchema>;
