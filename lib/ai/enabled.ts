import "server-only";
import { env } from "@/lib/env";
import { AiNotConfiguredError } from "@/lib/ai/generateEmail";

/** Whether a server AI key is present at all (deployment-level). */
export function aiKeyConfigured(): boolean {
  return Boolean(env.GEMINI_API_KEY);
}

/** Pure availability rule, split out for testing: AI is on only when a server
 * key exists AND an admin enabled it. */
export function isAiAvailable(keyPresent: boolean, adminEnabled: boolean): boolean {
  return keyPresent && adminEnabled;
}

/**
 * AI writing is available to users only when BOTH a server key is configured
 * AND an admin has switched it on for the org. Defaults off, so AI stays
 * hidden until an admin explicitly enables it in the admin console.
 */
export function aiWritingEnabled(settings: { aiEnabled: boolean }): boolean {
  return isAiAvailable(aiKeyConfigured(), settings.aiEnabled);
}

/** Guard for AI generation routes — throws the friendly not-configured error
 * (surfaced as 503) when AI writing is off for this org. */
export function assertAiWritingEnabled(settings: { aiEnabled: boolean }): void {
  if (!aiWritingEnabled(settings)) {
    throw new AiNotConfiguredError("AI writing is turned off for your workspace.");
  }
}
