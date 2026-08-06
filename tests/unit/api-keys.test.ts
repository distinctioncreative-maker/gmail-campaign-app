import { describe, expect, it } from "vitest";
import {
  API_SCOPES,
  apiKeyFromHeader,
  describeScopes,
  displayHint,
  environmentOf,
  generateApiKey,
  hashApiKey,
  hashesMatch,
  hasScope,
  looksLikeApiKey,
} from "@/lib/apiKeys/token";

describe("generateApiKey", () => {
  it("produces a key, its hash, and a display hint", () => {
    const key = generateApiKey();
    expect(key.secret.startsWith("cad_live_")).toBe(true);
    expect(key.hash).toHaveLength(64);
    expect(key.display.startsWith("cad_live_")).toBe(true);
    expect(key.environment).toBe("live");
  });

  it("marks a test key distinctly", () => {
    const key = generateApiKey("test");
    expect(key.secret.startsWith("cad_test_")).toBe(true);
    expect(environmentOf(key.secret)).toBe("test");
  });

  it("never repeats", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 200; i += 1) seen.add(generateApiKey().secret);
    expect(seen.size).toBe(200);
  });

  it("carries enough entropy that guessing is hopeless", () => {
    // 32 random bytes as base64url is 43 characters. If this ever shortens,
    // the key stops being unguessable and nothing else in the file would fail.
    const body = generateApiKey().secret.slice("cad_live_".length);
    expect(body).toHaveLength(43);
  });

  it("generates a hash that matches hashApiKey on the secret", () => {
    const key = generateApiKey();
    expect(key.hash).toBe(hashApiKey(key.secret));
  });
});

describe("the display hint", () => {
  it("shows the start of the key, which is what appears in a log line", () => {
    const hint = displayHint("cad_live_abcdef1234567890");
    expect(hint).toBe("cad_live_abcdef...");
  });

  it("reveals far too little to guess the rest", () => {
    const key = generateApiKey();
    const revealed = key.display.replace("cad_live_", "").replace("...", "");
    expect(revealed).toHaveLength(6);
    expect(key.secret).not.toBe(key.display);
    expect(key.display.length).toBeLessThan(key.secret.length / 2);
  });

  it("keeps the environment visible so live and test keys are distinguishable", () => {
    expect(displayHint(generateApiKey("test").secret).startsWith("cad_test_")).toBe(true);
  });
});

describe("hashApiKey", () => {
  it("is stable and hex", () => {
    expect(hashApiKey("cad_live_x")).toBe(hashApiKey("cad_live_x"));
    expect(hashApiKey("cad_live_x")).toMatch(/^[0-9a-f]{64}$/);
  });

  it("ignores surrounding whitespace, which copy-paste adds", () => {
    expect(hashApiKey("  cad_live_x  ")).toBe(hashApiKey("cad_live_x"));
  });

  it("differs completely for a one-character change", () => {
    expect(hashApiKey("cad_live_a")).not.toBe(hashApiKey("cad_live_b"));
  });
});

describe("looksLikeApiKey", () => {
  it("accepts a freshly generated key", () => {
    expect(looksLikeApiKey(generateApiKey().secret)).toBe(true);
    expect(looksLikeApiKey(generateApiKey("test").secret)).toBe(true);
  });

  it("rejects anything malformed before a database read happens", () => {
    for (const bad of [
      "",
      "   ",
      "bearer cad_live_x",
      "cad_live_",
      "cad_live_tooshort",
      `cad_live_${"a".repeat(42)}`,
      `cad_live_${"a".repeat(44)}`,
      `cad_live_${"a".repeat(42)}=`,
      `cad_live_${"a".repeat(42)}/`,
      `sk_live_${"a".repeat(43)}`,
      `${"a".repeat(43)}`,
    ]) {
      expect(looksLikeApiKey(bad), JSON.stringify(bad)).toBe(false);
    }
  });

  it("rejects a key whose body has characters base64url never produces", () => {
    expect(looksLikeApiKey(`cad_live_${"+".repeat(43)}`)).toBe(false);
  });
});

