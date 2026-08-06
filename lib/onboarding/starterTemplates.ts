import type { WorkspaceProfile } from "@/schemas/user";
import type { TemplateInput } from "@/schemas/template";

/**
 * Starter templates, seeded once per user.
 *
 * A new account was completely empty: no template, no sample list, nothing.
 * Fourteen steps from sign-in to a sent email, and the first of them was the
 * blank page problem. That is the most likely reason an activated signup goes
 * quiet, and it is the cheapest of the activation gaps to close.
 *
 * These are not filler. Each one:
 *
 * - **carries `{{unsubscribe_text}}` and `{{physical_address}}`**, which
 *   campaign launch requires. A starter that failed the product's own launch
 *   check would teach a new user that the product is broken.
 * - **uses spintax**, so the first template anyone opens demonstrates the
 *   feature and explains itself, rather than variation being a thing they have
 *   to read the FAQ to discover.
 * - **avoids the trigger words the spam scorer flags**, so opening a starter
 *   and clicking the spam tab shows an A. Shipping a starter that scores a C
 *   would be an odd first impression.
 * - **reads like a person wrote it**: short, specific, one question, no
 *   pitch-deck adjectives. The templates are the clearest statement the
 *   product makes about what good cold email looks like.
 */

type UseCase = WorkspaceProfile["primaryUseCase"];

interface StarterTemplate extends TemplateInput {
  /** Which workflows this is offered for. Empty means everyone. */
  useCases?: readonly UseCase[];
}

/** Every starter closes the same way, and the footer is what launch checks. */
function withFooter(paragraphs: readonly string[]): string {
  return [
    ...paragraphs.map((p) => `<p>${p}</p>`),
    "<p>{{signature}}</p>",
    '<p style="font-size:12px;color:#6b7280">{{unsubscribe_text}}<br />{{physical_address}}</p>',
  ].join("\n");
}

const UNIVERSAL: StarterTemplate[] = [
  {
    name: "Short intro (start here)",
    description:
      "The shortest useful cold email: one line of context, one question, no pitch. Edit the middle paragraph and it is ready.",
    type: "STARTER",
    category: "Starter",
    subjectTemplate: "{Quick question|One question} about {{business_name}}",
    htmlTemplate: withFooter([
      "{Hi|Hello|Hey} {{first_name}},",
      "{I came across|I noticed} {{business_name}} and wanted to reach out {directly|myself} rather than send you something generic. Replace this paragraph with the one specific reason you are writing: what you noticed, and why it made you think of them.",
      "{Worth a short conversation|Open to a quick chat|Worth ten minutes} to see whether this is relevant? {Happy to be told no|A no is a perfectly good answer}.",
    ]),
  },
  {
    name: "Following up once",
    description:
      "A follow-up that adds something instead of asking again. Use this as step two of a sequence.",
    type: "STARTER",
    category: "Starter",
    subjectTemplate: "{Following up|One more note|Circling back} on my note",
    htmlTemplate: withFooter([
      "{Hi|Hello} {{first_name}},",
      "{Following up on|Coming back to} my note from last week. {Adding one thing that might be more useful|Here is the one detail I should have led with}: replace this with a concrete example, a number, or a customer who looked like them.",
      "{If the timing is wrong, say so and I will stop there|If this is not a priority right now, just tell me and I will leave it}.",
    ]),
  },
];

const BY_USE_CASE: StarterTemplate[] = [
  {
    name: "Sales: problem-first opener",
    useCases: ["SALES", "AGENCY", "OTHER"],
    description: "Leads with the problem you solve rather than the product that solves it.",
    type: "STARTER",
    category: "Starter",
    subjectTemplate: "{{business_name}} and {the thing you fix|the problem you solve}",
    htmlTemplate: withFooter([
      "{Hi|Hello} {{first_name}},",
      "{Most|A lot of} teams like {{business_name}} tell me the same thing: replace this with the problem you actually hear, in their words rather than yours.",
      "{We|I} help with exactly that. Replace this with one sentence on how, and one piece of evidence.",
      "{Worth a look|Worth a short call}? {Reply with a no and I will leave you alone|If not, a one-word reply is fine}.",
    ]),
  },
  {
    name: "Recruiting: candidate outreach",
    useCases: ["RECRUITING"],
    description: "Reaching a candidate who is not looking, without pretending they are.",
    type: "STARTER",
    category: "Starter",
    subjectTemplate: "{A role that made me think of you|Worth a look, even if you are not looking}",
    htmlTemplate: withFooter([
      "{Hi|Hello} {{first_name}},",
      "{I am guessing|Chances are} you are not looking, so I will be brief. Replace this with what specifically about their work made you write to them, not a job description.",
      "{The role|What I am hiring for}: replace this with the team, the problem, and the one thing that makes it unusual.",
      "{Happy to send details|Worth a look}? {A no is completely fine|If it is not for you, no hard feelings}.",
    ]),
  },
  {
    name: "Fundraising: investor intro",
    useCases: ["FUNDRAISING"],
    description: "A cold investor note that leads with traction rather than vision.",
    type: "STARTER",
    category: "Starter",
    subjectTemplate: "{{business_name}}: {traction and a question|where we are and what is next}",
    htmlTemplate: withFooter([
      "{Hi|Hello} {{first_name}},",
      "Replace this with what you do, in one sentence a stranger would understand.",
      "{Where we are|The traction}: replace this with the two or three numbers that actually matter. Growth, retention, revenue. Not awards.",
      "{Worth a conversation|Open to a short call}? {Happy to send the deck first|I can send more detail if it is useful}. {If it is not a fit for your thesis, just say so and I will not follow up|If this is outside what you invest in, tell me and I will leave it there}.",
    ]),
  },
  {
    name: "Partnerships: mutual-fit note",
    useCases: ["PARTNERSHIPS", "CUSTOMER_SUCCESS"],
    description: "Proposes something specific instead of asking to explore synergies.",
    type: "STARTER",
    category: "Starter",
    subjectTemplate: "{{business_name}} and {us|{{company_name}}}: {one specific idea|a concrete idea}",
    htmlTemplate: withFooter([
      "{Hi|Hello} {{first_name}},",
      "{We work with|I work with} the same kind of {customer|audience} as {{business_name}}. Replace this with how you know that, briefly.",
      "{The idea|What I have in mind}: replace this with one concrete thing, not a request to explore opportunities. Name what each side does and what each side gets.",
      "{Worth a short call|Interested}? {If not, no problem at all|A no is fine and I will not chase}.",
    ]),
  },
];

/**
 * Which starters a new user gets.
 *
 * Two universal ones plus at most one matched to what they said they do in the
 * workspace step. Three is the number: enough that the page is not empty and
 * one of them is close to their job, few enough that nobody has to read a
 * library before writing their first email.
 */
export function startersFor(useCase: UseCase): TemplateInput[] {
  const matched = BY_USE_CASE.find((t) => t.useCases?.includes(useCase));
  const chosen = [...UNIVERSAL, ...(matched ? [matched] : [])];
  return chosen.map(({ useCases: _omit, ...template }) => template);
}

export const STARTER_COUNT = 3;
