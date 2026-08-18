import { requireUser } from "@/lib/auth/requireUser";
import { capabilitiesFor } from "@/lib/tenancy/capabilities";
import { InviteTeamCard } from "@/components/admin/InviteTeamCard";
import { getSenderProfile } from "@/lib/repositories/userSettings";
import { InboxPoolCard } from "@/components/inboxes/InboxPoolCard";
import { ProfileForm } from "@/components/ProfileForm";
import { ComplianceCard } from "@/components/settings/ComplianceCard";
import { DisplayNameForm } from "@/components/DisplayNameForm";
import { PageHeader } from "@/components/ui/PageHeader";
import { CollapsibleCard } from "@/components/ui/CollapsibleCard";
import { BillingCard } from "@/components/admin/BillingCard";
import { getOrgSettings } from "@/lib/repositories/orgSettings";
import { DeleteAccountCard } from "@/components/account/DeleteAccountCard";
import { ExportDataCard } from "@/components/account/ExportDataCard";
import { SessionsCard } from "@/components/account/SessionsCard";
import { ApiKeysCard } from "@/components/settings/ApiKeysCard";
import { WebhooksCard } from "@/components/settings/WebhooksCard";
import { exportSummary } from "@/lib/export/datasets";
import { deletionState } from "@/lib/account/deletion";
import { GRACE_PERIOD_DAYS } from "@/lib/account/eligibility";

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ gmail?: string }>;
}) {
  const ctx = await requireUser();
  const [profile, settings, deletion, exportCounts] = await Promise.all([
    getSenderProfile(ctx),
    getOrgSettings(ctx.organizationId),
    deletionState(ctx, "ACCOUNT"),
    // Aggregation queries, not document reads: five counts cost far less than
    // paging the collections just to size a label.
    exportSummary(ctx),
  ]);
  const capabilities = capabilitiesFor(ctx.tenantType, settings.billing.plan);
  const { gmail } = await searchParams;

  return (
    <div>
      <PageHeader title="Settings" description="Your Gmail connection, sender profile, signature, and default pacing." />

      {gmail === "connected" && (
        <p className="mt-4 rounded-lg bg-success-soft p-3 text-sm text-success">
          Gmail connected successfully.
        </p>
      )}
      {gmail === "denied" && (
        <p className="mt-4 rounded-lg bg-warning-soft p-3 text-sm text-warning">
          Gmail connection was cancelled. You can try again whenever you&apos;re ready.
        </p>
      )}
      {(gmail === "error" || gmail === "no_refresh_token") && (
        <p className="mt-4 rounded-lg bg-danger-soft p-3 text-sm text-danger">
          Something went wrong connecting Gmail. Please try again.
        </p>
      )}
      {gmail === "account_mismatch" && (
        <p className="alert-danger mt-4 rounded-lg border p-3 text-sm text-danger">
          Connect the same Google account you use to sign in to Cadence. No mailbox was saved.
        </p>
      )}

      <div className="mt-6 max-w-2xl space-y-6">
        {ctx.role === "ADMIN" && (
          <div className="animate-rise">
            <BillingCard />
          </div>
        )}
        {ctx.role === "ADMIN" && capabilities.invites && (
          <div className="animate-rise">
            <InviteTeamCard solo={ctx.tenantType === "CONSUMER"} />
          </div>
        )}
        <div className="card p-6 sm:p-7 animate-rise">
          <h2 className="font-medium">Your name</h2>
          <p className="mt-1 text-sm text-muted">
            Shown in the account menu and on Team pages instead of your email address.
          </p>
          <div className="mt-4">
            <DisplayNameForm initial={ctx.user.displayName} />
          </div>
        </div>
        {/* The pool replaces the single-connection card. A customer with one
            inbox sees one row and the same actions they always had; a customer
            with several sees where their capacity actually comes from. */}
        <div className="animate-rise" style={{ animationDelay: "35ms" }}>
          <InboxPoolCard />
        </div>
        {/* Before the profile, because it is what tells you which parts of the
            profile you actually have to fill in. */}
        <div className="animate-rise" style={{ animationDelay: "70ms" }}>
          <ComplianceCard />
        </div>
        <div
          id="sender-profile"
          className="animate-rise scroll-mt-24"
          style={{ animationDelay: "105ms" }}
        >
          <CollapsibleCard
            title="Sender profile & sending defaults"
            /* Was "Optional", and collapsed by default, while two fields inside
               it, the postal address and the opt-out sentence, block campaign
               launch. Anyone who took that description at face value met the
               rule as a refusal rather than as a step. It now opens by itself
               when either is still missing. */
            description="Your signature, the postal address and opt-out line required on commercial email, and default campaign pacing."
            storageKey="settings.senderProfile"
            defaultOpen={
              !profile.physicalAddress.trim() || !profile.unsubscribeText.trim()
            }
          >
            <ProfileForm initial={profile} />
          </CollapsibleCard>
        </div>
        {/* Admin only, both of them: a key is a credential to the whole
            workspace's data, and a webhook decides where that data is sent. */}
        {ctx.role === "ADMIN" ? (
          <div className="animate-rise" style={{ animationDelay: "88ms" }}>
            <ApiKeysCard />
          </div>
        ) : null}
        {ctx.role === "ADMIN" ? (
          <div className="animate-rise" style={{ animationDelay: "96ms" }}>
            <WebhooksCard />
          </div>
        ) : null}
        {/* Every member, not admins only: this is about your own account. */}
        <div className="animate-rise" style={{ animationDelay: "98ms" }}>
          <SessionsCard
            lastLoginAt={ctx.user.lastLoginAt}
            sessionsRevokedAt={ctx.user.sessionsRevokedAt}
          />
        </div>
        {/* Export sits immediately above deletion on purpose: taking your
            data out is the thing you want to do first if you are about to
            delete it, and finding that out afterwards is too late. */}
        <div className="animate-rise" style={{ animationDelay: "105ms" }}>
          <ExportDataCard counts={exportCounts} />
        </div>
        {/* Last, and visually separated: the only control here that destroys
            work belongs at the bottom of the page, not beside the ones people
            use every day. */}
        <div className="animate-rise border-t border-border pt-6" style={{ animationDelay: "140ms" }}>
          <DeleteAccountCard
            initial={{
              request: deletion.request,
              allowed: deletion.verdict.allowed,
              effectiveScope: deletion.verdict.effectiveScope,
              reason: deletion.verdict.reason,
              gracePeriodDays: GRACE_PERIOD_DAYS,
            }}
            canDeleteWorkspace={ctx.role === "ADMIN"}
            soloWorkspace={deletion.verdict.effectiveScope === "WORKSPACE"}
          />
        </div>
      </div>
    </div>
  );
}
