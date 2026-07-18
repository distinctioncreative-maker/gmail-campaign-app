import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/requireUser";
import { handleApiErrors } from "@/lib/api";
import { createSequence, listSequences } from "@/lib/repositories/sequences";
import { SequenceInputSchema } from "@/schemas/sequence";

export const GET = handleApiErrors(async () => {
  const ctx = await requireUser();
  return NextResponse.json({ sequences: await listSequences(ctx) });
});

export const POST = handleApiErrors(async (req: NextRequest) => {
  const ctx = await requireUser();
  const input = SequenceInputSchema.parse(await req.json());
  const sequence = await createSequence(ctx, input);
  return NextResponse.json({ sequence });
});
