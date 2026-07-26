import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import crypto from "node:crypto";
import { handleApiErrors } from "@/lib/api";
import { firestore } from "@/lib/firebase/admin";

// Public, unauthenticated: the coming-soon landing page captures early-access
// signups here. No account is created — just an email on a list.
const BodySchema = z.object({
  email: z.string().trim().email().max(200),
  source: z.string().trim().max(60).optional(),
});

function normalize(email: string): string {
  return email.trim().toLowerCase();
}

export const POST = handleApiErrors(async (req: NextRequest) => {
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
