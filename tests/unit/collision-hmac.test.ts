import { describe, expect, it } from "vitest";
import crypto from "node:crypto";

/**
 * The collision hash must be an HMAC keyed by an org secret — never a plain
 * or unsalted hash (spec §4). This mirrors the digest used in
 * lib/campaigns/collision.ts (computeCollisionHash) without needing
 * Firestore, verifying the security property.
 */
function hmac(secret: string, normalizedEmail: string): string {
  return crypto.createHmac("sha256", secret).update(normalizedEmail).digest("hex");
}

describe("collision HMAC", () => {
  it("is deterministic for the same secret + email", () => {
    const s = "org-secret";
    expect(hmac(s, "jane@x.com")).toBe(hmac(s, "jane@x.com"));
  });

  it("differs across organizations (different secret)", () => {
    expect(hmac("secret-a", "jane@x.com")).not.toBe(hmac("secret-b", "jane@x.com"));
  });

  it("is not a plain SHA-256 of the email (salted by the secret)", () => {
    const plain = crypto.createHash("sha256").update("jane@x.com").digest("hex");
    expect(hmac("org-secret", "jane@x.com")).not.toBe(plain);
  });

  it("does not reveal the email (one-way)", () => {
    const digest = hmac("org-secret", "jane@x.com");
    expect(digest).not.toContain("jane");
    expect(digest).toMatch(/^[a-f0-9]{64}$/);
  });
});
