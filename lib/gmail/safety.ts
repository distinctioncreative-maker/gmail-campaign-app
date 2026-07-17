import { env, isTestMode } from "@/lib/env";

export interface OutboundEnvelope {
  to: string;
  subject: string;
}

export class TestModeConfigError extends Error {
  constructor() {
    super(
      "Test mode is on but TEST_EMAIL_DESTINATION is not configured. Set it before sending anything."
    );
  }
}

/**
 * Global outbound safety gate. EVERY email leaving the app must pass
 * through this function immediately before the Gmail API call.
 *
 * While TEST_MODE is on (the default everywhere except an explicit
 * production opt-out), the destination is forced to the configured test
 * account and the subject is prefixed with [TEST]. No recipient address
 * from real data can receive mail in test mode.
 */
export function applySendSafety(envelope: OutboundEnvelope): OutboundEnvelope {
  if (!isTestMode()) return envelope;

  const destination = env.TEST_EMAIL_DESTINATION.trim();
  if (!destination) throw new TestModeConfigError();

  return {
    to: destination,
    subject: envelope.subject.startsWith("[TEST]")
      ? envelope.subject
      : `[TEST] ${envelope.subject}`,
  };
}
