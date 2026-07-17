import { redirect } from "next/navigation";
import { verifySession } from "@/lib/auth/session";

export default async function RootPage() {
  const session = await verifySession();
  redirect(session ? "/home" : "/sign-in");
}
