import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/requireUser";
import { handleApiErrors } from "@/lib/api";
import { listNotifications, markAllRead } from "@/lib/repositories/notifications";

export const GET = handleApiErrors(async () => {
  const ctx = await requireUser();
  return NextResponse.json({ notifications: await listNotifications(ctx) });
});

/** Mark all notifications read. */
export const POST = handleApiErrors(async () => {
  const ctx = await requireUser();
  await markAllRead(ctx);
  return NextResponse.json({ ok: true });
});
