import "server-only";
import type { AuthContext } from "@/lib/auth/requireUser";
import { listCampaigns } from "@/lib/repositories/campaigns";
import { listTemplates } from "@/lib/repositories/templates";
import { listSequences } from "@/lib/repositories/sequences";
import { firestore } from "@/lib/firebase/admin";
import { ContactSchema } from "@/schemas/contact";
import { actionResults } from "./actions";
import { normalizeQuery, rankItems, type PaletteResult } from "./rank";

/**
 * Search the signed-in user's workspace for the command palette.
 *
 * Two different strategies, because the collections are two different sizes
 * and pretending otherwise would break one of them.
 *
 * **Campaigns, templates, sequences** are bounded: a heavy user has dozens,
 * not thousands. They are listed and ranked in memory, which gives real
 * substring and multi-term matching, and a Firestore prefix query could not.
 *
 * **Leads** are not bounded: a workspace can hold tens of thousands, and no
 * amount of clever ranking makes loading them all acceptable. Those use
 * Firestore prefix queries on the fields that are already normalized for
 * exactly this purpose. That means lead search matches the *start* of an email
 * or company name and not the middle, which is a real limitation and is stated
 * in the UI rather than left for someone to discover. Substring search over a
 * collection that size needs a search index, and quietly loading five thousand
 * documents per keystroke to fake one would be worse than the honest limit.
 */

const PER_GROUP = 5;
const LEAD_LIMIT = 6;

async function leadResults(ctx: AuthContext, query: string): Promise<PaletteResult[]> {
  const contacts = firestore().collection("users").doc(ctx.userId).collection("contacts");
  // The standard Firestore prefix range. U+F8FF sorts above any character
  // that appears in a normalized email or company name, so
  // startAt(q)..endAt(q + U+F8FF) is every string beginning with q. Ending at
  // q alone would return only an exact match, which is a prefix search that
  // can never find anything.
  const end = `${query}\uf8ff`;

  // Two prefix queries, because someone looking for a lead types either the
  // person's address or the company, and which one is a coin flip.
  const [byEmail, byCompany] = await Promise.all([
    contacts.orderBy("normalizedEmail").startAt(query).endAt(end).limit(LEAD_LIMIT).get(),
    contacts
      .orderBy("normalizedBusinessName")
      .startAt(query)
      .endAt(end)
      .limit(LEAD_LIMIT)
      .get()
      // A workspace whose contacts predate the normalized field, or a missing
      // index, must not take the whole palette down with it.
      .catch(() => null),
  ]);

  const seen = new Set<string>();
  const results: PaletteResult[] = [];
  for (const doc of [...byEmail.docs, ...(byCompany?.docs ?? [])]) {
    if (seen.has(doc.id)) continue;
    seen.add(doc.id);
    const c = ContactSchema.parse(doc.data());
    results.push({
      id: `lead-${c.contactId}`,
      group: "Leads",
      text: c.fullName || c.businessName || c.email,
      subtext: c.email,
      href: `/leads?contactId=${encodeURIComponent(c.contactId)}`,
      meta: c.emailOptOut ? "Opted out" : undefined,
      updatedAt: c.lastSeenAt,
    });
  }
  return results.slice(0, PER_GROUP);
}

export interface WorkspaceSearch {
  results: PaletteResult[];
  /** True when lead matching was prefix-only, so the UI can say so. */
  leadsPrefixOnly: boolean;
}

export async function searchWorkspace(
  ctx: AuthContext,
  rawQuery: string,
  options: { isAdmin: boolean; hasTeams: boolean }
): Promise<WorkspaceSearch> {
  const query = normalizeQuery(rawQuery);
  if (!query) return { results: [], leadsPrefixOnly: false };

  const [campaigns, templates, sequences, leads] = await Promise.all([
    listCampaigns(ctx, 200).catch(() => []),
    listTemplates(ctx).catch(() => []),
    listSequences(ctx).catch(() => []),
    leadResults(ctx, query).catch(() => []),
  ]);

  const campaignResults: PaletteResult[] = campaigns
    .filter((c) => c.deletedAt === null)
    .map((c) => ({
      id: `campaign-${c.campaignId}`,
      group: "Campaigns" as const,
      text: c.name,
      subtext: c.description,
      href: `/campaigns/${c.campaignId}`,
      meta: c.status,
      updatedAt: c.updatedAt,
    }));

  const templateResults: PaletteResult[] = templates.map((t) => ({
    id: `template-${t.templateId}`,
    group: "Templates" as const,
    // The subject line, not the body: it is short, it is what the recipient
    // sees, and it is how people remember which template is which.
    text: t.name,
    subtext: t.subjectTemplate,
    href: `/templates/${t.templateId}`,
    updatedAt: t.updatedAt,
  }));

  const sequenceResults: PaletteResult[] = sequences.map((s) => ({
    id: `sequence-${s.sequenceId}`,
    group: "Follow-ups" as const,
    text: s.name,
    subtext: s.description,
    href: `/sequences/${s.sequenceId}`,
    meta: `${s.steps.length} step${s.steps.length === 1 ? "" : "s"}`,
    updatedAt: s.updatedAt,
  }));

  // Actions and pages are capped separately for the same reason as everything
  // else: "Do Not Email", "Deliverability", and "Settings" all match "e", and
  // a shared cap would let pages push every action off the list.
  const chrome = actionResults(options);
  const results = [
    ...rankItems(
      chrome.filter((r) => r.group === "Actions"),
      query,
      PER_GROUP
    ),
    ...rankItems(campaignResults, query, PER_GROUP),
    ...leads,
    ...rankItems(templateResults, query, PER_GROUP),
    ...rankItems(sequenceResults, query, PER_GROUP),
    ...rankItems(
      chrome.filter((r) => r.group === "Pages"),
      query,
      PER_GROUP
    ),
  ];

  return { results, leadsPrefixOnly: leads.length > 0 };
}
