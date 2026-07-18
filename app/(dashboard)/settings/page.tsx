import { requireUser } from "@/lib/auth/requireUser";
import { getConnectionPublic } from "@/lib/repositories/gmailConnections";
import { getSenderProfile } from "@/lib/repositories/userSettings";
import { GmailConnectionCard } from "@/components/GmailConnectionCard";
import { ProfileForm } from "@/components/ProfileForm";

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
      <h1 className="text-2xl font-semibold">Settings</h1>

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
        <GmailConnectionCard
          connectedEmail={connection?.status === "CONNECTED" ? connection.connectedEmail : null}
          lastRefreshAt={connection?.status === "CONNECTED" ? connection.lastRefreshAt : null}
        />
        <div className="card p-6">
          <h2 className="font-medium">Sender profile &amp; sending defaults</h2>
          <p className="mt-1 text-sm text-slate-600">
            Fills in your signature, footer, and default campaign pacing.
          </p>
          <div className="mt-4">
            <ProfileForm initial={profile} />
          </div>
        </div>
      </div>
    </div>
  );
}
