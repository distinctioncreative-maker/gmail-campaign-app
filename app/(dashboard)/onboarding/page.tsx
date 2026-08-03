import { requireUser } from "@/lib/auth/requireUser";
import { getConnectionPublic } from "@/lib/repositories/gmailConnections";
import { getSenderProfile } from "@/lib/repositories/userSettings";
import { OnboardingWizard } from "@/components/OnboardingWizard";
import { getOrganization, getOrgSettings } from "@/lib/repositories/orgSettings";

export default async function OnboardingPage() {
  const ctx = await requireUser();
  const [connection, profile, organization, settings] = await Promise.all([
    getConnectionPublic(ctx.userId),
    getSenderProfile(ctx),
    getOrganization(ctx.organizationId),
    getOrgSettings(ctx.organizationId),
  ]);

  return (
    <OnboardingWizard
      displayName={ctx.user.displayName}
      onboardingStatus={ctx.user.onboardingStatus}
      gmailConnected={connection?.status === "CONNECTED"}
      connectedEmail={connection?.status === "CONNECTED" ? connection.connectedEmail : null}
      profile={profile}
      workspaceName={organization?.name ?? "My workspace"}
      workspaceProfile={settings.workspaceProfile}
      canConfigureWorkspace={ctx.role === "ADMIN"}
    />
  );
}
