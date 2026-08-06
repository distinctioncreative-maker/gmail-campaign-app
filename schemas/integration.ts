import { z } from "zod";
import { EpochMillis } from "./common";

/** Scopes must match lib/apiKeys/token.ts; duplicated here to keep the schema
 * file free of a server-only import. The test asserts they agree. */
export const ApiScopeSchema = z.enum([
  "leads:read",
  "leads:write",
  "campaigns:read",
  "campaigns:write",
  "reports:read",
]);

export const ApiKeySchema = z.object({
  keyId: z.string().min(1),
  organizationId: z.string().min(1),
  createdByUserId: z.string().min(1),
  /** Whose data this key reads and writes.
   *
   * Leads, campaigns, and templates are all stored under users/{userId}, so a
   * key needs a real owner: scoping by organizationId alone would address a
   * document that does not exist and quietly write to a subtree the app never
   * reads. Defaults to the creator and is stored separately from them, so a
   * workspace can hand the integration to someone else when that person leaves
   * without reissuing the key. */
  ownerUserId: z.string().min(1),
  name: z.string().trim().min(1).max(60),
  /** SHA-256 of the secret. The secret itself is never stored: see
   * lib/apiKeys/token.ts for why, and for what that costs the UI. */
  hash: z.string().min(64).max(64),
  /** Safe to show. Identifies a key in a list without revealing it. */
  display: z.string().min(1).max(40),
  environment: z.enum(["live", "test"]),
  scopes: z.array(ApiScopeSchema).default([]),
  lastUsedAt: EpochMillis.nullable().default(null),
  /** Revoked rather than deleted, so an audit question about a key that was
   * used last month still has an answer. */
  revokedAt: EpochMillis.nullable().default(null),
  createdAt: EpochMillis,
  updatedAt: EpochMillis,
});
export type ApiKey = z.infer<typeof ApiKeySchema>;

/** Shape safe to return to the browser. Excludes the hash, which is not a
 * credential but is also not something a client has any use for. */
export const ApiKeyPublicSchema = ApiKeySchema.omit({ hash: true });
export type ApiKeyPublic = z.infer<typeof ApiKeyPublicSchema>;

export const WEBHOOK_EVENTS = [
  "reply.received",
  "email.bounced",
  "contact.unsubscribed",
  "deal.updated",
] as const;
export const WebhookEventSchema = z.enum(WEBHOOK_EVENTS);
export type WebhookEvent = z.infer<typeof WebhookEventSchema>;

export const WebhookEndpointSchema = z.object({
  endpointId: z.string().min(1),
  organizationId: z.string().min(1),
  createdByUserId: z.string().min(1),
  /** Validated by lib/webhooks/target.ts before it is ever stored. */
  url: z.string().url(),
  description: z.string().trim().max(120).default(""),
  events: z.array(WebhookEventSchema).min(1),
  /** Shown once on creation, like an API key, and needed by the receiver to
   * verify signatures. Stored in the clear because verification requires the
   * same secret on both sides: it is a shared secret, not a password. */
  signingSecret: z.string().min(1),
  enabled: z.boolean().default(true),
  /** Set when deliveries are turned off automatically, e.g. a 410 Gone. */
  disabledReason: z.string().max(200).default(""),
  lastDeliveryAt: EpochMillis.nullable().default(null),
  lastStatus: z.number().int().nullable().default(null),
  consecutiveFailures: z.number().int().nonnegative().default(0),
  createdAt: EpochMillis,
  updatedAt: EpochMillis,
});
export type WebhookEndpoint = z.infer<typeof WebhookEndpointSchema>;

export const WebhookEndpointPublicSchema = WebhookEndpointSchema.omit({ signingSecret: true });
export type WebhookEndpointPublic = z.infer<typeof WebhookEndpointPublicSchema>;
