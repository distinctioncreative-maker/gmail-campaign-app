import { PageSkeleton } from "@/components/ui/PageSkeleton";

/** A page of contacts, a total count, and every lead list, in parallel. */
export default function Loading() {
  return <PageSkeleton tiles={4} rows={10} />;
}
