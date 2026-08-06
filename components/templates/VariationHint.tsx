"use client";

import { useMemo } from "react";
import { analyzeSpintax, describeVariants } from "@/lib/personalization/spintax";
import { Icon } from "@/components/ui/Icon";

/**
 * The variant count, live under the editor.
 *
 * A writer adding `{Hi|Hello|Hey}` has no way to know whether they got the
 * syntax right until an email goes out with a brace in it. Showing the count as
 * they type turns that into immediate feedback: "3 distinct versions" means it
 * parsed, and a syntax complaint means it did not.
 *
 * It states the byte-identical case rather than staying silent, because a
 * writer who has never heard of spintax is exactly the person this is for.
 */
export function VariationHint({ subject, html }: { subject: string; html: string }) {
  const analysis = useMemo(() => analyzeSpintax(`${subject} ${html}`), [subject, html]);
  const varied = analysis.variants > 1;
  const broken = analysis.issues.length > 0;

  return (
    <div className="mt-2 flex items-start gap-2 text-xs">
      <span
        className={`mt-0.5 shrink-0 ${broken ? "text-warning" : varied ? "text-success" : "text-muted"}`}
      >
        <Icon name={broken ? "alert" : varied ? "check" : "sparkles"} size={14} aria-hidden />
      </span>
      <span className="min-w-0">
        <span className={broken ? "text-warning" : "text-muted"}>
          {broken ? analysis.issues[0].message : describeVariants(analysis)}
        </span>
        {!varied && !broken ? (
          <span className="mt-0.5 block text-muted">
            Write{" "}
            <code className="rounded bg-surface-2 px-1 py-0.5">
              {"{Hi|Hello|Hey}"}
            </code>{" "}
            to have each recipient get slightly different wording. Providers cluster on message
            similarity, so this is a free deliverability win. The same lead always gets the same
            version.
          </span>
        ) : null}
      </span>
    </div>
  );
}
