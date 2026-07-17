import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createSessionCookie, SESSION_COOKIE } from "@/lib/auth/session";
import { handleApiErrors } from "@/lib/api";
import { requireUser } from "@/lib/auth/requireUser";

const BodySchema = z.object({ idToken: z.string().min(10) });

/** Exchange a Firebase ID token for an HttpOnly session cookie, then
 * provision user + org membership. */
export const POST = handleApiErrors(async (req: NextRequest) => {
  const { idToken } = BodySchema.parse(await req.json());
  const { cookieValue, maxAgeSeconds } = await createSessionCookie(idToken);

  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, cookieValue, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: maxAgeSeconds,
  });
  return res;
});

/** Current signed-in user info (also provisions on first call). */
export const GET = handleApiErrors(async () => {
  const ctx = await requireUser();
  return NextResponse.json({
    userId: ctx.userId,
    email: ctx.email,
    displayName: ctx.user.displayName,
    role: ctx.role,
    onboardingStatus: ctx.user.onboardingStatus,
  });
});

/** Sign out. */
export const DELETE = handleApiErrors(async () => {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
  return res;
});
