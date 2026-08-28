import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage, LegalSection } from "@/components/legal/LegalPage";
import { env } from "@/lib/env";
import { supportMailto, SUPPORT_RESPONSE_TARGET } from "@/lib/support/contact";

export const metadata: Metadata = {
  title: "Support",
  description: "How to reach a human at Cadence, signed in or locked out.",
};

/**
 * Rendered per request, not prerendered. SUPPORT_EMAIL is set on the Cloud Run
 * service, and the image is built before that exists: a static page would bake
 * in "no address published yet" and keep serving it long after the address was
 * configured. A support page that lies about having support is the one page
 * that cannot afford to be stale.
 */
export const dynamic = "force-dynamic";

/**
 * The public support page.
 *
 * Public on purpose. The in-app form is better in every way that matters, and
 * it is useless to the one person who most needs support: someone who cannot
 * sign in. That case gets a plain address on a page behind no session.
 *
 * When SUPPORT_EMAIL is unset the page says so rather than rendering a mailto
 * that goes nowhere. A support address that silently discards mail is worse
 * than an admission that one is not published yet.
 */
export default function SupportPage() {
  const address = env.SUPPORT_EMAIL.trim();

  return (
    <LegalPage
      eyebrow="Support"
      title="Reach a human."
      summary={`Every message gets a reference and a reply within ${SUPPORT_RESPONSE_TARGET}. If something is actively going wrong with a live campaign, say so in the subject and it moves to the front.`}
    >
      <LegalSection title="If you can sign in">
        <p>
          Use the contact form in the app:{" "}
          <Link href="/help/contact" className="link">
            Help, then Contact support
          </Link>
          .
          It attaches your workspace, plan, sending mode, Gmail connection status, and the exact
          build you are running, so the first reply can be an answer instead of a question. No lead
          data and nothing from your mailbox is attached.
        </p>
      </LegalSection>

      <LegalSection title="If you cannot sign in">
        {address ? (
          <p>
            Email{" "}
            <a
              href={supportMailto(address, { subject: "Cannot sign in to Cadence" })}
              className="font-medium text-foreground link"
            >
              {address}
            </a>{" "}
            from the address you sign in with, and tell us what you see instead of the app. Sending
            from the account itself is what lets us confirm it is yours.
          </p>
        ) : (
          <p>
            A published support address is not live yet. Cadence is in early access, so reach your
            account contact directly in the meantime. This page updates the moment the address is
            configured.
          </p>
        )}
      </LegalSection>

      <LegalSection title="What to include">
        <ul className="list-disc space-y-2 pl-5">
          <li>The campaign name, if the problem is about sending.</li>
          <li>Roughly when it started, so it can be matched against a deploy.</li>
          <li>What you expected instead. It is the fastest way to spot a misunderstanding.</li>
          <li>Never a password, and never an API key. We will never ask for either.</li>
        </ul>
      </LegalSection>

      <LegalSection title="Data, deletion, and export requests">
        <p>
          Requests about your data are handled through the same path and are not treated as
          ordinary tickets. See the{" "}
          <Link href="/privacy" className="link">
            privacy notice
          </Link>{" "}
          for what Cadence stores and why.
        </p>
      </LegalSection>

      <LegalSection title="Is it us or is it you?">
        <p>
          <a
            href="/api/health"
            className="link"
          >
            /api/health
          </a>{" "}
          reports whether the service and its database are reachable. A 200 there means the
          platform is up, which narrows the problem to your workspace and is worth checking before
          you write.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
