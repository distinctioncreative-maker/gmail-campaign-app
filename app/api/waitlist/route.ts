import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import crypto from "node:crypto";
import { handleApiErrors } from "@/lib/api";
import { firestore } from "@/lib/firebase/admin";
import { enforceRateLimit, requestRateLimitKey } from "@/lib/util/rateLimit";

// Public, unauthenticated: the coming-soon landing page captures early-access
// signups here. No account is created — just an email on a list.
const BodySchema = z.object({
  email: z.string().trim().email().max(200),
  source: z.string().trim().max(60).optional(),
});

// At most this many signups per client per hour — enough for honest use, low
// enough to blunt scripted flooding of the collection (and its Firestore cost).
const RATE_LIMIT = 5;
const RATE_WINDOW_MS = 60 * 60 * 1000;

function normalize(email: string): string {
  return email.trim().toLowerCase();
}

/** Hashed client IP, so we throttle per source without storing raw IPs. */
export const POST = handleApiErrors(async (req: NextRequest) => {
  const withinLimit = await enforceRateLimit(
    "waitlist",
    requestRateLimitKey(req, "waitlist"),
    RATE_LIMIT,
    RATE_WINDOW_MS,
    { failClosed: true }
  );
  if (!withinLimit) {
    return NextResponse.json(
      { error: "You've already joined — we'll be in touch. Try again later if this is a mistake." },
      { status: 429 }
    );
  }

  const { email, source } = BodySchema.parse(await req.json());
  const normalized = normalize(email);
  // Doc id = hashed email so re-submitting the same address is an idempotent
  // upsert (no duplicates) and we don't use the raw email as a key.
  const id = crypto.createHash("sha256").update(normalized).digest("hex").slice(0, 40);

  await firestore()
    .collection("waitlist")
    .doc(id)
    .set(
      {
        email: normalized,
        source: source ?? "landing",
        createdAt: Date.now(),
        userAgent: req.headers.get("user-agent")?.slice(0, 300) ?? "",
      },
      { merge: true }
    );

  return NextResponse.json({ ok: true, message: "You're on the list." });
});
