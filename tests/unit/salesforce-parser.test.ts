import { describe, expect, it } from "vitest";
import { parseSalesforceText } from "@/lib/parser/salesforce";
import { SPEC_SAMPLE } from "../fixtures/salesforce-sample";

describe("parseSalesforceText", () => {
  it("parses a complete record with every field", () => {
    const result = parseSalesforceText(SPEC_SAMPLE);
    const lead = result.leads[0];
    expect(result.totalRecords).toBe(5);
    expect(lead.fullName).toBe("Jason Main");
    expect(lead.firstName).toBe("Jason");
    expect(lead.lastName).toBe("Main");
    expect(lead.businessName).toBe("Mainmastics Llc");
    expect(lead.phone).toBe("(469) 971-4333");
    expect(lead.region).toBe("Central");
    expect(lead.requestedAmount).toBe(14000);
    expect(lead.email).toBe("alfredoheraldez@gmail.com");
    expect(lead.emailValid).toBe(true);
    expect(lead.emailOptOut).toBe(false);
    expect(lead.neverSwitchedFromNew).toBe(false);
    expect(lead.leadSource).toBe("Sunrise");
    expect(lead.sourceCreatedAt).toBe("1/20/2026, 8:04 AM");
    expect(lead.sourceUpdatedAt).toBe("7/16/2026, 4:18 PM");
    expect(lead.sourceRecordId).toBe("1521");
    expect(lead.confidence).toBeGreaterThan(0.9);
  });

  it("handles a record with no amount without shifting other fields", () => {
    const result = parseSalesforceText(SPEC_SAMPLE);
    const oscar = result.leads[3];
    expect(oscar.fullName).toBe("Oscar Pineda");
    expect(oscar.requestedAmount).toBeNull();
    expect(oscar.email).toBe("opclean@yahoo.com");
    expect(oscar.leadSource).toBe("QR Mailers - myalpinefunding");
    expect(oscar.region).toBe("Central");
    expect(oscar.warnings).toContain("No requested amount found");
  });

  it("handles a record with no source ID", () => {
    const result = parseSalesforceText(SPEC_SAMPLE);
    const oscar = result.leads[3];
    expect(oscar.sourceRecordId).toBeNull();
    expect(oscar.warnings).toContain("No source record ID found");
    // Timestamps still land correctly.
    expect(oscar.sourceCreatedAt).toBe("2/4/2026, 1:26 PM");
    expect(oscar.sourceUpdatedAt).toBe("7/17/2026, 8:58 AM");
  });

  it("handles a record missing the Never Switched flag", () => {
    const result = parseSalesforceText(SPEC_SAMPLE);
    const emiley = result.leads[4];
    expect(emiley.fullName).toBe("Emiley Delgado");
    expect(emiley.neverSwitchedFromNew).toBeNull();
    expect(emiley.email).toBe("intake@healingspacetherapeutics.com");
  });

  it("tolerates extra tabs (tab-separated cells)", () => {
    const tabbed = SPEC_SAMPLE.split("\n\n")[0].replace(/\n/g, "\t");
    const result = parseSalesforceText("Select Item 1\t" + tabbed.replace(/^Select Item 1\t/, ""));
    expect(result.totalRecords).toBe(1);
    const lead = result.leads[0];
    expect(lead.fullName).toBe("Jason Main");
    expect(lead.email).toBe("alfredoheraldez@gmail.com");
    expect(lead.requestedAmount).toBe(14000);
  });

  it("tolerates extra blank lines and non-breaking spaces", () => {
    const spaced = SPEC_SAMPLE.replace(/\n/g, "\n\n").replace(/ /g, "  ".slice(1));
    const result = parseSalesforceText(spaced);
    expect(result.totalRecords).toBe(5);
    expect(result.leads[0].email).toBe("alfredoheraldez@gmail.com");
  });

  it("flags an invalid email and lowers confidence", () => {
    const text = `Select Item 1
Jane Doe
Doe Consulting
(555) 123-4567
Central
notanemail@@bad
FalseEmail Opt Out
Sunrise
1/2/2026, 9:00 AM
1/3/2026, 9:00 AM
42
FalseNever Switched from NEW`;
    const result = parseSalesforceText(text);
    const lead = result.leads[0];
    // "notanemail@@bad" fails the email-line pattern so no email is captured.
    expect(lead.email).toBeNull();
    expect(lead.emailValid).toBe(false);
    expect(lead.warnings).toContain("Missing email address");
    expect(lead.confidence).toBeLessThan(0.9);
  });

  it("captures opt-out true", () => {
    const text = SPEC_SAMPLE.split("\n\n")[0].replace("FalseEmail Opt Out", "TrueEmail Opt Out");
    const result = parseSalesforceText(text);
    expect(result.leads[0].emailOptOut).toBe(true);
  });

  it("parses multiple records with stable ordering", () => {
    const result = parseSalesforceText(SPEC_SAMPLE);
    expect(result.leads.map((l) => l.fullName)).toEqual([
      "Jason Main",
      "Jared Mannon",
      "Shannon Greeley",
      "Oscar Pineda",
      "Emiley Delgado",
    ]);
    expect(result.leads.map((l) => l.index)).toEqual([0, 1, 2, 3, 4]);
  });

  it("warns on an unexpected extra free-text line without corrupting known fields", () => {
    const text = `Select Item 1
Jane Doe
Doe Consulting
(555) 123-4567
Central
9,500.00
jane@doe.com
FalseEmail Opt Out
Sunrise
Some stray UI text
1/2/2026, 9:00 AM
1/3/2026, 9:00 AM
42
FalseNever Switched from NEW`;
    const result = parseSalesforceText(text);
    const lead = result.leads[0];
    expect(lead.email).toBe("jane@doe.com");
    expect(lead.requestedAmount).toBe(9500);
    expect(lead.warnings.some((w) => w.includes("Unexpected extra line"))).toBe(true);
    expect(lead.confidence).toBeLessThan(1);
  });

  it("warns when a timestamp is missing", () => {
    const text = `Select Item 1
Jane Doe
Doe Consulting
(555) 123-4567
Central
9,500.00
jane@doe.com
FalseEmail Opt Out
Sunrise
1/2/2026, 9:00 AM
42
FalseNever Switched from NEW`;
    const result = parseSalesforceText(text);
    const lead = result.leads[0];
    expect(lead.sourceCreatedAt).toBe("1/2/2026, 9:00 AM");
    expect(lead.sourceUpdatedAt).toBeNull();
    expect(lead.warnings).toContain("Only one timestamp found; treating it as created date");
  });

  it("returns a friendly global warning when no markers exist", () => {
    const result = parseSalesforceText("just some random text");
    expect(result.totalRecords).toBe(0);
    expect(result.globalWarnings[0]).toContain("Select Item");
  });
});
