import type { Metadata } from "next";
import type { ReactNode } from "react";

/**
 * The owner portal's shell.
 *
 * Its own route group rather than a page inside the dashboard, for two reasons.
 * It has no customer navigation, because an operator looking at every tenant
 * should not have a sidebar implying they are inside one; and it is excluded from
 * indexing and prefetching, so the URL never turns up anywhere it was not typed.
 */
export const metadata: Metadata = {
  title: "Operations",
  robots: { index: false, follow: false, nocache: true },
};

export default function OwnerLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-surface-2">
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">{children}</div>
    </div>
  );
}
