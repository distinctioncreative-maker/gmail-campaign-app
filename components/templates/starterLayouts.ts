export interface StarterLayout {
  id: string;
  name: string;
  description: string;
  subject: string;
  html: string;
}

const FOOTER = `<p style="font-size:12px;color:#888;margin-top:32px">{{company_name}} · {{physical_address}}<br>{{unsubscribe_text}}</p>`;

const SIGNATURE = `<p style="margin-top:24px">Best regards,<br><strong>{{sender_name}}</strong><br>{{sender_title}}, {{company_name}}<br>{{sender_phone}} · {{sender_email}}</p>`;

export const STARTER_LAYOUTS: StarterLayout[] = [
  {
    id: "simple-intro",
    name: "Simple introduction",
    description: "Short, personal, no images — reads like a one-to-one email",
    subject: "Quick question for {{business_name}}",
    html: `<p>Hi {{first_name}},</p>
<p>I came across {{business_name}} and wanted to reach out directly.</p>
<p>We help businesses like yours with fast, flexible working capital — often within 24 hours, without the paperwork banks require.</p>
<p>Would it be worth a quick call this week to see if it's a fit?</p>
${SIGNATURE}
${FOOTER}`,
  },
  {
    id: "value-props",
    name: "Three quick points",
    description: "A short pitch with three bullet points and a clear ask",
    subject: "{{first_name}}, funding options for {{business_name}}",
    html: `<p>Hi {{first_name}},</p>
<p>Reaching out about {{business_name}} — we work with businesses in your area and can typically offer:</p>
<ul>
<li><strong>Fast decisions</strong> — approval in hours, not weeks</li>
<li><strong>Flexible amounts</strong> — from $5,000 to $500,000</li>
<li><strong>Simple process</strong> — no collateral, minimal paperwork</li>
</ul>
<p>If growing {{business_name}} is on your mind this quarter, I'd love to walk you through the numbers.</p>
${SIGNATURE}
${FOOTER}`,
  },
  {
    id: "follow-up",
    name: "Gentle follow-up",
    description: "A brief nudge for people who haven't replied yet",
    subject: "Re: {{business_name}}",
    html: `<p>Hi {{first_name}},</p>
<p>Just floating this back to the top of your inbox — I know things get busy.</p>
<p>If funding for {{business_name}} isn't a priority right now, no problem at all. If it is, I'm happy to put together options with no obligation.</p>
${SIGNATURE}
${FOOTER}`,
  },
];
