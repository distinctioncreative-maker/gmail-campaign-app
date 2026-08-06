import "server-only";
import type { NextRequest } from "next/server";
import { apiKeyFromHeader, hasScope, type ApiScope } from "@/lib/apiKeys/token";
import { verifyApiKey, type ApiKeyContext } from "@/lib/apiKeys/store";

/**
 * The guard for the public API.
 *
 * A deliberate sibling of `requireUser` rather than an extension of it. The two
 * establish different things: a session identifies a *person* and carries their
 * role, while a key identifies an *integration* and carries scopes. Letting a
 * key flow into code that expects a user would mean role checks silently
 * passing or failing against an object that has no role, which is exactly the
 * kind of confusion that turns into a privilege bug.
 *
 * Errors are deliberately identical for a missing key, a malformed key, a
 * revoked key, and a key belonging to another workspace. Distinguishing them
 * would tell someone probing which of their guesses was closer.
 */

export class ApiKeyError extends Error {
  readonly status: number;
  constructor(message: string, status = 401) {
    super(message);
    this.name = "ApiKeyError";
    this.status = status;
  }
}

const UNAUTHORIZED = "Invalid or missing API key. Send it as: Authorization: Bearer cad_live_...";

export async function requireApiKey(
  req: NextRequest,
  required: ApiScope
): Promise<ApiKeyContext> {
  const secret = apiKeyFromHeader(req.headers.get("authorization"));
  if (!secret) throw new ApiKeyError(UNAUTHORIZED);

  const context = await verifyApiKey(secret);
  if (!context) throw new ApiKeyError(UNAUTHORIZED);

  if (!hasScope(context.scopes, required)) {
    // Scope failure is a 403 and *is* specific, unlike the 401s above. The
    // caller has proven they hold a real key, so telling them which scope they
    // are missing helps them fix it and reveals nothing they did not already
    // have.
    throw new ApiKeyError(
      `This key does not have the "${required}" scope. Add it in Settings, or use a key that has it.`,
      403
    );
  }
  return context;
}
