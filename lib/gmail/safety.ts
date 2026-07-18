import { env } from "@/lib/env";

export interface OutboundEnvelope {
  to: string;
  subject: string;
}

export class TestModeConfigError extends Error {
  constructor() {
    super(
      "Test mode is on but no test email address is configured. Set TEST_EMAIL_DESTINATION before sending anything."
    );
  }
}

/**
 * Global outbound safety gate. EVERY email leaving the app must pass
 * through this function immediately before the Gmail API call.
 *
 * `testMode` is decided by the caller and is REQUIRED — there is no
 * implicit default — so no send path can accidentally skip the decision.
 * When true, the destination is forced to the configured test account and
 * the subject is prefixed `[TEST]`; no address from real data can receive
 * mail. See `lib/sending/mode.ts` for how the mode is resolved.
 */
export function applySendSafety(
  envelope: OutboundEnvelope,
  testMode: boolean
): OutboundEnvelope {
  if (!testMode) return envelope;

  const destination = env.TEST_EMAIL_DESTINATION.trim();
  if (!destination) throw new TestModeConfigError();

  return {
    to: destination,
    subject: envelope.subject.startsWith("[TEST]")
      ? envelope.subject
      : `[TEST] ${envelope.subject}`,
  };
}
