import type { Metadata } from "next";
import { LegalPage, LegalSection } from "@/components/legal/LegalPage";

export const metadata: Metadata = {
  title: "Managed Pilot Terms",
  description: "Terms for the Cadence managed private pilot.",
};

export default function TermsPage() {
  return (
    <LegalPage
      eyebrow="Managed pilot terms"
      title="Clear terms for using Cadence responsibly."
      summary="These terms describe the baseline rules for a Cadence private pilot. Your signed order form completes the legal and commercial details for your organization."
    >
      <LegalSection title="1. The pilot service">
        <p>
          Cadence provides Gmail-connected outreach preparation, sending controls, campaign
          reporting, reply workflows, and optional AI-assisted writing. The pilot may change as
          we learn from participating customers. Features marked beta, planned, or unavailable
          are not guaranteed deliverables.
        </p>
      </LegalSection>

      <LegalSection title="2. Eligibility and account security">
        <p>
          You must be authorized to act for your organization and use Cadence for legitimate
          business purposes. Keep access limited to approved users, protect connected Google
          accounts, and notify the pilot contact promptly if you suspect unauthorized access.
        </p>
      </LegalSection>

      <LegalSection title="3. Customer responsibilities">
        <p>
          You control your audiences, messages, sending choices, and legal basis for outreach.
          You must use truthful sender information and subject lines, honor consent and opt-out
          requirements, maintain a valid postal address, and comply with laws that apply to each
          recipient and market. You may not upload purchased, harvested, or unlawfully obtained
          contact data.
        </p>
        <p>
          You must follow the Cadence Acceptable Use and Anti-Spam Policy. Cadence may pause or
          restrict activity that threatens recipients, connected accounts, platform security, or
          third-party services.
        </p>
      </LegalSection>

      <LegalSection title="4. Google and third-party services">
        <p>
          Cadence uses Google authorization to perform the functions you approve. Your use of
          Gmail and other third-party services remains subject to their terms, quotas, policies,
          and availability. Cadence does not control inbox placement or third-party service
          decisions.
        </p>
      </LegalSection>

      <LegalSection title="5. AI-assisted features">
        <p>
          AI output may be incomplete, inaccurate, or unsuitable. Review messages and researched
          claims before use. Do not submit sensitive information unless the signed pilot agreement
          expressly permits it. You remain responsible for the content you approve and send.
        </p>
      </LegalSection>

      <LegalSection title="6. Fees, changes, and cancellation">
        <p>
          Pilot fees, included usage, payment timing, renewal, cancellation, refunds, and support
          are stated in the signed order form. Public pricing is an indicative pilot model and is
          not a charge authorization. Cadence will not activate live billing without a separate,
          approved billing setup.
        </p>
      </LegalSection>

      <LegalSection title="7. Data, confidentiality, and security">
        <p>
          Each party will protect the other party&apos;s confidential information using reasonable
          care. Cadence processes customer data to provide, secure, support, and improve the pilot
          as described in the Privacy Notice and signed data terms. Customers must not use the
          service to store secrets or regulated data outside the agreed pilot scope.
        </p>
      </LegalSection>

      <LegalSection title="8. Results and service limitations">
        <p>
          Cadence does not guarantee delivery, inbox placement, opens, replies, revenue, or any
          business outcome. Open detection can be affected by image blocking and privacy
          preloading. Service levels, warranties, indemnities, liability limits, governing law,
          dispute terms, and any data processing addendum are defined in the signed order form.
        </p>
      </LegalSection>

      <LegalSection title="9. Contact and changes">
        <p>
          Use the contact identified in your order form for legal, privacy, security, and support
          notices. Prospective pilot customers can use the Request a pilot form. Material changes
          to these public terms will be dated on this page and communicated to active pilot
          customers when appropriate.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
