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
  /** A name the customer recognises, e.g. "Alex, outbound". Falls back to the
   * address when empty, so it is never required to connect an inbox. */
  label: z.string().trim().max(60).default(""),
  /** The inbox used when a campaign names no senders, and the one a single
   * inbox account has always had. Exactly one connection carries it. */
  primary: z.boolean().default(false),
  /** Total real sends ever made from this inbox.
   *
   * The warmup ramp was anchored on the connection date alone, which treated
   * an inbox connected a month ago and never used as fully warm. A lifetime
   * counter is what closes that: an inbox is warm when it has both age and
   * history, and this is the history half. */
  lifetimeSends: z.number().int().nonnegative().default(0),
  /** Real sends and bounces attributed to this inbox, for the per-inbox brake.
   * The reputation a bounce rate spends belongs to the inbox, not the campaign
   * that happened to be running when it bounced. */
  sentCount: z.number().int().nonnegative().default(0),
  bounceCount: z.number().int().nonnegative().default(0),
  /** Optional per-inbox ceiling below the warmup and plan ceilings. Null means
   * no extra restriction. Never raises a limit, only lowers one. */
  dailyLimit: z.number().int().positive().nullable().default(null),
  /** Set when the customer parks an inbox without disconnecting it. Paused
   * inboxes keep their history and their warmup progress. */
  paused: z.boolean().default(false),
  createdAt: EpochMillis,
  updatedAt: EpochMillis,
});
export type GmailConnection = z.infer<typeof GmailConnectionSchema>;
export type GmailConnectionStatus = z.infer<typeof GmailConnectionStatusSchema>;

/** Shape safe to return to the browser. */
export const GmailConnectionPublicSchema = GmailConnectionSchema.omit({
  encryptedRefreshToken: true,
});
export type GmailConnectionPublic = z.infer<typeof GmailConnectionPublicSchema>;
