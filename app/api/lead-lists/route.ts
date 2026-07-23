import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth/requireUser";
import { handleApiErrors } from "@/lib/api";
import { listLeadLists, createLeadList } from "@/lib/repositories/leadLists";

export const GET = handleApiErrors(async () => {
  const ctx = await requireUser();
  return NextResponse.json({ lists: await listLeadLists(ctx) });
});

const CreateSchema = z.object({ name: z.string().trim().min(1).max(80) });

/** Create a new lead list (e.g. "Alpine offers — all time"). */
export const POST = handleApiErrors(async (req: NextRequest) => {
  const ctx = await requireUser();
  const { name } = CreateSchema.parse(await req.json());
  const list = await createLeadList(ctx, name);
  return NextResponse.json({ list, message: `List "${list.name}" created.` });
});
