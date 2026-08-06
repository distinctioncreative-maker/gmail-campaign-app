import { describe, expect, it } from "vitest";
import {
  csvField,
  csvRow,
  csvTimestamp,
  DATASET_INFO,
  EXPORT_DATASETS,
  exportFilename,
  neutralizeFormula,
} from "@/lib/export/serialize";

describe("formula injection", () => {
  it("neutralises every character a spreadsheet treats as a formula", () => {
    // The attack is real and mundane: whoever filled in a web form typed the
    // company name, import stored it verbatim, and it runs on the machine of
    // whoever exports the list.
    for (const dangerous of [
      '=HYPERLINK("http://evil.example","Click")',
      "+1+1",
      "-2+3",
      "@SUM(A1:A9)",
      "\tcmd",
      "\r=1",
    ]) {
      expect(neutralizeFormula(dangerous), dangerous).toBe(`'${dangerous}`);
    }
  });

  it("leaves ordinary values completely alone", () => {
    for (const safe of ["Acme Corp", "jane@example.com", "O'Brien", "50%", "A-1 Supplies"]) {
      expect(neutralizeFormula(safe), safe).toBe(safe);
    }
  });

  it("prefixes rather than strips, so data is never silently altered", () => {
    // Deleting the leading minus would turn -50 into 50, which corrupts the
    // customer's own numbers in the name of protecting them.
    expect(neutralizeFormula("-50")).toBe("'-50");
    expect(neutralizeFormula("-50")).toContain("-50");
  });

  it("does not quote a negative number into text", () => {
    // Numbers arrive as numbers and must stay usable as numbers: an
    // apostrophe here would make every currency column text in Excel.
    expect(csvField(-50)).toBe("-50");
    expect(csvField(0)).toBe("0");
    expect(csvField(1234.56)).toBe("1234.56");
  });

  it("still guards a formula that arrives as a string of digits and signs", () => {
    expect(csvField("-50")).toBe("'-50");
  });
});

describe("csvField quoting", () => {
  it("quotes and doubles embedded quotes", () => {
    expect(csvField('He said "hi"')).toBe('"He said ""hi"""');
  });

  it("quotes anything containing a delimiter or a line break", () => {
    expect(csvField("Acme, Inc")).toBe('"Acme, Inc"');
    expect(csvField("line one\nline two")).toBe('"line one\nline two"');
    expect(csvField("carriage\rreturn")).toBe('"carriage\rreturn"');
  });

  it("renders absent values as empty, not as the word null", () => {
    expect(csvField(null)).toBe("");
    expect(csvField(undefined)).toBe("");
  });

  it("renders booleans readably", () => {
    expect(csvField(true)).toBe("true");
    expect(csvField(false)).toBe("false");
  });

  it("keeps a comma inside a value from shifting later columns", () => {
    // The failure this prevents: every column after the unquoted comma lands
    // one place to the right, silently, for the rest of the file.
    const row = csvRow(["Acme, Inc", "jane@example.com", 3]);
    expect(row).toBe('"Acme, Inc",jane@example.com,3');
    expect(row.split(",").length).toBeGreaterThan(3); // naive split breaks
  });

  it("survives a value that is both a formula and needs quoting", () => {
    expect(csvField('=CONCAT("a","b")')).toBe(`"'=CONCAT(""a"",""b"")"`);
  });
});

describe("csvTimestamp", () => {
  it("writes ISO 8601, not a locale string", () => {
    // An export is read by software as often as by a person, and 3/4/2026 is
    // a different day depending on who opens it.
    expect(csvTimestamp(1_700_000_000_000)).toBe("2023-11-14T22:13:20.000Z");
  });

  it("is empty for absent or nonsense values", () => {
    expect(csvTimestamp(null)).toBe("");
    expect(csvTimestamp(undefined)).toBe("");
    expect(csvTimestamp(Number.NaN)).toBe("");
    expect(csvTimestamp(Number.POSITIVE_INFINITY)).toBe("");
  });
});

describe("the dataset catalog", () => {
  it("describes every dataset it offers", () => {
    for (const dataset of EXPORT_DATASETS) {
      const info = DATASET_INFO[dataset];
      expect(info, dataset).toBeDefined();
      expect(info.headers.length, dataset).toBeGreaterThan(2);
      expect(info.description.length, dataset).toBeGreaterThan(20);
    }
  });

  it("covers what a customer would need to leave", () => {
    // Portability means the records, not a summary of them.
    expect(EXPORT_DATASETS).toContain("leads");
    expect(EXPORT_DATASETS).toContain("recipients");
    expect(EXPORT_DATASETS).toContain("suppressions");
  });

  it("exports suppressions, which are the ones that matter to third parties", () => {
    // A customer who moves tools without their opt-out list will email people
    // who asked not to be emailed. Losing this one is a legal problem, not an
    // inconvenience.
    expect(DATASET_INFO.suppressions.headers).toContain("email");
    expect(DATASET_INFO.suppressions.headers).toContain("reason");
  });

  it("names files so they sort and say what they are", () => {
    expect(exportFilename("leads", Date.UTC(2026, 7, 6))).toBe("cadence-leads-2026-08-06.csv");
  });
});
