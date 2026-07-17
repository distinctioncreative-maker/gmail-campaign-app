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

      {ctx.user.onboardingStatus !== "COMPLETE" ? (
        <div className="mt-8 rounded-2xl bg-white p-6 shadow-sm">
          <h2 className="font-medium">Finish setting up</h2>
          <p className="mt-1 text-sm text-slate-600">
            A short guided setup connects your Gmail, fills in your signature, and sends
            you a test email.
          </p>
          <Link
            href="/onboarding"
            className="mt-4 inline-block rounded-xl bg-primary px-5 py-2.5 font-medium text-white hover:bg-primary-hover"
          >
            Continue setup
          </Link>
        </div>
      ) : (
        <div className="mt-8 rounded-2xl bg-white p-6 shadow-sm">
          <h2 className="font-medium">Quick actions</h2>
          <div className="mt-4 flex flex-wrap gap-3">
            <Link
              href="/leads"
              className="rounded-xl bg-primary px-5 py-2.5 font-medium text-white hover:bg-primary-hover"
            >
              Import leads
            </Link>
            <Link
              href="/templates"
              className="rounded-xl border border-slate-200 px-5 py-2.5 font-medium text-slate-700 hover:bg-slate-50"
            >
              Templates
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
