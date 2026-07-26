import "server-only";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { ForbiddenError, UnauthorizedError } from "@/lib/auth/requireUser";
import { AuthError } from "@/lib/auth/session";
import { reportError } from "@/lib/observability/report";

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
