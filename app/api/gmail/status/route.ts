import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/requireUser";
import { getConnectionPublic } from "@/lib/repositories/gmailConnections";
import { handleApiErrors } from "@/lib/api";

/** Connection health for the signed-in user (token never included). */
export const GET = handleApiErrors(async () => {
  const ctx = await requireUser();
  const connection = await getConnectionPublic(ctx.userId);
  return NextResponse.json({ connection });
});
