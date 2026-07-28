import "server-only";
import { enforceRateLimit } from "@/lib/util/rateLimit";

/** Shared budget across every interactive Gemini endpoint for one user. */
export async function aiRequestAllowed(
  organizationId: string,
  userId: string
): Promise<boolean> {
  return enforceRateLimit(
    "ai-generation",
    `${organizationId}__${userId}`,
    60,
    60 * 60 * 1000,
    { failClosed: true }
  );
}