describe("hashesMatch", () => {
  it("matches identical hashes", () => {
    const hash = hashApiKey("cad_live_x");
    expect(hashesMatch(hash, hash)).toBe(true);
  });

  it("rejects different hashes", () => {
    expect(hashesMatch(hashApiKey("a"), hashApiKey("b"))).toBe(false);
  });

  it("rejects mismatched lengths without throwing", () => {
    // timingSafeEqual throws on a length mismatch, which would be both an
    // unhandled exception and a timing signal of its own.
    expect(() => hashesMatch("abc", hashApiKey("x"))).not.toThrow();
    expect(hashesMatch("abc", hashApiKey("x"))).toBe(false);
  });

  it("rejects empty and non-string input", () => {
    expect(hashesMatch("", "")).toBe(false);
    expect(hashesMatch(undefined as unknown as string, "abc")).toBe(false);
    expect(hashesMatch("abc", null as unknown as string)).toBe(false);
  });
});

describe("apiKeyFromHeader", () => {
  it("reads a Bearer token", () => {
    const key = generateApiKey().secret;
    expect(apiKeyFromHeader(`Bearer ${key}`)).toBe(key);
    expect(apiKeyFromHeader(`bearer ${key}`)).toBe(key);
    expect(apiKeyFromHeader(`  Bearer   ${key}  `)).toBe(key);
  });

  it("refuses anything that is not a well-formed Bearer key", () => {
    const key = generateApiKey().secret;
    for (const bad of [
      null,
      undefined,
      "",
      key,
      `Basic ${key}`,
      `Bearer`,
      `Bearer ${key} extra`,
      "Bearer not-a-key",
    ]) {
      expect(apiKeyFromHeader(bad as string), JSON.stringify(bad)).toBeNull();
    }
  });
});

describe("hasScope", () => {
  it("permits exactly what was granted", () => {
    expect(hasScope(["leads:read"], "leads:read")).toBe(true);
    expect(hasScope(["leads:read"], "leads:write")).toBe(false);
  });

  it("does not let a write scope imply its read", () => {
    // Two separate grants on purpose. A customer handing an integration
    // leads:write to push contacts in has not agreed to let it read their
    // whole list back out, and bundling them would make the narrow grant
    // impossible to express.
    expect(hasScope(["leads:write"], "leads:read")).toBe(false);
    expect(hasScope(["campaigns:write"], "campaigns:read")).toBe(false);
  });

  it("denies by default for anything unexpected", () => {
    for (const granted of [
      [],
      ["*"],
      ["admin"],
      ["leads:*"],
      null as unknown as string[],
      undefined as unknown as string[],
      "leads:read" as unknown as string[],
    ]) {
      expect(hasScope(granted ?? [], "leads:read"), JSON.stringify(granted)).toBe(false);
    }
  });

  it("covers every scope the product offers", () => {
    for (const scope of API_SCOPES) {
      expect(hasScope([...API_SCOPES], scope), scope).toBe(true);
    }
  });
});

describe("describeScopes", () => {
  it("says no access for an empty grant", () => {
    expect(describeScopes([])).toBe("No access");
  });

  it("says full access only when everything is granted", () => {
    expect(describeScopes([...API_SCOPES])).toBe("Full access");
    expect(describeScopes(API_SCOPES.slice(0, -1))).not.toBe("Full access");
  });

  it("ignores scopes the product does not recognise", () => {
    // A stored document could carry anything; the label must not repeat it back.
    expect(describeScopes(["leads:read", "made:up"])).toBe("leads:read");
  });
});

describe("scope definitions stay in sync", () => {
  it("matches the schema enum exactly", async () => {
    // The scopes are declared twice: once in lib/apiKeys/token.ts, which is
    // imported by client code, and once in schemas/integration.ts, which must
    // stay free of a server-only import. A drift between them would let a route
    // require a scope no key can ever be granted.
    const { ApiScopeSchema } = await import("@/schemas/integration");
    expect([...ApiScopeSchema.options].sort()).toEqual([...API_SCOPES].sort());
  });
});
