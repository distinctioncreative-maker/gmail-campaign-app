import { describe, expect, it } from "vitest";
import { evaluateSpf, evaluateDkim, evaluateDmarc, parseDmarc } from "@/lib/deliverability/dns";

describe("evaluateSpf", () => {
  it("fails when no SPF record exists", () => {
    const r = evaluateSpf(["google-site-verification=abc"]);
    expect(r.status).toBe("FAIL");
    expect(r.fix).toContain("_spf.google.com");
  });
  it("passes with Google include and softfail", () => {
    expect(evaluateSpf(["v=spf1 include:_spf.google.com ~all"]).status).toBe("PASS");
  });
  it("warns when SPF exists but Google isn't included", () => {
    expect(evaluateSpf(["v=spf1 include:mailgun.org -all"]).status).toBe("WARN");
  });
  it("fails on +all (open relay policy)", () => {
    expect(evaluateSpf(["v=spf1 include:_spf.google.com +all"]).status).toBe("FAIL");
  });
  it("is case-insensitive", () => {
    expect(evaluateSpf(["V=SPF1 INCLUDE:_SPF.GOOGLE.COM ~ALL"]).status).toBe("PASS");
  });
});

describe("evaluateDkim", () => {
  it("passes with a DKIM key at the google selector", () => {
    expect(evaluateDkim(true, ["v=DKIM1; k=rsa; p=MIGf..."]).status).toBe("PASS");
  });
  it("warns when the selector is missing (may be custom)", () => {
    const r = evaluateDkim(false, []);
    expect(r.status).toBe("WARN");
    expect(r.detail).toContain("custom selector");
  });
  it("warns when the record exists but isn't a key", () => {
    expect(evaluateDkim(true, ["hello"]).status).toBe("WARN");
  });
});

describe("parseDmarc / evaluateDmarc", () => {
  it("parses policy out of a DMARC record", () => {
    expect(parseDmarc(["v=DMARC1; p=quarantine; rua=mailto:x@y.com"])).toEqual({
      found: true,
      policy: "quarantine",
    });
  });
  it("fails when missing", () => {
    expect(evaluateDmarc([]).status).toBe("FAIL");
  });
  it("passes at p=none (Google's minimum)", () => {
    const r = evaluateDmarc(["v=DMARC1; p=none"]);
    expect(r.status).toBe("PASS");
    expect(r.fix).toContain("quarantine");
  });
  it("passes cleanly with an enforcing policy", () => {
    expect(evaluateDmarc(["v=DMARC1; p=reject"]).fix).toBeNull();
  });
  it("tolerates whitespace and case", () => {
    expect(parseDmarc(["V=DMARC1;  P = Reject"]).policy).toBe("reject");
  });
});
