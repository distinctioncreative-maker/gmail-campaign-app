import type { Metadata } from "next";
import { LegalPage, LegalSection } from "@/components/legal/LegalPage";

export const metadata: Metadata = {
  title: "Acceptable Use and Anti-Spam Policy",
  description: "Responsible-use and anti-spam requirements for Cadence.",
};

export default function AcceptableUsePage() {
  return (
    <LegalPage
      eyebrow="Acceptable use and anti-spam"
      title="Use Cadence for relevant, lawful outreach."
      summary="Cadence is designed for responsible business communication, not indiscriminate volume. These rules protect recipients, customers, connected inboxes, and the platform."
    >
      <LegalSection title="Required practices">
        <ul className="list-disc space-y-2 pl-5">
          <li>Use contact data you may lawfully process and contact.</li>
          <li>Use accurate sender details, routing information, and subject lines.</li>
          <li>Clearly identify commercial messages when required.</li>
          <li>Include a valid postal address and a clear, working opt-out method.</li>
          <li>Honor unsubscribe and suppression requests promptly and permanently.</li>
          <li>Use gradual, provider-aware pacing and respect Gmail and Workspace policies.</li>
          <li>Review AI-generated copy and personalization before sending.</li>
        </ul>
      </LegalSection>

      <LegalSection title="Prohibited use">
        <p>You may not use Cadence for:</p>
        <ul className="list-disc space-y-2 pl-5">
          <li>Spam, phishing, malware, fraud, impersonation, or deceptive claims.</li>
          <li>Purchased, scraped, harvested, or unlawfully disclosed contact lists.</li>
          <li>Illegal, abusive, threatening, discriminatory, or exploitative content.</li>
          <li>Misleading sender identities, headers, domains, tracking, or subject lines.</li>
          <li>Circumventing rate limits, plan controls, suppressions, or safety checks.</li>
          <li>Contacting people who opted out or whose address is suppressed.</li>
          <li>Testing security or accessing another organization&apos;s data without written authorization.</li>
        </ul>
      </LegalSection>

      <LegalSection title="List sourcing and future research tools">
        <p>
          Cadence does not currently provide a general lead-scraping feature. Any future sourcing
          or research capability must preserve source provenance, respect site and provider terms,
          apply lawful-basis and consent controls, honor robots and access restrictions where
          applicable, enforce cost and rate limits, and pass suppression checks before outreach.
        </p>
      </LegalSection>

      <LegalSection title="Enforcement">
        <p>
          Cadence may investigate, limit, pause, or terminate activity that violates this policy
          or threatens recipients, connected accounts, service providers, or platform security.
          Serious or repeated violations may result in immediate suspension. Customers remain
          responsible for their users and campaigns.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
