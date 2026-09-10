import { requireUser } from "@/lib/auth/requireUser";
import { capabilitiesFor } from "@/lib/tenancy/capabilities";
import { InviteTeamCard } from "@/components/admin/InviteTeamCard";
import { getSenderProfile } from "@/lib/repositories/userSettings";
import { InboxPoolCard } from "@/components/inboxes/InboxPoolCard";
import { ProfileForm } from "@/components/ProfileForm";
import { ComplianceCard } from "@/components/settings/ComplianceCard";
import { DisplayNameForm } from "@/components/DisplayNameForm";
import { PageHeader } from "@/components/ui/PageHeader";
import { Section } from "@/components/ui/Section";
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
    <div className="page-sections">
      <PageHeader title="Settings" description="Your Gmail connection, sender profile, signature, and default pacing." />

      {gmail === "connected" && (
        <p className="rounded-lg bg-success-soft p-3 text-sm text-success">
          Gmail connected successfully.
        </p>
      )}
      {gmail === "denied" && (
        <p className="rounded-lg bg-warning-soft p-3 text-sm text-warning">
          Gmail connection was cancelled. You can try again whenever you&apos;re ready.
        </p>
      )}
      {(gmail === "error" || gmail === "no_refresh_token") && (
        <p className="rounded-lg bg-danger-soft p-3 text-sm text-danger">
          Something went wrong connecting Gmail. Please try again.
        </p>
      )}
      {gmail === "account_mismatch" && (
        <p className="alert-danger rounded-lg border p-3 text-sm text-danger">
          Connect the same Google account you use to sign in to Cadence. No mailbox was saved.
        </p>
      )}

      {/* Six named groups, where there were eleven cards in one column.
          The order the comments below defend was real and is kept: compliance
          immediately before the profile it tells you how to fill in, export
          immediately above the deletion you would regret doing first. What was
          missing was any signal to the reader about which of these eleven
          things belonged with which.

          The per-card `animate-rise` delays are gone. They ran 35, 70, 88, 96,
          98, 105, 105 and 140ms: two of them identical, none of them derivable
          from anything, and a choreographed entrance on a settings page is
          motion for its own sake. */}
      <div className="max-w-2xl">
        {/* First, because it is what breaks and what blocks a launch. */}
        <Section
          title="Sending"
          description="Where your email leaves from, and the two things every commercial message must carry."
        >
          {/* The pool replaces the single-connection card. A customer with one
              inbox sees one row and the same actions they always had; a customer
              with several sees where their capacity actually comes from. */}
          <InboxPoolCard />
          {/* Before the profile, because it is what tells you which parts of the
              profile you actually have to fill in. */}
          <ComplianceCard />
          <div id="sender-profile" className="scroll-mt-24">
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
        </Section>

        <Section title="Your account">
          <div className="card p-6 sm:p-7">
            <h3>Your name</h3>
            <p className="mt-1 text-muted">
              Shown in the account menu and on Team pages instead of your email address.
            </p>
            <div className="mt-4">
              <DisplayNameForm initial={ctx.user.displayName} />
            </div>
          </div>
          {/* Every member, not admins only: this is about your own account. */}
          <SessionsCard
            lastLoginAt={ctx.user.lastLoginAt}
            sessionsRevokedAt={ctx.user.sessionsRevokedAt}
          />
        </Section>

        {ctx.role === "ADMIN" && (
          <Section title="Workspace">
            <BillingCard />
            {capabilities.invites && (
              <InviteTeamCard solo={ctx.tenantType === "CONSUMER"} />
            )}
          </Section>
        )}

        {/* Admin only, both of them: a key is a credential to the whole
            workspace's data, and a webhook decides where that data is sent. */}
        {ctx.role === "ADMIN" && (
          <Section
            title="Developer access"
            description="Programmatic access to this workspace. Treat both as credentials."
          >
            <ApiKeysCard />
            <WebhooksCard />
          </Section>
        )}

        {/* Export sits immediately above deletion on purpose: taking your data
            out is the thing you want to do first if you are about to delete it,
            and finding that out afterwards is too late. The group carries a rule
            and a wider gap, because being last in a column was never a warning. */}
        <Section
          title="Your data"
          description="Take a copy out, or close the account for good."
          tone="danger"
        >
          <ExportDataCard counts={exportCounts} />
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
        </Section>
      </div>
    </div>
  );
}
