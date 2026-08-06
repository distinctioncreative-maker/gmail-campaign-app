import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/auth/requireUser";
import { PageHeader } from "@/components/ui/PageHeader";
import { ContactSupportForm } from "@/components/support/ContactSupportForm";
import { SUPPORT_RESPONSE_TARGET } from "@/lib/support/contact";

export const metadata: Metadata = {
  title: "Contact support",
  description: "Send a support request with your workspace context attached.",
};

/**
 * A server page purely so the form can be handed the signed-in address without
 * a round trip. Everything interactive lives in the client component.
 */
export default async function ContactSupportPage() {
  const ctx = await requireUser();

  return (
    <div>
      <PageHeader
        title="Contact support"
        description={`Tell us what is going wrong and we reply within ${SUPPORT_RESPONSE_TARGET}. Your workspace context comes along automatically, so you do not have to describe your setup.`}
      />

      <ContactSupportForm signedInEmail={ctx.email} />

      <div className="mt-6 card p-5 sm:p-6">
        <h2 className="font-semibold">Faster than writing to us</h2>
        <p className="mt-1 text-sm text-muted">
          Some problems answer themselves, and these three cover most of what people write in about.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link href="/help#questions" className="btn-secondary min-h-11 px-4 py-2.5 text-sm">
            Troubleshooting
          </Link>
          <Link href="/deliverability" className="btn-secondary min-h-11 px-4 py-2.5 text-sm">
            Check sending authentication
          </Link>
          <Link href="/help#test-center" className="btn-secondary min-h-11 px-4 py-2.5 text-sm">
            Run a system check
          </Link>
        </div>
      </div>
    </div>
  );
}
