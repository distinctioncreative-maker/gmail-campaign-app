import { requireUser } from "@/lib/auth/requireUser";
import { getConnectionPublic } from "@/lib/repositories/gmailConnections";
import { getSenderProfile } from "@/lib/repositories/userSettings";
import { OnboardingWizard } from "@/components/OnboardingWizard";

export default async function OnboardingPage() {
  const ctx = await requireUser();
  const [connection, profile] = await Promise.all([
    getConnectionPublic(ctx.userId),
    getSenderProfile(ctx),
  ]);

  return (
    <OnboardingWizard
      displayName={ctx.user.displayName}
      onboardingStatus={ctx.user.onboardingStatus}
      gmailConnected={connection?.status === "CONNECTED"}
      connectedEmail={connection?.status === "CONNECTED" ? connection.connectedEmail : null}
      profile={profile}
    />
  );
}
