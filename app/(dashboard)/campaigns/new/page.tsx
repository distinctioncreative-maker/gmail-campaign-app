import Link from "next/link";
import { CampaignWizard } from "@/components/campaign/CampaignWizard";

export default function NewCampaignPage() {
  return (
    <div>
      <Link href="/campaigns" className="text-sm text-slate-500 hover:underline">
        ← All campaigns
      </Link>
      <div className="mt-4">
        <CampaignWizard />
      </div>
    </div>
  );
}
