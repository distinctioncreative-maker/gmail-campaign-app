import { notFound } from "next/navigation";
import Link from "next/link";
import { requireOperator, NotAnOperatorError } from "@/lib/auth/requireOperator";
import { OwnerConsole } from "@/components/owner/OwnerConsole";
import { STEP_UP_WINDOW_MS } from "@/lib/platform/operators";
import { stepUpSatisfied } from "@/lib/platform/operators";

/**
 * The portal.
 *
 * A non-operator gets the app's ordinary 404, identical to any mistyped URL. A
 * 403 here would confirm both that the portal exists and that the address was
 * right, which is precisely the pair of facts worth withholding from someone
 * probing for it.
 */
export default async function OwnerPage() {
  let ctx;
  try {
    ctx = await requireOperator();
  } catch (err) {
    if (err instanceof NotAnOperatorError) notFound();
    throw err;
  }

  const fresh = stepUpSatisfied(ctx.authTimeSeconds);

  return (
    <div>
      <header>
        <p className="text-xs font-medium uppercase tracking-wide text-muted">Cadence operations</p>
        <h1 className="mt-1 text-2xl font-semibold">Platform controls</h1>
        <p className="mt-2 text-sm text-muted">
          Signed in as {ctx.email}. These controls act across every workspace, and every change is
          recorded against your address.
        </p>
      </header>

      {!fresh ? (
        <div className="alert-warning mt-6 rounded-xl border p-4 text-sm">
          <p className="font-semibold">Sign in again to make changes</p>
          <p className="mt-1">
            Reading is fine, but changing anything needs a sign-in from the last{" "}
            {Math.round(STEP_UP_WINDOW_MS / 60000)} minutes. A five-day session should not be enough
            to suspend a customer.
          </p>
          <Link
            href="/sign-in?next=/owner"
            className="btn-secondary mt-3 inline-flex min-h-11 items-center px-4 py-2.5 no-underline"
          >
            Sign in again
          </Link>
        </div>
      ) : null}

      <OwnerConsole canWrite={fresh} />

      <p className="mt-8 text-xs text-muted">
        <Link href="/home" className="underline decoration-border underline-offset-4">
          Back to the app
        </Link>
      </p>
    </div>
  );
}
