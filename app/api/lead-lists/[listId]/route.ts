import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth/requireUser";
import { handleApiErrors } from "@/lib/api";
import { getLeadList, renameLeadList, deleteLeadList } from "@/lib/repositories/leadLists";

type Params = { params: Promise<{ listId: string }> };

const PatchSchema = z.object({ name: z.string().trim().min(1).max(80) });

/** Rename a lead list. */
export const PATCH = handleApiErrors(async (req: NextRequest, { params }: Params) => {
  const ctx = await requireUser();
  const { listId } = await params;
  if (!(await getLeadList(ctx, listId)))
    return NextResponse.json({ error: "List not found." }, { status: 404 });
  const { name } = PatchSchema.parse(await req.json());
  await renameLeadList(ctx, listId, name);
  return NextResponse.json({ ok: true, message: "List renamed." });
});

/** Delete a lead list (leads themselves are kept; they just leave the list). */
export const DELETE = handleApiErrors(async (_req: NextRequest, { params }: Params) => {
  const ctx = await requireUser();
  const { listId } = await params;
  if (!(await getLeadList(ctx, listId)))
    return NextResponse.json({ error: "List not found." }, { status: 404 });
  await deleteLeadList(ctx, listId);
  return NextResponse.json({ ok: true, message: "List deleted. Your leads are unaffected." });
});
