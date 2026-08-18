import Link from "next/link";
import { getSenderProfile } from "@/lib/repositories/userSettings";
import { consentCoverage } from "@/lib/repositories/contacts";
import { requireUser } from "@/lib/auth/requireUser";
import { ConsentBackfill } from "./ConsentBackfill";

/**
 * One screen that answers "am I allowed to send this, and can I prove it?"
 *
 * The information here was not missing before: the postal address and opt-out
 * sentence were already enforced, and launch already refused without them. What
 * was missing was any way to find that out before being stopped. Both fields
 * live inside a card labelled "Optional" that is collapsed by default, so the
 * first time most people learn they are required is when a launch they expected
 * to work refuses. That is the "unguided settings" failure in its purest form:
 * the rule was right and the explanation was nowhere.
 *
 * So this states each requirement, says plainly why it exists, shows whether it
 * is met, and puts the fix next to it. Three properties matter:
 *
 * **Requirements that are already met still appear.** A checklist that hides
 * what passes cannot be used for reassurance, and reassurance is most of what
 * someone wants before their first send.
 *
 * **The two automatic items are listed too.** One-click unsubscribe and the
 * suppression list are handled without any configuration, and saying so stops
 * people hunting for a setting that does not exist, a real support cost, and
 * the reason compliance pages usually feel like homework.
 *
 * **Nothing here is a form.** Each row links to the field that fixes it or
 * offers a single inline action. Anyone whose workspace is in order reads four
 * green rows and leaves.
 */
export async function ComplianceCard() {
  const ctx = await requireUser();
  const [profile, coverage] = await Promise.all([
    getSenderProfile(ctx),
    consentCoverage(ctx),
  ]);

  const hasAddress = profile.physicalAddress.trim().length > 0;
  const hasOptOut = profile.unsubscribeText.trim().length > 0;
  // An empty workspace is not failing this: there is nothing to record yet.
  const consentClear = coverage.total === 0 || coverage.unrecorded === 0;

  const blocking = [hasAddress, hasOptOut].filter((ok) => !ok).length;

  return (
    <div className="card p-6 sm:p-7">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-medium">Sending compliance</h2>
        <span
          className={`badge ${
            blocking > 0
              ? "bg-danger-soft text-danger"
              : consentClear
                ? "bg-success-soft text-success"
                : "bg-warning-soft text-warning"
          }`}
        >
          {blocking > 0
            ? `${blocking} to finish before you can send`
            : consentClear
              ? "Ready to send"
              : "Ready to send, one thing to tidy"}
        </span>
      </div>
      <p className="mt-1 text-sm text-muted">
        What the law and Gmail require of a commercial sender, and where you stand on each.
      </p>

      <ul className="mt-5 space-y-4">
        <ComplianceRow
          ok={hasAddress}
          required
          title="A postal address in every email"
          why="Required by CAN-SPAM and its equivalents. Campaigns will not launch without it."
        >
          {!hasAddress && (
            <p className="mt-2 text-xs text-muted">
              Add it under{" "}
              <Link
                href="/settings#sender-profile"
                className="font-medium text-foreground underline decoration-border underline-offset-4 hover:decoration-foreground"
              >
                Sender profile
              </Link>
              . Your registered business address is the usual answer; a PO box is acceptable.
            </p>
          )}
        </ComplianceRow>

        <ComplianceRow
          ok={hasOptOut}
          required
          title="A way to say stop, in your own words"
          why="Every message carries this sentence alongside the one-click unsubscribe. Campaigns will not launch without it."
        >
          {!hasOptOut && (
            <p className="mt-2 text-xs text-muted">
              Add it under{" "}
              <Link
                href="/settings#sender-profile"
                className="font-medium text-foreground underline decoration-border underline-offset-4 hover:decoration-foreground"
              >
                Sender profile
              </Link>
              .
            </p>
          )}
        </ComplianceRow>

        <ComplianceRow
          ok={consentClear}
          title="A record of where your leads came from"
          why="If a recipient or a provider asks why you emailed them, this is the answer. Recorded once per import."
        >
          {!consentClear && (
            <>
              <p className="mt-2 text-xs text-muted">
                {coverage.unrecorded.toLocaleString()} of {coverage.total.toLocaleString()} leads
                were imported before this was recorded. New imports ask automatically.
              </p>
              <ConsentBackfill unrecorded={coverage.unrecorded} />
            </>
          )}
        </ComplianceRow>

        <ComplianceRow
          ok
          automatic
          title="One-click unsubscribe"
          why="Added to every campaign email as a List-Unsubscribe header, which is what Gmail and Yahoo require of bulk senders. Nothing to configure."
        />

        <ComplianceRow
          ok
          automatic
          title="Unsubscribes and bounces are never emailed again"
          why="Anyone who opts out, hard bounces, or complains is suppressed across every campaign in this workspace, permanently."
        />
      </ul>
    </div>
  );
}

function ComplianceRow({
  ok,
  title,
  why,
  required = false,
  automatic = false,
  children,
}: {
  ok: boolean;
  title: string;
  why: string;
  /** Blocks campaign launch when unmet, which the badge needs to say out loud. */
  required?: boolean;
  /** Handled by the product with no configuration. */
  automatic?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <li className="flex gap-3">
      <span
        aria-hidden
        className={`mt-1.5 size-2 shrink-0 rounded-full ${
          ok ? "bg-success" : required ? "bg-danger" : "bg-warning"
        }`}
      />
      <div className="min-w-0">
        <p className="text-sm font-medium text-foreground">
          {title}
          {/* The status word carries the meaning for anyone who cannot see the
              dot's colour, so it is text rather than a title attribute. */}
          <span className="sr-only">
            {ok ? ": done" : required ? ": required, not set" : ": not recorded"}
          </span>
          {automatic && (
            <span className="ml-2 badge bg-surface-2 align-middle text-[10px] text-muted">
              Automatic
            </span>
          )}
        </p>
        <p className="mt-0.5 text-xs text-muted">{why}</p>
        {children}
      </div>
    </li>
  );
}
