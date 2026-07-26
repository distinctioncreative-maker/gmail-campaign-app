import { describe, it, expect } from "vitest";
import { tenantTypeFor, PUBLIC_EMAIL_PROVIDERS } from "@/lib/tenancy/accountType";
import { capabilitiesFor } from "@/lib/tenancy/capabilities";

describe("tenantTypeFor", () => {
  it("routes custom/business domains to a shared WORKSPACE", () => {
    expect(tenantTypeFor("alpinefundings.com")).toBe("WORKSPACE");
    expect(tenantTypeFor("everestbusinessfunding.com")).toBe("WORKSPACE");
    expect(tenantTypeFor("acme.io")).toBe("WORKSPACE");
  });
  it("routes public providers to a per-user CONSUMER workspace", () => {
    for (const d of PUBLIC_EMAIL_PROVIDERS) {
      expect(tenantTypeFor(d)).toBe("CONSUMER");
    }
    expect(tenantTypeFor("GMAIL.COM")).toBe("CONSUMER");
  });
  it("treats a missing domain as CONSUMER (safe default)", () => {
    expect(tenantTypeFor("")).toBe("CONSUMER");
  });
});

describe("capabilitiesFor", () => {
  it("gives Workspace the full team product", () => {
    const c = capabilitiesFor("WORKSPACE");
    expect(c.teams).toBe(true);
    expect(c.adminConsole).toBe(true);
    expect(c.requiresWarmup).toBe(false);
    expect(c.maxDailySends).toBeGreaterThan(0);
  });
  it("keeps Solo single-user, warmup-gated, and low-volume", () => {
    const c = capabilitiesFor("CONSUMER");
    expect(c.teams).toBe(false);
    expect(c.adminConsole).toBe(false);
    expect(c.requiresWarmup).toBe(true);
    expect(c.maxDailySends).toBeLessThan(capabilitiesFor("WORKSPACE").maxDailySends);
  });
});
