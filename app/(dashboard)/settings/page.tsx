import { requireUser } from "@/lib/auth/requireUser";
import { getConnectionPublic } from "@/lib/repositories/gmailConnections";
import { getSenderProfile } from "@/lib/repositories/userSettings";
import { GmailConnectionCard } from "@/components/GmailConnectionCard";
import { ProfileForm } from "@/components/ProfileForm";
import { DisplayNameForm } from "@/components/DisplayNameForm";
import { PageHeader } from "@/components/ui/PageHeader";
import { CollapsibleCard } from "@/components/ui/CollapsibleCard";

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ gmail?: string }>;
}) {
  const ctx = await requireUser();
  const [connection, profile] = await Promise.all([
    getConnectionPublic(ctx.userId),
    getSenderProfile(ctx),
  ]);
  const { gmail } = await searchParams;

  return (
    <div>
      <PageHeader title="Settings" description="Your Gmail connection, sender profile, signature, and default pacing." />

      {gmail === "connected" && (
        <p className="mt-4 rounded-lg bg-green-50 p-3 text-sm text-green-700">
          Gmail connected successfully.
        </p>
      )}
      {gmail === "denied" && (
        <p className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-700">
          Gmail connection was cancelled. You can try again whenever you&apos;re ready.
        </p>
      )}
      {(gmail === "error" || gmail === "no_refresh_token") && (
        <p className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">
          Something went wrong connecting Gmail. Please try again.
        </p>
      )}

      <div className="mt-6 max-w-2xl space-y-6">
        <div className="card p-6">
          <h2 className="font-medium">Your name</h2>
          <p className="mt-1 text-sm text-slate-600">
            Shown in the account menu and on Team pages instead of your email address.
          </p>
          <div className="mt-4">
            <DisplayNameForm initial={ctx.user.displayName} />
          </div>
        </div>
        <GmailConnectionCard
          connectedEmail={connection?.status === "CONNECTED" ? connection.connectedEmail : null}
          lastRefreshAt={connection?.status === "CONNECTED" ? connection.lastRefreshAt : null}
        />
        <CollapsibleCard
          title="Sender profile & sending defaults"
          description="Optional — fills in your signature, footer, and default campaign pacing. Not using it? Collapse it and it stays out of your way."
          storageKey="settings.senderProfile"
          defaultOpen={false}
        >
          <ProfileForm initial={profile} />
        </CollapsibleCard>
      </div>
    </div>
  );
}
