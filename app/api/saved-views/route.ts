import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth/requireUser";
import { handleApiErrors } from "@/lib/api";
import { ViewSurfaceSchema } from "@/schemas/savedView";
import {
  createSavedView,
  deleteSavedView,
  listSavedViews,
} from "@/lib/repositories/savedViews";
import { normalizeFilters } from "@/lib/views/savedViews";

/** A person's own saved views. Not admin-gated and not shared: see
 * lib/repositories/savedViews.ts for why they are per user. */
export const GET = handleApiErrors(async (req: NextRequest) => {
  const ctx = await requireUser();
  const surface = ViewSurfaceSchema.safeParse(req.nextUrl.searchParams.get("surface"));
  const views = await listSavedViews(ctx.userId, surface.success ? surface.data : undefined);
  return NextResponse.json({ views });
});

const CreateSchema = z.object({
  surface: ViewSurfaceSchema,
  name: z.string().min(1).max(60),
  filters: z.record(z.string().max(40), z.string().max(200)).default({}),
  sortKey: z.string().max(40).default(""),
  sortDir: z.enum(["asc", "desc"]).default("asc"),
});

export const POST = handleApiErrors(async (req: NextRequest) => {
  const ctx = await requireUser();
  const input = CreateSchema.parse(await req.json());

  const result = await createSavedView({
    ownerUserId: ctx.userId,
    surface: input.surface,
    name: input.name,
    // Normalized here rather than on the client, so a view saved by an older tab
    // cannot store a set of empty controls that then compares unequal to the
    // identical state produced today.
    filters: normalizeFilters(input.filters),
    sortKey: input.sortKey,
    sortDir: input.sortDir,
  });
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json({ view: result.view });
});

const DeleteSchema = z.object({ viewId: z.string().min(1) });

export const DELETE = handleApiErrors(async (req: NextRequest) => {
  const ctx = await requireUser();
  const { viewId } = DeleteSchema.parse(await req.json());
  // Scoped to the caller's own subcollection, so an id from another account
  // finds nothing.
  const removed = await deleteSavedView(ctx.userId, viewId);
  if (!removed) {
    return NextResponse.json({ error: "That view does not exist." }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
});
