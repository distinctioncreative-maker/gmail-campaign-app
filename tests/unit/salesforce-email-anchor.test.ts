import { describe, it, expect } from "vitest";
import { parseSalesforceText } from "@/lib/parser/salesforce";

// Real-world Lightning list-view pastes (collapsed empty cells, duplicated
// headers). These previously failed the strict grid parser.

const OPPORTUNITY_FORMAT = `Primary Contact
Opportunity Name
Contact: Phone
Time Zone
Amount
Contact: Email
Opportunity Owner
Lead Source
Sorted by Lead Source, ascending picklist orderAscending
Closer
Buy Rate
Factor Rate
Formula
Points Sold
Created Date
Primary Contact
Opportunity Name
Contact: Phone
Time Zone
Amount
Contact: Email
Opportunity Owner
Lead Source
Sorted by Lead Source, ascending picklist orderAscending
Closer
Buy Rate
Factor Rate
Formula
Points Sold
Created Date
1
Nasir Eftekhari
Pioneer engineering & development - Funding 1
6268736812
Pacific
-
hamedeftekhari47@gmail.com
Robert Williams
Alpine Emerald
Matthew Marcano
-
-
-
6/10/2025
2
Shawn Mems
Integrity Support Services LLC - Funding 1
3138155431
Eastern
$4,000.00
shawn.mems@issllcna.com
Robert Williams
Alpine Emerald
Matthew Marcano
1.329
1.379
5
8/13/2025`;

const LEAD_CAPTURE_FORMAT = `Time Zone
Create Date
First Name
Last Name
Phone
Last Modified
Company / Account
Email
Lead Source
Amount Requested
Monthly Revenue - Lead Capture
Lead Owner
Email Opt Out
1
Pacific
4/15/2026
Ivaylo
Plamenov
7473637924
7/16/2026
Plamenov Photo Llc
plamenovphoto@gmail.com
Sunrise
40,000.00
-
Matthew Marcano
feature not included
2
Pacific
5/24/2026
Tadashi
Yamaguchi
4159105128
7/17/2026
Mt Accountants
tycpa@live.com
Sunrise
13,000.00
-
Matthew Marcano
feature not included`;

describe("email-anchored Salesforce fallback", () => {
  it("extracts leads from the opportunity list format (collapsed cells)", () => {
    const res = parseSalesforceText(OPPORTUNITY_FORMAT);
    const emails = res.leads.map((l) => l.email);
    expect(emails).toContain("hamedeftekhari47@gmail.com");
    expect(emails).toContain("shawn.mems@issllcna.com");
    const nasir = res.leads.find((l) => l.email === "hamedeftekhari47@gmail.com")!;
    expect(nasir.fullName).toBe("Nasir Eftekhari");
    expect(nasir.businessName.toLowerCase()).toContain("pioneer");
    // Owner/closer/lead-source repeat across rows and must not become the name.
    expect(res.leads.every((l) => l.fullName !== "Robert Williams")).toBe(true);
    expect(res.leads.every((l) => l.fullName !== "Matthew Marcano")).toBe(true);
  });

  it("extracts leads from the lead-capture format", () => {
    const res = parseSalesforceText(LEAD_CAPTURE_FORMAT);
    const byEmail = Object.fromEntries(res.leads.map((l) => [l.email, l]));
    expect(byEmail["plamenovphoto@gmail.com"].firstName).toBe("Ivaylo");
    expect(byEmail["plamenovphoto@gmail.com"].businessName.toLowerCase()).toContain("plamenov");
    expect(byEmail["tycpa@live.com"].firstName).toBe("Tadashi");
    // "Sunrise" (lead source) and "Matthew Marcano" (owner) repeat → not names.
    expect(res.leads.every((l) => l.fullName !== "Sunrise")).toBe(true);
  });
});
