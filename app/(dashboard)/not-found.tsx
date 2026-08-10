import Link from "next/link";
import { Icon } from "@/components/ui/Icon";

/**
 * A missing page inside the app, which is almost always a deleted campaign,
 * template, or lead reached from a bookmark or an old link in a Slack message.
 *
 * Inside the dashboard route group on purpose, so the sidebar and account menu
 * stay: the root 404 loses them, and someone who followed a stale link to one
 * campaign should not be dumped out of the product.
 */
export default function DashboardNotFound() {
  return (
    <div className="mx-auto max-w-lg py-16 text-center">
      <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-surface-2 text-muted">
        <Icon name="search" size={22} aria-hidden />
      </span>
      <h1 className="mt-4 text-2xl font-semibold">Not found</h1>
      <p className="mt-2 text-sm text-muted">
        This page does not exist, or what it pointed at was deleted. Deleted campaigns keep their
        history for a while, so check Recently Deleted before assuming it is gone.
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        <Link href="/home" className="btn-primary min-h-11 px-4 py-2.5 text-sm no-underline">
          Back to Home
        </Link>
        <Link href="/campaigns" className="btn-secondary min-h-11 px-4 py-2.5 text-sm no-underline">
          All campaigns
        </Link>
      </div>
    </div>
  );
}
