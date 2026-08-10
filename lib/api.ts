import "server-only";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { ForbiddenError, UnauthorizedError } from "@/lib/auth/requireUser";
import { AuthError } from "@/lib/auth/session";
import { reportError } from "@/lib/observability/report";
import { RateLimitedError } from "@/lib/util/userRateLimit";
import { NotAnOperatorError, StepUpRequiredError } from "@/lib/auth/requireOperator";
import { ReadOnlyModeError } from "@/lib/platform/readonly";

/**
 * Wrap a route handler with uniform, user-friendly error responses.
 * Raw stack traces never reach the client.
 */
export function handleApiErrors<Args extends unknown[]>(
  handler: (...args: Args) => Promise<NextResponse>
): (...args: Args) => Promise<NextResponse> {
  return async (...args: Args) => {
    try {
      return await handler(...args);
    } catch (err) {
      if (err instanceof UnauthorizedError) {
        return NextResponse.json({ error: "Please sign in to continue." }, { status: 401 });
      }
      if (err instanceof ForbiddenError || err instanceof AuthError) {
        return NextResponse.json({ error: err.message }, { status: 403 });
      }
      // A non-operator learns nothing: see lib/auth/requireOperator.ts.
      // 503 rather than 403: the caller is allowed to do this, the service is
      // temporarily not doing it, and the distinction decides whether they
      // retry or contact support.
      if (err instanceof ReadOnlyModeError) {
        return NextResponse.json({ error: err.message }, { status: 503 });
      }
      if (err instanceof NotAnOperatorError) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }
      if (err instanceof StepUpRequiredError) {
        return NextResponse.json({ error: err.message, stepUp: true }, { status: 401 });
      }
      if (err instanceof RateLimitedError) {
        // 429 with the specific message, because "too many requests" alone
        // leaves someone staring at a screen with nothing to act on.
        return NextResponse.json({ error: err.message }, { status: 429 });
      }
      if (err instanceof ZodError) {
        return NextResponse.json(
          { error: "That request was not valid. Please check the form and try again." },
          { status: 400 }
        );
      }
      reportError(err, { scope: "api" });
      return NextResponse.json(
        { error: "Something went wrong on our side. Please try again." },
        { status: 500 }
      );
    }
  };
}
