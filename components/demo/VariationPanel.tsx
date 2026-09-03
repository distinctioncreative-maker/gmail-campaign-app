import {
  analyzeSpintax,
  describeVariants,
  expandSpintax,
} from "@/lib/personalization/spintax";

/**
 * What the tour was missing.
 *
 * A signed-out visitor could walk the whole demo without learning that Cadence
 * varies the wording per recipient, which is one of the two or three things that
 * actually distinguish it. The landing page now demonstrates that; this is the
 * same fact inside the product tour, where someone evaluating the app is looking
 * at real screens rather than marketing.
 *
 * Like the marketing demo, this calls the shipped `expandSpintax` rather than
 * holding pre-written strings, so what a visitor reads is genuine output from the
 * parser the send worker uses. Server-rendered, because it is deterministic: the
 * same seeds always produce the same bodies, which is the property that lets a
 * retry resend the identical email.
 *
 * Styled with the dashboard's own classes rather than the marketing module. The
 * tour's whole job is to look like the product.
 */

const TEMPLATE =
  "{Hi|Hello} {{first_name}}, {quick question|one question for you}. " +
  "{I noticed|I saw} {{company}} {runs its own fleet|handles delivery in house}, " +
  "and most operators that size {are quietly overpaying on|lose margin to} equipment finance. " +
  "{Worth a short call|Open to a quick chat} {this week|in the next few days}?";

const RECIPIENTS = [
  { name: "Dana Reed", company: "Reed Haulage" },
  { name: "Marcus Oyelaran", company: "Oyelaran Plant Hire" },
  { name: "Priya Raman", company: "Raman Fabrication" },
] as const;

export function VariationPanel() {
  const analysis = analyzeSpintax(TEMPLATE);

  return (
    <section className="card p-6 sm:p-7 mt-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2>What each recipient actually receives</h2>
          <p className="mt-1 max-w-2xl text-sm text-muted">
            One message, written once, with the phrases that could go either way marked as choices.
            Cadence picks per recipient, so nobody gets the email their neighbour got. Identical text
            sent to a hundred people is the clearest signal a spam filter has.
          </p>
        </div>
        <span className="badge border border-border text-xs text-muted">
          {describeVariants(analysis)}
        </span>
      </div>

      <ul className="mt-4 grid gap-3 sm:grid-cols-3">
        {RECIPIENTS.map((recipient) => {
          const first = recipient.name.split(" ")[0] ?? recipient.name;
          const body = expandSpintax(TEMPLATE, recipient.name)
            .replace(/\{\{first_name\}\}/g, first)
            .replace(/\{\{company\}\}/g, recipient.company);
          return (
            <li key={recipient.name} className="rounded-lg border border-border p-4">
              <p className="text-sm font-medium">{recipient.name}</p>
              <p className="text-xs text-muted">{recipient.company}</p>
              <p className="mt-2 text-sm leading-relaxed">{body}</p>
            </li>
          );
        })}
      </ul>

      <p className="mt-3 text-xs text-muted">
        The choice is seeded from the recipient, not random, so a retry after a delivery hiccup sends
        the identical email rather than a second, differently worded one.
      </p>
    </section>
  );
}
