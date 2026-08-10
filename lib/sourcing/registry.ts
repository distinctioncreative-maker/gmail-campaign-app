import "server-only";
import { apolloConfigured, apolloProvider } from "./apollo";
import type { SourcingProvider } from "./provider";

/**
 * Which provider is in use, or none.
 *
 * Env-gated in the same way the Stripe and AI integrations are: with no key the
 * feature is absent rather than broken. That matters more here than elsewhere,
 * because the alternative is a search button that fails on every press, and a
 * customer cannot tell "not set up" from "not working" from the outside.
 *
 * A registry rather than a direct import so swapping vendors touches this file
 * and one adapter, which is the whole reason provider.ts exists.
 */
export function activeSourcingProvider(): SourcingProvider | null {
  if (apolloConfigured()) return apolloProvider;
  return null;
}

export function sourcingConfigured(): boolean {
  return activeSourcingProvider() !== null;
}
