import { CampaignWizard } from "@/components/campaign/CampaignWizard";
import { PageHeader } from "@/components/ui/PageHeader";

export default function NewCampaignPage() {
  return (
    <div>
      <PageHeader
        title="New campaign"
        description="Pick who it goes to, what it says, and how fast it sends."
        backHref="/campaigns"
        backLabel="All campaigns"
      />
      <CampaignWizard />
    </div>
  );
}
