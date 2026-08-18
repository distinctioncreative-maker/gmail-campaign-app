/**
 * Above this many recipients, launching requires typing SEND.
 *
 * Shared because it was written twice: the server refused a launch over 100
 * without the confirmation, and the wizard separately decided when to show the
 * box, using its own literal. Two copies of a threshold drift, and the way this
 * one would drift is silent and one-directional. Raise the server's number alone
 * and the box appears for campaigns that no longer need it, which is merely
 * annoying. Raise the client's alone and the box stops appearing for campaigns
 * that still require it, so the launch fails at the final button with an error
 * about a field the person was never shown.
 */
export const SEND_CONFIRM_THRESHOLD = 100;

/** The confirmation the server expects, verbatim. */
export const SEND_CONFIRM_WORD = "SEND";

/** Whether this campaign size needs the typed confirmation. */
export function needsSendConfirmation(recipientCount: number): boolean {
  return recipientCount > SEND_CONFIRM_THRESHOLD;
}
