import { redirect } from "next/navigation";
import { verifySession } from "@/lib/auth/session";
import { Landing } from "@/components/marketing/Landing";

/** Public front door. Signed-in users go straight to the app; everyone else
 * sees the coming-soon landing page. */
export default async function RootPage() {
  const session = await verifySession();
  if (session) redirect("/home");
  return <Landing />;
}
