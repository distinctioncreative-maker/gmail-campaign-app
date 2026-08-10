import "server-only";
import { getPlatformSettings } from "./state";

/**
 * Read-only mode, enforced.
 *
 * A flag nobody checks is worse than no flag: an operator turns it on during an
 * incident, believes work has stopped, and it has not.
 *
 * What counts as a write here is narrower than "any mutation". Read-only mode
 * exists to stop *outbound effects and bulk work* during an incident, not to
 * freeze the product: someone should still be able to sign in, read their
 * reports, triage a reply that already arrived, and mark a deal won. Blocking
 * those would turn a delivery incident into a total outage for reasons that have
 * nothing to do with the incident.
 *
 * So the guarded set is: launching a campaign, importing leads, sourcing leads,
 * and sending. Sending is stopped in the worker rather than here, because a
 * request-level check cannot reach a task that is already queued.
 */

export class ReadOnlyModeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReadOnlyModeError";
  }
}

/**
 * Throw when the platform is in read-only mode or sending is halted.
 *
 * Both are checked, because a halt with campaigns still launchable would let a
 * queue build up behind the halt and then release all at once when it lifts,
 * which is a worse outcome than the incident being handled.
 */
export async function assertWritesAllowed(): Promise<void> {
  const settings = await getPlatformSettings();
  if (settings.sendingHalted) {
    throw new ReadOnlyModeError(
      settings.haltReason.trim() !== ""
        ? `Sending is paused across Cadence: ${settings.haltReason.trim()} Your work is saved and nothing was lost.`
        : "Sending is paused across Cadence while we deal with an issue. Your work is saved and nothing was lost."
    );
  }
  if (settings.readOnlyMode) {
    throw new ReadOnlyModeError(
      "Cadence is temporarily read-only while we deal with an issue. You can still read everything; launching and importing will work again shortly."
    );
  }
}
