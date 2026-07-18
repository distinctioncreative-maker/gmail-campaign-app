/**
 * Deterministic idempotency key for an intended outbound message
 * (spec §14). Shared by the launch flow, follow-up scheduler, and send
 * worker so the same recipient+step can never be sent twice.
 */
export function idempotencyKey(
  organizationId: string,
  userId: string,
  campaignId: string,
  recipientId: string,
  step: number
): string {
  return `${organizationId}:${userId}:${campaignId}:${recipientId}:${step}`;
}
