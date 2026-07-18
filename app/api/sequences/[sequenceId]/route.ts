import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/requireUser";
import { handleApiErrors } from "@/lib/api";
import { archiveSequence, getSequence, updateSequence } from "@/lib/repositories/sequences";
import { SequenceInputSchema } from "@/schemas/sequence";

type Params = { params: Promise<{ sequenceId: string }> };

export const GET = handleApiErrors(async (_req: NextRequest, { params }: Params) => {
  const ctx = await requireUser();
  const { sequenceId } = await params;
  const sequence = await getSequence(ctx, sequenceId);
  if (!sequence) return NextResponse.json({ error: "Sequence not found." }, { status: 404 });
  return NextResponse.json({ sequence });
});

export const PUT = handleApiErrors(async (req: NextRequest, { params }: Params) => {
  const ctx = await requireUser();
  const { sequenceId } = await params;
  const input = SequenceInputSchema.parse(await req.json());
  const sequence = await updateSequence(ctx, sequenceId, input);
  if (!sequence) return NextResponse.json({ error: "Sequence not found." }, { status: 404 });
  return NextResponse.json({ sequence });
});

export const DELETE = handleApiErrors(async (_req: NextRequest, { params }: Params) => {
  const ctx = await requireUser();
  const { sequenceId } = await params;
  await archiveSequence(ctx, sequenceId);
  return NextResponse.json({ ok: true });
});
