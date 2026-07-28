import "server-only";
import { firestore } from "@/lib/firebase/admin";

export interface WaitlistEntry {
  email: string;
  source: string;
  createdAt: number;
}

/**
 * List early-access waitlist signups, newest first. The collection is written
 * by the public /api/waitlist route (one doc per hashed email). Read access is
 * admin-only: the caller enforces the role.
 */
export async function listWaitlist(limit = 1000): Promise<WaitlistEntry[]> {
  const snap = await firestore()
    .collection("waitlist")
    .orderBy("createdAt", "desc")
    .limit(limit)
    .get();
  return snap.docs.map((d) => {
    const data = d.data();
    return {
      email: typeof data.email === "string" ? data.email : "",
      source: typeof data.source === "string" ? data.source : "",
      createdAt: typeof data.createdAt === "number" ? data.createdAt : 0,
    };
  });
}
