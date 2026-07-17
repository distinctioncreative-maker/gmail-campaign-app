import { describe, expect, it } from "vitest";
import { detectMapping, parseCsvLeads } from "@/lib/leads/csv";

const SAMPLE = `First Name,Last Name,Company,Email,Phone,Amount,Lead Source,Email Opt Out
Jason,Main,Mainmastics Llc,alfredoheraldez@gmail.com,(469) 971-4333,"14,000.00",Sunrise,FALSE
Jared,Mannon,Mannon Mechanical Llc,jared@mannon-mechanical.com,(228) 546-8588,0.00,Sunrise,TRUE
,,Precision Paint,bademail@@x,(713) 788-8518,,QR Mailers,FALSE
`;

describe("detectMapping", () => {
  it("maps common header names automatically", () => {
    const mapping = detectMapping([
      "First Name",
      "Last Name",
      "Company",
      "Email",
      "Phone",
      "Amount",
      "Lead Source",
      "Email Opt Out",
    ]);
    expect(mapping["First Name"]).toBe("firstName");
    expect(mapping["Company"]).toBe("businessName");
    expect(mapping["Email"]).toBe("email");
    expect(mapping["Email Opt Out"]).toBe("emailOptOut");
  });

  it("marks unknown headers as ignore", () => {
    const mapping = detectMapping(["Favorite Color", "Email"]);
    expect(mapping["Favorite Color"]).toBe("ignore");
    expect(mapping["Email"]).toBe("email");
  });

  it("does not assign the same field twice", () => {
    const mapping = detectMapping(["Email", "Email Address"]);
    const values = Object.values(mapping).filter((f) => f === "email");
    expect(values).toHaveLength(1);
  });
});

describe("parseCsvLeads", () => {
  it("parses rows with the detected mapping", () => {
    const result = parseCsvLeads(SAMPLE);
    expect(result.leads).toHaveLength(3);
    const jason = result.leads[0];
    expect(jason.fullName).toBe("Jason Main");
    expect(jason.email).toBe("alfredoheraldez@gmail.com");
    expect(jason.requestedAmount).toBe(14000);
    expect(jason.emailOptOut).toBe(false);
    expect(jason.emailValid).toBe(true);
  });

  it("reads opt-out true values", () => {
    const result = parseCsvLeads(SAMPLE);
    expect(result.leads[1].emailOptOut).toBe(true);
  });

  it("flags invalid emails and missing names", () => {
    const result = parseCsvLeads(SAMPLE);
    const bad = result.leads[2];
    expect(bad.emailValid).toBe(false);
    expect(bad.warnings.some((w) => w.includes("invalid"))).toBe(true);
    expect(bad.warnings).toContain("Missing contact name");
  });

  it("splits a full-name column when first/last are absent", () => {
    const csv = `Name,Email\nAna de la Cruz,ana@x.com\n`;
    const result = parseCsvLeads(csv);
    expect(result.leads[0].firstName).toBe("Ana");
    expect(result.leads[0].lastName).toBe("de la Cruz");
  });

  it("warns when no email column can be found", () => {
    const csv = `Name,Phone\nJoe,555-1234\n`;
    const result = parseCsvLeads(csv);
    expect(result.globalWarnings.some((w) => w.includes("Email"))).toBe(true);
  });

  it("respects an explicit mapping override", () => {
    const csv = `A,B\njoe@x.com,Joe\n`;
    const result = parseCsvLeads(csv, { A: "email", B: "fullName" });
    expect(result.leads[0].email).toBe("joe@x.com");
    expect(result.leads[0].fullName).toBe("Joe");
  });
});
