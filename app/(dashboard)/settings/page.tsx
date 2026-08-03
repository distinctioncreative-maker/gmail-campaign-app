import { requireUser } from "@/lib/auth/requireUser";
import { capabilitiesFor } from "@/lib/tenancy/capabilities";
import { InviteTeamCard } from "@/components/admin/InviteTeamCard";
import { getConnectionPublic } from "@/lib/repositories/gmailConnections";
import { getSenderProfile } from "@/lib/repositories/userSettings";
import { GmailConnectionCard } from "@/components/GmailConnectionCard";
import { ProfileForm } from "@/components/ProfileForm";
import { DisplayNameForm } from "@/components/DisplayNameForm";
import { PageHeader } from "@/components/ui/PageHeader";
import { CollapsibleCard } from "@/components/ui/CollapsibleCard";
import { BillingCard } from "@/components/admin/BillingCard";
import { getOrgSettings } from "@/lib/repositories/orgSettings";

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ gmail?: string }>;
}) {
  const ctx = await requireUser();
  const [connection, profile, settings] = await Promise.all([
    getConnectionPublic(ctx.userId),
    getSenderProfile(ctx),
    getOrgSettings(ctx.organizationId),
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
        <div className="card animate-rise p-6">
          <h2 className="font-medium">Your name</h2>
          <p className="mt-1 text-sm text-muted">
            Shown in the account menu and on Team pages instead of your email address.
          </p>
          <div className="mt-4">
            <DisplayNameForm initial={ctx.user.displayName} />
          </div>
        </div>
        <div className="animate-rise" style={{ animationDelay: "35ms" }}>
          <GmailConnectionCard
            connectedEmail={connection?.status === "CONNECTED" ? connection.connectedEmail : null}
            lastRefreshAt={connection?.status === "CONNECTED" ? connection.lastRefreshAt : null}
          />
        </div>
        <div className="animate-rise" style={{ animationDelay: "70ms" }}>
          <CollapsibleCard
            title="Sender profile & sending defaults"
            description="Optional: fills in your signature, footer, and default campaign pacing. Not using it? Collapse it and it stays out of your way."
            storageKey="settings.senderProfile"
            defaultOpen={false}
          >
            <ProfileForm initial={profile} />
          </CollapsibleCard>
        </div>
      </div>
    </div>
  );
}
