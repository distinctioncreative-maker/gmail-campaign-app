import { PageSkeleton } from "@/components/ui/PageSkeleton";

/** Reports aggregates every campaign, recipient, and event in the range before
 * it can draw a single number, which makes it the slowest page in the product. */
export default function Loading() {
  return <PageSkeleton tiles={4} rows={8} />;
}
