import "server-only";
import { firestore } from "@/lib/firebase/admin";
import type { AuthContext } from "@/lib/auth/requireUser";
import { createTemplate, listTemplates } from "@/lib/repositories/templates";
import { getOrgSettings } from "@/lib/repositories/orgSettings";
import { startersFor } from "./starterTemplates";

/**
 * Seed a new user's starter templates.
 *
 * Two guards, and both matter for different reasons.
 *
 * `startersSeededAt` on the user means a customer who deletes the starters gets
 * to keep them deleted. Seeding purely on "the list is empty" would resurrect
 * them on the next visit, which turns a tidy-up into a fight with the product.
 *
 * The empty-list check means an existing account with real templates is never
 * touched. It also makes the field's absence safe: every user written before
 * this existed parses `startersSeededAt` as null, so without the second guard
 * they would all be handed three templates they did not ask for.
 *
 * Never throws. This runs inside onboarding requests that have their own job to
 * do, and failing to seed a starter template must not fail the step that was
 * actually asked for.
 */
export async function seedStarterTemplates(ctx: AuthContext): Promise<number> {
  try {
    if (ctx.user.startersSeededAt !== null) return 0;

    const existing = await listTemplates(ctx, { includeArchived: true });
    if (existing.length > 0) {
      // Nothing to seed, but record the decision so this never runs again.
      await markSeeded(ctx.userId);
      return 0;
    }

    const settings = await getOrgSettings(ctx.organizationId).catch(() => null);
    const useCase = settings?.workspaceProfile.primaryUseCase ?? "SALES";

    // Marked before writing, not after. A partial failure halfway through three
    // templates should leave the user with one or two rather than being retried
    // into duplicates on every subsequent request.
    await markSeeded(ctx.userId);
    let created = 0;
    for (const template of startersFor(useCase)) {
      await createTemplate(ctx, template);
      created += 1;
    }
    return created;
  } catch (err) {
    console.error("[onboarding] starter seeding failed", {
      userId: ctx.userId,
      err: String(err),
    });
    return 0;
  }
}

async function markSeeded(userId: string): Promise<void> {
  await firestore()
    .collection("users")
    .doc(userId)
    .update({ startersSeededAt: Date.now(), updatedAt: Date.now() });
}
