import type { Metadata } from "next";
import { LegalPage, LegalSection } from "@/components/legal/LegalPage";

export const metadata: Metadata = {
  title: "Privacy Notice",
  description: "How Cadence handles data during early access.",
};

export default function PrivacyPage() {
  return (
    <LegalPage
      eyebrow="Privacy notice"
      title="Your outreach data deserves careful handling."
      summary="This notice explains the baseline data practices for Cadence visitors and customers. Signed data terms provide organization-specific details."
    >
      <LegalSection title="Data we process">
        <p>
          We may process account and organization details, Google account connection data,
          sender profiles, contact and campaign records, message templates, scheduling settings,
          replies and engagement signals, support requests, security logs, and product usage data.
          We also receive the email address submitted through the Talk to sales form.
        </p>
      </LegalSection>

      <LegalSection title="Google account data">
        <p>
          Cadence requests only the Google access needed for enabled Gmail workflows. Connected
          account tokens are protected server-side and are not exposed to other customers.
          Revoking Google access can stop connected features. The exact approved scopes and token
          handling are described during onboarding.
        </p>
      </LegalSection>

      <LegalSection title="How we use data">
        <p>
          We use data to provide and secure Cadence, authenticate users, prepare and process
          approved outreach, enforce suppressions and safety controls, generate reports, provide
          support, detect abuse, investigate incidents, and improve the service. Optional AI
          features use only the content needed for the requested operation and are subject to the
          signed terms.
        </p>
      </LegalSection>

      <LegalSection title="Engagement tracking">
        <p>
          If a sender enables tracking, Cadence can rewrite eligible links and add a small image
          to estimate opens and clicks. Email clients can block or preload images, so an open is
          not proof that a person read a message. Unsubscribe links are never routed through click
          tracking. Senders can disable tracking for a campaign.
        </p>
      </LegalSection>

      <LegalSection title="Sharing and subprocessors">
        <p>
          We share data only with service providers needed to operate the service, with your
          organization, when you direct us, to protect rights and security, or when legally
          required. The approved subprocessor list, data regions, international transfer terms,
          and any data processing addendum must be attached to or identified by the signed
          agreement before customer onboarding.
        </p>
      </LegalSection>

      <LegalSection title="Retention and deletion">
        <p>
          We retain data for the subscription term and the documented operational, security, legal, and
          backup periods agreed with the customer. Campaigns moved to Recently Deleted remain
          recoverable until a user explicitly deletes them forever. A final retention schedule
          and deletion process must be approved in the signed agreement before live customer data
          is accepted.
        </p>
      </LegalSection>

      <LegalSection title="Security and privacy choices">
        <p>
          Cadence uses tenant-scoped access controls, protected credentials, server-side
          validation, suppression enforcement, audit-oriented records, and send-safety controls.
          No system is risk-free. Contact the address in your signed agreement promptly for a
          security or privacy request. Prospective customers can use the Talk to sales form.
        </p>
      </LegalSection>

      <LegalSection title="Your rights">
        <p>
          Depending on location, individuals may have rights to access, correct, delete, restrict,
          or object to certain processing. Cadence and the customer will determine their respective
          responsibilities in the signed data terms. Cadence is not intended for children.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
