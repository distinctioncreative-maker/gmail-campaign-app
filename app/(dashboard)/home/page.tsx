import Link from "next/link";
import { requireUser } from "@/lib/auth/requireUser";
import { getConnectionPublic } from "@/lib/repositories/gmailConnections";

export default async function HomePage() {
  const ctx = await requireUser();
  const connection = await getConnectionPublic(ctx.userId);
  const gmailConnected = connection?.status === "CONNECTED";

  return (
    <div>
      <h1 className="text-2xl font-semibold">Welcome back, {ctx.user.displayName.split(" ")[0]}</h1>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="rounded-2xl bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">Gmail connection</p>
          <p className={`mt-1 text-lg font-medium ${gmailConnected ? "text-green-600" : "text-amber-600"}`}>
            {gmailConnected ? `Connected — ${connection?.connectedEmail}` : "Not connected"}
          </p>
          {!gmailConnected && (
            <Link href="/settings" className="mt-2 inline-block text-sm font-medium text-primary">
              Connect Gmail →
            </Link>
          )}
        </div>
        <div className="rounded-2xl bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">Emails sent today</p>
          <p className="mt-1 text-lg font-medium">0</p>
        </div>
        <div className="rounded-2xl bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">Active campaigns</p>
          <p className="mt-1 text-lg font-medium">0</p>
          <p className="mt-1 text-xs text-slate-400">Campaigns arrive in the next release</p>
        </div>
      </div>

      <div className="mt-8 rounded-2xl bg-white p-6 shadow-sm">
        <h2 className="font-medium">Continue setup</h2>
        <ol className="mt-3 space-y-2 text-sm text-slate-600">
          <li className={gmailConnected ? "text-green-600" : ""}>
            {gmailConnected ? "✓" : "1."} Connect your Gmail account
          </li>
          <li>2. Import your first leads (paste from Salesforce)</li>
          <li>3. Create a campaign — coming in the next release</li>
        </ol>
        <Link
          href="/leads"
          className="mt-5 inline-block rounded-xl bg-primary px-5 py-2.5 font-medium text-white hover:bg-primary-hover"
        >
          Import leads
        </Link>
      </div>
    </div>
  );
}
