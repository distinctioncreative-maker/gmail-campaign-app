import { PageSkeleton } from "@/components/ui/PageSkeleton";

/** Walks the recipients of up to sixty campaigns to find the ones that replied. */
export default function Loading() {
  return <PageSkeleton tiles={4} rows={8} />;
}
