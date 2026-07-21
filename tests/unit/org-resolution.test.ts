import { describe, expect, it } from "vitest";
import { resolveOrgId } from "@/lib/repositories/organizations";

const ALLOWED = ["alpinefundings.com", "everestbusinessfunding.com"];

describe("resolveOrgId", () => {
  it("aliases the primary (first) domain to the default org", () => {
    expect(resolveOrgId("alpinefundings.com", ALLOWED)).toBe("default");
  });

  it("gives every other domain its own isolated org id", () => {
    expect(resolveOrgId("everestbusinessfunding.com", ALLOWED)).toBe("org_everestbusinessfunding_com");
  });

  it("two domains resolve to two different orgs", () => {
    const a = resolveOrgId("alpinefundings.com", ALLOWED);
    const b = resolveOrgId("everestbusinessfunding.com", ALLOWED);
    expect(a).not.toBe(b);
  });

  it("is case-insensitive", () => {
    expect(resolveOrgId("EverestBusinessFunding.com", ALLOWED)).toBe("org_everestbusinessfunding_com");
  });

  it("falls back to the default org with no allowlist (dev)", () => {
    expect(resolveOrgId("anything.com", [])).toBe("default");
    expect(resolveOrgId("", ALLOWED)).toBe("default");
  });
});
