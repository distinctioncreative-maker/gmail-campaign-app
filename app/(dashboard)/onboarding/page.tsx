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

  /**
   * Two of the nine sender-profile fields are already known by the time anyone
   * reaches that step, because the step before it connects Gmail. Asking
   * somebody to type the address of the mailbox they just authorised, and the
   * name on the Google account they signed in with, is asking them to do the
   * computer's work.
   *
   * Blanks only. A saved value always wins: someone who deliberately set a
   * sending name different from their Google profile name must not have it
   * quietly reverted on their next visit to onboarding.
   */
  const seeded = {
    ...profile,
    senderName: profile.senderName || ctx.user.displayName || "",
    senderEmail:
      profile.senderEmail ||
      (connection?.status === "CONNECTED" ? connection.connectedEmail : ""),
  };

  return (
    <OnboardingWizard
      displayName={ctx.user.displayName}
      onboardingStatus={ctx.user.onboardingStatus}
      gmailConnected={connection?.status === "CONNECTED"}
      connectedEmail={connection?.status === "CONNECTED" ? connection.connectedEmail : null}
      profile={seeded}
      workspaceName={organization?.name ?? "My workspace"}
      workspaceProfile={settings.workspaceProfile}
      canConfigureWorkspace={ctx.role === "ADMIN"}
    />
  );
}
