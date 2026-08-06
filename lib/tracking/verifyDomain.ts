import "server-only";
import { resolveCname } from "node:dns/promises";
import { env } from "@/lib/env";
import { assessVerification, cnameTarget, type VerificationResult } from "./domain";

/**
 * The DNS half of tracking-domain verification.
 *
 * Separated from the pure logic in ./domain.ts so the decision rules are
 * testable without a resolver, and so this file stays small enough to read in
 * one go: it does one lookup, bounds it, and hands the result over.
 */

/** DNS can hang indefinitely. A slow verification is fine; a stuck one is not. */
const TIMEOUT_MS = 4_000;

async function lookupCname(host: string): Promise<{ resolved: boolean; cnames: string[] }> {
  const attempt = resolveCname(host)
    .then((records) => ({ resolved: true, cnames: records }))
    .catch(() => ({ resolved: false, cnames: [] as string[] }));
  const timeout = new Promise<{ resolved: false; cnames: string[] }>((resolve) =>
    setTimeout(() => resolve({ resolved: false, cnames: [] }), TIMEOUT_MS)
  );
  return Promise.race([attempt, timeout]);
}

/**
 * Check whether a host points at this deployment.
 *
 * Every failure mode collapses to "not yet", never to "wrong", because a
 * resolver timeout and a genuinely misconfigured record are indistinguishable
 * from here and only one of them is worth sending a customer to fix. See
 * `assessVerification` for that reasoning.
 */
export async function verifyTrackingDomain(host: string): Promise<VerificationResult> {
  const expectedTarget = cnameTarget(env.APP_BASE_URL);
  if (!expectedTarget) {
    return {
      verified: false,
      status: "FAILED",
      message: "This deployment has no public URL configured, so a domain cannot be verified yet.",
    };
  }
  const { resolved, cnames } = await lookupCname(host);
  return assessVerification({ cnames, resolved, expectedTarget });
}
