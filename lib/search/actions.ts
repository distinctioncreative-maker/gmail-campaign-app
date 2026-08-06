import type { PaletteResult } from "./rank";

/**
 * Everything the palette can offer that is not a piece of the customer's data.
 *
 * Two kinds, kept apart on purpose. An **action** creates something or changes
 * state and is what someone reaches for the palette to do. A **page** is
 * navigation that the sidebar already provides, included because typing four
 * letters beats moving a mouse, but ranked below actions for that reason.
 *
 * `keywords` exist because people search for the word in their head, not the
 * label we chose. Someone wanting to add leads types "import", "upload", or
 * "csv" long before they type "Leads", and a palette that only matches its own
 * vocabulary is a palette that only works for the person who named things.
 */

export interface PaletteAction {
  id: string;
  label: string;
  href: string;
  /** Alternative words that should find it. */
  keywords: string;
  /** Gated so the palette never offers a page the person cannot open. */
  requires?: "admin" | "teams";
}

export const PALETTE_ACTIONS: readonly PaletteAction[] = [
  {
    id: "new-campaign",
    label: "New campaign",
    href: "/campaigns/new",
    keywords: "create start send launch outreach blast",
  },
  {
    id: "new-template",
    label: "New template",
    href: "/templates/new",
    keywords: "create write compose email copy draft ai",
  },
  {
    id: "new-sequence",
    label: "New follow-up sequence",
    href: "/sequences/new",
    keywords: "create followup follow up drip steps cadence",
  },
  {
    id: "import-leads",
    label: "Import leads",
    href: "/leads",
    keywords: "add upload csv paste salesforce contacts list prospects",
  },
  {
    id: "connect-gmail",
    label: "Connect Gmail",
    href: "/settings",
    keywords: "google mailbox inbox oauth reconnect authorize",
  },
  {
    id: "export-data",
    label: "Export my data",
    href: "/settings",
    keywords: "download csv backup leave portability gdpr",
  },
  {
    id: "contact-support",
    label: "Contact support",
    href: "/help/contact",
    keywords: "help human problem broken stuck bug question",
  },
];

export const PALETTE_PAGES: readonly PaletteAction[] = [
  { id: "page-home", label: "Home", href: "/home", keywords: "dashboard overview start" },
  { id: "page-campaigns", label: "Campaigns", href: "/campaigns", keywords: "sends running active" },
  { id: "page-replies", label: "Replies", href: "/replies", keywords: "inbox responses answers hot" },
  { id: "page-leads", label: "Leads", href: "/leads", keywords: "contacts prospects people directory" },
  { id: "page-templates", label: "Templates", href: "/templates", keywords: "emails copy subject" },
  { id: "page-sequences", label: "Follow-ups", href: "/sequences", keywords: "sequences drip steps" },
  {
    id: "page-suppressions",
    label: "Do Not Email",
    href: "/suppressions",
    keywords: "suppressions unsubscribes opt out blocked bounces",
  },
  { id: "page-reports", label: "Reports", href: "/reports", keywords: "analytics stats revenue funnel" },
  {
    id: "page-deliverability",
    label: "Deliverability",
    href: "/deliverability",
    keywords: "spf dkim dmarc spam reputation postmaster authentication",
  },
  { id: "page-settings", label: "Settings", href: "/settings", keywords: "profile signature account preferences" },
  { id: "page-help", label: "Help and Test Center", href: "/help", keywords: "guides faq troubleshooting tour" },
  { id: "page-team", label: "Team", href: "/team", keywords: "members reps colleagues roles", requires: "teams" },
  {
    id: "page-admin",
    label: "Administration",
    href: "/admin",
    keywords: "admin console billing sending mode live",
    requires: "admin",
  },
  {
    id: "page-health",
    label: "System Health",
    href: "/system-health",
    keywords: "status sweeps queue diagnostics",
    requires: "admin",
  },
];

export interface ActionContext {
  isAdmin: boolean;
  hasTeams: boolean;
}

function permitted(action: PaletteAction, ctx: ActionContext): boolean {
  if (action.requires === "admin") return ctx.isAdmin;
  if (action.requires === "teams") return ctx.hasTeams;
  return true;
}

/**
 * Actions and pages as rankable results.
 *
 * Keywords go into `subtext` so they are matched but never displayed: showing
 * "create start send launch outreach blast" under "New campaign" would be
 * noise, and the point of the keywords is that the person never has to know
 * they exist.
 */
export function actionResults(ctx: ActionContext): PaletteResult[] {
  return [
    ...PALETTE_ACTIONS.filter((a) => permitted(a, ctx)).map((a) => ({
      id: a.id,
      group: "Actions" as const,
      text: a.label,
      subtext: a.keywords,
      href: a.href,
    })),
    ...PALETTE_PAGES.filter((a) => permitted(a, ctx)).map((a) => ({
      id: a.id,
      group: "Pages" as const,
      text: a.label,
      subtext: a.keywords,
      href: a.href,
    })),
  ];
}

/** What the palette shows before anyone types: the things worth doing, not everything. */
export function defaultResults(ctx: ActionContext): PaletteResult[] {
  return actionResults(ctx)
    .filter((r) => r.group === "Actions")
    .slice(0, 6);
}
