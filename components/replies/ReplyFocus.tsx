import Link from "next/link";
import { Icon } from "@/components/ui/Icon";
import { LocalTime } from "@/components/LocalTime";

/**
 * The one conversation waiting on you, given the top of the page.
 *
 * Replies is the screen reps live in once campaigns are running, and it opened
 * as a page title, three stat tiles, and a table: the same shape as Templates,
 * Suppressions, and the audit log. The rows were already sorted hot-first, so
 * the product knew which conversation mattered most and then presented it as row
 * one of a table, which is the least emphasis a piece of information can be
 * given while still being on the page.
 *
 * This is the third archetype, after the index and the detail screen: a
 * workspace, meaning a screen whose job is to help you do the next thing rather
 * than to list what exists. The queue stays exactly as it was underneath. What
 * changes is that the work comes first.
 *
 * Deliberately conditional. It renders only when there is a reply with no
 * recorded outcome and an intent that is not "not interested", which is the same
 * definition the "Waiting on you" figure uses, so the two can never disagree. On
 * an inbox where everything is actioned there is no panel at all, because a
 * focus panel showing a finished conversation is worse than no panel: it teaches
 * a rep that the top of the page is decoration.
 *
 * The snippet is the reply's own words rather than a summary. On a screen about
 * answering people, the thing that decides what you do next is what they
 * actually said.
 */
export function ReplyFocus({
  name,
  email,
  campaignName,
  contactId,
  intentLabel,
  intentClassName,
  snippet,
  repliedAt,
  timeToReply,
  waiting,
  children,
}: {
  name: string;
  email: string;
  campaignName: string;
  contactId: string;
  intentLabel: string;
  intentClassName: string;
  snippet: string;
  repliedAt: number;
  timeToReply: string;
  /** How many replies are waiting in total, this one included. */
  waiting: number;
  /** Thread viewer, draft button, outcome control: owned by the page. */
  children?: React.ReactNode;
}) {
  return (
    <section
      className="card card-hover relative overflow-hidden p-6 sm:p-7"
      aria-labelledby="reply-focus-heading"
    >
      <div className="drift-field" aria-hidden />

      <div className="relative">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <p id="reply-focus-heading" className="display-label flex items-center gap-2">
            <Icon name="sparkles" size={14} aria-hidden />
            Next up
          </p>
          {waiting > 1 && (
            <p className="text-xs text-muted">
              <span className="font-semibold tabular-nums text-foreground">{waiting - 1}</span> more
              waiting below
            </p>
          )}
        </div>

        <div className="mt-4 flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <Link
                href={`/leads/${contactId}`}
                className="text-[1.375rem] font-semibold leading-tight tracking-[-0.02em] text-foreground hover:underline"
              >
                {name || email}
              </Link>
              <span className={`badge ${intentClassName}`}>{intentLabel}</span>
            </div>
            <p className="mt-1.5 text-sm text-muted">
              {campaignName} &middot; replied <LocalTime value={repliedAt} /> &middot; {timeToReply}{" "}
              after your send
            </p>
          </div>
        </div>

        {/* Their words, in a quoted block rather than a table cell: this is the
            thing that decides what the rep does next. */}
        <blockquote className="mt-5 border-l-2 border-border pl-4 text-[0.9375rem] leading-relaxed text-foreground">
          {snippet}
        </blockquote>

        {children && <div className="mt-5 flex flex-wrap items-center gap-2">{children}</div>}
      </div>
    </section>
  );
}
