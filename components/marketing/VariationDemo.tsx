"use client";

import { useMemo, useState } from "react";
import {
  analyzeSpintax,
  describeVariants,
  expandSpintax,
} from "@/lib/personalization/spintax";
import styles from "./landing.module.css";

/**
 * The variation demo.
 *
 * **It runs the shipped parser.** `expandSpintax` and `analyzeSpintax` are the
 * same pure functions the send worker calls, imported directly rather than
 * reimplemented for the marketing page. That matters for two reasons: the variant
 * count and the sample bodies cannot drift from what the product actually does,
 * and the seeding is real, so the four examples below are exactly what those four
 * recipients would receive.
 *
 * A hand-written mock would have been easier and would have been a lie the moment
 * anyone changed the parser.
 *
 * The off state is the point of the whole thing. A template with no variation
 * sends one identical body to every recipient, which is the single clearest
 * signal a filter has that mail is bulk. Showing four identical cards next to four
 * different ones makes an abstract deliverability argument obvious in a second.
 */

/** The seed the worker uses is `${recipientId}:${sequenceStep}`. Using the
 * recipients' own names keeps the demo deterministic and honest about that. */
const RECIPIENTS = [
  { name: "Dana Reed", company: "Reed Haulage" },
  { name: "Marcus Oyelaran", company: "Oyelaran Plant Hire" },
  { name: "Priya Raman", company: "Raman Fabrication" },
  { name: "Tom Whitfield", company: "Whitfield Freight" },
] as const;

const TEMPLATE =
  "{Hi|Hello} {{first_name}}, {quick question|one question for you}. " +
  "{I noticed|I saw} {{company}} {runs its own fleet|handles delivery in house}, " +
  "and most operators that size {are quietly overpaying on|lose margin to} equipment finance. " +
  "{Worth a short call|Open to a quick chat} {this week|in the next few days}? " +
  "{If not, no problem at all|If the timing is wrong, just say so and I will leave it}.";

const FLAT =
  "Hi {{first_name}}, quick question. I noticed {{company}} runs its own fleet, " +
  "and most operators that size are quietly overpaying on equipment finance. " +
  "Worth a short call this week? If not, no problem at all.";

function fill(body: string, recipient: { name: string; company: string }): string {
  const first = recipient.name.split(" ")[0] ?? recipient.name;
  return body.replace(/\{\{first_name\}\}/g, first).replace(/\{\{company\}\}/g, recipient.company);
}

/** Render the template with its choice groups marked, so the syntax reads as a
 * feature rather than as stray punctuation. */
function TemplateSource() {
  const parts = TEMPLATE.split(/(\{[^{}]*\|[^{}]*\})/g);
  return (
    <p className={styles.variationTemplate}>
      {parts.map((part, i) =>
        /^\{[^{}]*\|[^{}]*\}$/.test(part) ? (
          <span key={i} className={styles.variationGroup}>
            {part.slice(1, -1).split("|").join(" / ")}
          </span>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </p>
  );
}

export function VariationDemo() {
  const [on, setOn] = useState(true);
  const analysis = useMemo(() => analyzeSpintax(TEMPLATE), []);

  const bodies = useMemo(
    () =>
      RECIPIENTS.map((recipient) => ({
        recipient,
        // The real function, with the real seeding.
        body: fill(on ? expandSpintax(TEMPLATE, recipient.name) : FLAT, recipient),
      })),
    [on]
  );

  const identical = new Set(bodies.map((row) => row.body)).size === 1;

  return (
    <div className={styles.composeMock}>
      <div className={styles.mockTop}>
        <span>One template, written once</span>
        <span className={styles.exampleBadge}>Live example</span>
      </div>

      <div className={styles.variationHead}>
        <div>
          <p className={styles.variationCount}>
            {on ? describeVariants(analysis) : "1 version, sent to everybody."}
          </p>
          <p className={styles.variationHint}>
            {on
              ? "Each recipient gets one of them, chosen consistently so a retry never sends a different email."
              : "Every recipient receives byte-identical text. This is the pattern spam filters are best at spotting."}
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={on}
          onClick={() => setOn((prev) => !prev)}
          className={styles.variationToggle}
        >
          {on ? "Variation on" : "Variation off"}
        </button>
      </div>

      {on ? (
        <div className={styles.variationSource}>
          <span className={styles.variationSourceLabel}>What you write</span>
          <TemplateSource />
        </div>
      ) : null}

      <div className={styles.variationGrid}>
        {bodies.map(({ recipient, body }) => (
          <article key={recipient.name} className={styles.variationCard}>
            <header>
              <strong>{recipient.name}</strong>
              <span>{recipient.company}</span>
            </header>
            <p>{body}</p>
          </article>
        ))}
      </div>

      <p className={styles.variationFoot} aria-live="polite">
        {identical
          ? "All four emails above are identical. Turn variation on."
          : `No two of these four are the same, and ${analysis.groups} choice points did it without you writing a second email.`}
      </p>
    </div>
  );
}
