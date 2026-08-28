import Link from "next/link";
import { requireUser } from "@/lib/auth/requireUser";
import { PageHeader } from "@/components/ui/PageHeader";
import { SourcingPanel } from "@/components/sourcing/SourcingPanel";
import { activeSourcingProvider } from "@/lib/sourcing/registry";
import { getCreditState } from "@/lib/repositories/sourcingUsage";
import { describeCredits } from "@/lib/sourcing/quota";

/** Finding leads, as opposed to importing ones you already have. */
export default async function SourcingPage() {
  const ctx = await requireUser();
  const provider = activeSourcingProvider();
  // Only read the counter when there is something that could spend it.
  const credits = provider ? await getCreditState(ctx.organizationId) : null;

  return (
    <div>
      <PageHeader
        title="Find leads"
        description="Search a data provider for people who match, then add the ones worth emailing."
      />

      <p className="mt-4 text-sm text-muted">
        <Link
          href="/leads"
          className="text-foreground link"
        >
          ← Back to Leads
        </Link>
      </p>

      <div className="mt-6 max-w-4xl">
        <SourcingPanel
          configured={provider !== null}
          providerName={provider?.name ?? ""}
          initialCredits={credits ? describeCredits(credits) : ""}
        />
      </div>
    </div>
  );
}
