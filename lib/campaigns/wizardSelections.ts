import { badgeFor } from "@/components/imports/leadBadges";

/**
 * Pure logic pulled out of the campaign wizard so it's unit-testable
 * without mounting the component. Both functions fix the same class of bug:
 * counting/submitting the user's entire contact universe instead of just
 * the people relevant to this campaign (see lib/campaigns/launch.ts).
 */

export interface WizardSelectionInput {
  contactId: string;
}

export interface LaunchSelection {
  contactId: string;
  included: true;
  overrideReason: null;
}

/**
 * Only the contacts the user actually selected. Submitting every loaded
 * contact with included:false for the rest used to create a real Recipient
 * row (and a bogus "excluded" count) for every person who was simply never
 * selected, not excluded for any reason.
 */
export function buildLaunchSelections(
  contacts: WizardSelectionInput[],
  selected: Set<string>
): LaunchSelection[] {
  return contacts
    .filter((c) => selected.has(c.contactId))
    .map((c) => ({ contactId: c.contactId, included: true, overrideReason: null }));
}

const EXCLUSION_CLASSES = ["EMAIL_OPT_OUT", "UNSUBSCRIBED", "BOUNCED", "SUPPRESSED", "INVALID"];
const READY_CLASSES = ["NEW", "EXISTING_NOT_CONTACTED"];
const USED_CLASSES = ["CONTACTED_BEFORE", "REPLIED_BEFORE"];

export interface ClassifiedContact {
  classification: string;
  listIds: string[];
}

export interface ListScopedCounts {
  total: number;
  ready: number;
  usedBefore: number;
  excluded: number;
  excludedByReason: Array<{ label: string; count: number }>;
}

/**
 * Contact counts scoped to the chosen list (or every contact, if no list is
 * picked), not the user's entire contact universe, which used to make
 * "excluded" reflect suppressions/bounces across every contact they've ever
 * imported instead of just the people relevant to this campaign.
 */
export function computeListScopedCounts(
  contacts: ClassifiedContact[],
  listFilter: string
): ListScopedCounts {
  const list = listFilter ? contacts.filter((c) => c.listIds.includes(listFilter)) : contacts;
  const by = (classes: string[]) => list.filter((c) => classes.includes(c.classification)).length;
  const excludedByReason = EXCLUSION_CLASSES.map((cls) => ({
    label: badgeFor(cls).label,
    count: list.filter((c) => c.classification === cls).length,
  })).filter((r) => r.count > 0);
  return {
    total: list.length,
    ready: by(READY_CLASSES),
    usedBefore: by(USED_CLASSES),
    excluded: by(EXCLUSION_CLASSES),
    excludedByReason,
  };
}
