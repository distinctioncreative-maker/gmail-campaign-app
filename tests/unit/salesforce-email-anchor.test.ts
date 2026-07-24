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

// Real export: many pages concatenated OUT OF ORDER (starts at 968, jumps to
// 900, then 5) with collapsed empty cells and repeated owner/source columns.
const SCRAMBLED_MULTIPAGE = `968
Victor Salazar
OMNI METAL FINISHING - Funding 1
7144124739
Pacific
-
richieasal@yahoo.com
Robert Williams
Synergy
Matthew Marcano
-
-
-
3/3/2026
969
Jesus Ramos
Gbc Of Southwest Florida Llc - Funding 1
2392654982
Eastern
-
jesuspa84@hotmail.com
Robert Williams
Synergy
Matthew Marcano
-
-
-
3/3/2026
900
Curlee Dorn
360 Global Warehousing And Distribution Llc - Funding 1
5622005646
Pacific
-
curlee.dorn@360globaltransportation.com
Robert Williams
Sunrise
Matthew Marcano
-
-
-
1/28/2026
5
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

describe("email-anchored Salesforce fallback", () => {
  it("parses an out-of-order multi-page export (regression: only 99 picked up)", () => {
    const res = parseSalesforceText(SCRAMBLED_MULTIPAGE);
    const byEmail = Object.fromEntries(res.leads.map((l) => [l.email, l]));
    // All four records found regardless of their scrambled row numbers.
    expect(Object.keys(byEmail)).toEqual(
      expect.arrayContaining([
        "richieasal@yahoo.com",
        "jesuspa84@hotmail.com",
        "curlee.dorn@360globaltransportation.com",
        "shawn.mems@issllcna.com",
      ])
    );
    expect(byEmail["richieasal@yahoo.com"].fullName).toBe("Victor Salazar");
    expect(byEmail["richieasal@yahoo.com"].businessName).toBe("OMNI METAL FINISHING");
    expect(byEmail["shawn.mems@issllcna.com"].fullName).toBe("Shawn Mems");
    // Owner / closer / lead source never leak into the name.
    for (const l of res.leads) {
      expect(l.fullName).not.toBe("Robert Williams");
      expect(l.fullName).not.toBe("Matthew Marcano");
      expect(l.fullName).not.toBe("Synergy");
    }
  });


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
