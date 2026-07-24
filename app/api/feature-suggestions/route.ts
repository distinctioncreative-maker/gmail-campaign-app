import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import crypto from "node:crypto";
import { requireUser } from "@/lib/auth/requireUser";
import { handleApiErrors } from "@/lib/api";
import { firestore } from "@/lib/firebase/admin";

interface Suggestion {
  id: string;
  text: string;
  authorName: string;
  authorUserId: string;
  createdAt: number;
}

function ref(organizationId: string) {
  return firestore().collection("organizations").doc(organizationId).collection("featureSuggestions");
}

/** List the team's feature suggestions, newest first. */
export const GET = handleApiErrors(async () => {
  const ctx = await requireUser();
  const snap = await ref(ctx.organizationId).orderBy("createdAt", "desc").limit(100).get();
  const suggestions = snap.docs.map((d) => d.data() as Suggestion);
  return NextResponse.json({ suggestions });
});

const PostSchema = z.object({ text: z.string().trim().min(3).max(600) });

/** Submit a feature suggestion for the app. */
export const POST = handleApiErrors(async (req: NextRequest) => {
  const ctx = await requireUser();
  const { text } = PostSchema.parse(await req.json());
  const suggestion: Suggestion = {
    id: crypto.randomUUID(),
    text,
    authorName: ctx.user.displayName || ctx.email,
    authorUserId: ctx.userId,
    createdAt: Date.now(),
  };
  await ref(ctx.organizationId).doc(suggestion.id).set(suggestion);
  return NextResponse.json({ suggestion, message: "Thanks! Your suggestion was sent." });
});
