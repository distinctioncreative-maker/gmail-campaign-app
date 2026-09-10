import type { ReactNode } from "react";

/**
 * A labelled group within a page: the counterpart to `PageHeader`.
 *
 * `PageHeader` was built and adopted on every screen. This was not, and the
 * absence shows: nine of twelve dashboard pages had a title and then a flat
 * pile of cards, with nothing saying which of them belonged together. Settings
 * stacked twelve of them (identity, billing, sending, developer keys and
 * account deletion) at identical visual weight in one column. The pages did not need
 * redesigning so much as they needed a spine.
 *
 * Same prop shape as `PageHeader` on purpose, so there is one thing to learn
 * and the two read as a pair in the source:
 *
 * - `title` is the group's name, and it is required. A section with nothing
 *   worth calling it is not a section, it is a card.
 * - `description` is one line for a group whose name is not self-evident.
 * - `actions` sits on the heading row, for a control that governs the whole
 *   group rather than one card inside it.
 * - `tone="danger"` marks a destructive group. Delete-account being merely
 *   last in a list is not a warning; it needs to look different from the
 *   things above it.
 * - `id` makes the group an anchor target, which is what the campaign page's
 *   section nav scrolls to. It brings `scroll-mt` with it so a jumped-to
 *   heading is not left under the sticky bar.
 *
 * The heading is an `<h2>`, which is correct beneath the page's single `<h1>`
 * and gives a screen-reader user a real outline of the page for the first
 * time.
 */
export function Section({
  title,
  description,
  actions,
  tone = "default",
  id,
  className = "",
  children,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  tone?: "default" | "danger";
  id?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section
      id={id}
      className={[
        "section",
        tone === "danger" ? "section-danger" : "",
        id ? "scroll-mt-24" : "",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <div className="section-head">
        <div className="min-w-0">
          <h2 className="section-title">{title}</h2>
          {description && <p className="section-description">{description}</p>}
        </div>
        {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
      </div>
      <div className="section-body">{children}</div>
    </section>
  );
}
