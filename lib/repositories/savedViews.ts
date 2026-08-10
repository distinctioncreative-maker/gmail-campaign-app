import "server-only";
import crypto from "node:crypto";
import { firestore } from "@/lib/firebase/admin";
import {
  SavedViewSchema,
  type SavedView,
  type ViewSurface,
} from "@/schemas/savedView";
import { MAX_VIEWS_PER_SURFACE, nameKey, normalizeName } from "@/lib/views/savedViews";

/**
 * Saved views live under the user, not the organization.
 *
 * A view is one person's way of working through their own list. Sharing them
 * across a workspace sounds generous and is not: two reps with different
 * territories would fight over a tab strip, and a manager's view of everything
 * is meaningless to someone scoped to their own leads.
 */

const viewsRef = (userId: string) =>
  firestore().collection("users").doc(userId).collection("savedViews");

/** Room for every surface plus a margin, so one surface filling up cannot hide
 * another surface's views behind the read limit. */
const VIEW_SURFACE_HEADROOM = 4;

export async function listSavedViews(
  userId: string,
  surface?: ViewSurface
): Promise<SavedView[]> {
  const snap = await viewsRef(userId).limit(MAX_VIEWS_PER_SURFACE * VIEW_SURFACE_HEADROOM).get();
  return snap.docs
    .map((doc) => SavedViewSchema.parse(doc.data()))
    .filter((view) => (surface ? view.surface === surface : true))
    .sort((a, b) => a.createdAt - b.createdAt);
}

export async function createSavedView(input: {
  ownerUserId: string;
  surface: ViewSurface;
  name: string;
  filters: Record<string, string>;
  sortKey: string;
  sortDir: "asc" | "desc";
}): Promise<{ view: SavedView } | { error: string }> {
  const name = normalizeName(input.name);
  if (name === "") return { error: "Give the view a name." };

  const existing = await listSavedViews(input.ownerUserId, input.surface);
  if (existing.length >= MAX_VIEWS_PER_SURFACE) {
    return {
      error: `You can keep ${MAX_VIEWS_PER_SURFACE} saved views here. Remove one you no longer use.`,
    };
  }
  // Replaced rather than rejected: saving over a view you already have is the
  // obvious way to update one, and an error there would send someone hunting for
  // a rename control that does not exist.
  const clash = existing.find((view) => nameKey(view.name) === nameKey(name));

  const now = Date.now();
  const view: SavedView = SavedViewSchema.parse({
    viewId: clash?.viewId ?? crypto.randomUUID(),
    ownerUserId: input.ownerUserId,
    surface: input.surface,
    name,
    filters: input.filters,
    sortKey: input.sortKey,
    sortDir: input.sortDir,
    createdAt: clash?.createdAt ?? now,
    updatedAt: now,
  });
  await viewsRef(input.ownerUserId).doc(view.viewId).set(view);
  return { view };
}

export async function deleteSavedView(userId: string, viewId: string): Promise<boolean> {
  const ref = viewsRef(userId).doc(viewId);
  const snap = await ref.get();
  if (!snap.exists) return false;
  await ref.delete();
  return true;
}
