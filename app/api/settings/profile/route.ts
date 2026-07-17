import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/requireUser";
import { handleApiErrors } from "@/lib/api";
import { getSenderProfile, saveSenderProfile } from "@/lib/repositories/userSettings";
import { SenderProfileSchema } from "@/schemas/userSettings";

export const GET = handleApiErrors(async () => {
  const ctx = await requireUser();
  return NextResponse.json({ profile: await getSenderProfile(ctx) });
});

export const PUT = handleApiErrors(async (req: NextRequest) => {
  const ctx = await requireUser();
  const partial = SenderProfileSchema.partial().parse(await req.json());
  const profile = await saveSenderProfile(ctx, partial);
  return NextResponse.json({ profile });
});
