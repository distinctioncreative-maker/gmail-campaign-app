import "server-only";
import { envForcesTestMode } from "@/lib/env";
import { getOrgSettings } from "@/lib/repositories/orgSettings";

export type SendingMode = "TEST" | "LIVE";

export interface EffectiveSendingState {
  testMode: boolean;
  mode: SendingMode;
  /** True when a deployment-level env lock forces test mode (the in-app
   * switch is then disabled). */
  lockedByEnv: boolean;
}

/**
 * Resolve whether real email may leave the app for a given organization.
 *
 * Test mode wins whenever EITHER a deployment lock is set OR the org has
 * not explicitly switched to LIVE. So the default is always safe, and
 * going live requires a deliberate in-app action by an admin AND no env
 * lock.
 */
export async function resolveSendingState(
  organizationId: string
): Promise<EffectiveSendingState> {
  const lockedByEnv = envForcesTestMode();
  if (lockedByEnv) {
    return { testMode: true, mode: "TEST", lockedByEnv: true };
  }
  const settings = await getOrgSettings(organizationId);
  const mode: SendingMode = settings.sendingMode === "LIVE" ? "LIVE" : "TEST";
  return { testMode: mode !== "LIVE", mode, lockedByEnv: false };
}

/** Convenience: just the test-mode boolean for a send. */
export async function isTestModeForOrg(organizationId: string): Promise<boolean> {
  return (await resolveSendingState(organizationId)).testMode;
}
