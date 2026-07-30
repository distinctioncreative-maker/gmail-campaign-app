import crypto from "node:crypto";
import type { Scope } from "@/lib/repositories/scope";
import {
  SuppressionSchema,
  type Suppression,
} from "@/schemas/suppression";

export function unsubscribeSuppressionId(normalizedEmail: string): string {
  return `unsubscribe-${crypto
    .createHash("sha256")
    .update(normalizedEmail)
    .digest("hex")
    .slice(0, 40)}`;
}

export function buildUnsubscribeSuppression(input: {
  owner: Scope;
  email: string;
  normalizedEmail: string;
  campaignId: string;
  recipientId: string;
  source: string;
  now: number;
}): Suppression {
  return SuppressionSchema.parse({
    suppressionId: unsubscribeSuppressionId(input.normalizedEmail),
    ownerUserId: input.owner.userId,
    organizationId: input.owner.organizationId,
    normalizedEmail: input.normalizedEmail,
    email: input.email,
    reason: "UNSUBSCRIBED",
    scope: "USER",
    source: input.source,
    campaignId: input.campaignId,
    recipientId: input.recipientId,
    active: true,
    details: "",
    createdAt: input.now,
    updatedAt: input.now,
  });
}
