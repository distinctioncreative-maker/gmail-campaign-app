import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage, LegalSection } from "@/components/legal/LegalPage";

export const metadata: Metadata = {
  title: "Email Compliance and Trust",
  description: "Cadence controls for responsible Gmail outreach and opt-outs.",
};

export default function CompliancePage() {
  return (
    <LegalPage
      eyebrow="Email compliance and trust"
      title="Safety controls that stay visible."
      summary="Cadence supports responsible outreach with enforceable suppression, footer, pacing, tenant, and delivery controls. Customers still decide who they may contact and what they send."
    >
      <LegalSection title="Commercial email requirements">
        <p>
          In the United States, commercial email generally requires truthful sender and routing
          information, non-deceptive subjects, appropriate advertising identification, a valid
          physical postal address, a clear opt-out method, and timely opt-out handling. The rules
          can apply to business-to-business email. Other locations may require consent or impose
          additional requirements.
        </p>
        <p>
          Cadence therefore does not offer a switch that removes the address or opt-out
          requirement. The template editor can add missing required fields automatically, or a
          sender can use a custom compliant footer. Campaign launch fails closed when required
          placeholders or sender-profile details are missing.
        </p>
      </LegalSection>

      <LegalSection title="Opt-out controls">
        <ul className="list-disc space-y-2 pl-5">
          <li>Every real outreach message receives a visible, server-signed unsubscribe link.</li>
          <li>Eligible messages include one-click unsubscribe headers.</li>
          <li>Unsubscribe links are not rewritten for click tracking.</li>
          <li>Opt-outs create suppression records enforced before later sends.</li>
          <li>Explicit opt-out replies stop follow-ups and update suppression state.</li>
        </ul>
      </LegalSection>

      <LegalSection title="Deliverability-aware sending">
        <p>
          Cadence uses plan limits, daily limits, send windows, randomized spacing, suppression
          checks, prior-contact rules, duplicate-send prevention, provider quota reserves, and
          ambiguous-delivery quarantine. These controls reduce avoidable risk but cannot
          guarantee delivery or inbox placement.
        </p>
      </LegalSection>

      <LegalSection title="Tracking transparency">
        <p>
          Open tracking and click tracking are separate settings and both are off unless a sender
          turns them on for a campaign. Open detection can be affected by image blocking and
          privacy preloading. Clicks and replies are generally stronger engagement signals, but no
          metric proves intent or a business outcome.
        </p>
      </LegalSection>

      <LegalSection title="Official guidance">
        <p>
          Review the{" "}
          <a
            href="https://www.ftc.gov/business-guidance/resources/can-spam-act-compliance-guide-business"
            target="_blank"
            rel="noreferrer"
            className="font-medium text-foreground link"
          >
            FTC CAN-SPAM compliance guide
          </a>{" "}
          and{" "}
          <a
            href="https://support.google.com/mail/answer/81126"
            target="_blank"
            rel="noreferrer"
            className="font-medium text-foreground link"
          >
            Google&apos;s email sender guidelines
          </a>
          . Customers should obtain advice for their audiences, locations, and use cases.
        </p>
        <p>
          See the <Link href="/acceptable-use" className="font-medium text-foreground link">Acceptable Use and Anti-Spam Policy</Link> for prohibited activity.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
