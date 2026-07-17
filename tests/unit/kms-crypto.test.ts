import { afterEach, describe, expect, it, vi } from "vitest";
import crypto from "node:crypto";

const DEV_KEY = crypto.randomBytes(32).toString("base64");

async function loadCrypto(envVars: Record<string, string>) {
  vi.resetModules();
  for (const [k, v] of Object.entries(envVars)) vi.stubEnv(k, v);
  return import("@/lib/kms/crypto");
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("token encryption boundary (local dev mode)", () => {
  it("round-trips a refresh token and never stores plaintext", async () => {
    const { encryptSecret, decryptSecret } = await loadCrypto({
      TOKEN_KMS_KEY_RESOURCE: "",
      LOCAL_DEV_ENCRYPTION_KEY: DEV_KEY,
    });
    const token = "1//refresh-token-value-abc123";
    const ciphertext = await encryptSecret(token);
    expect(ciphertext).not.toContain(token);
    expect(ciphertext.startsWith("local:")).toBe(true);
    expect(await decryptSecret(ciphertext)).toBe(token);
  });

  it("produces distinct ciphertexts for the same plaintext (fresh IV)", async () => {
    const { encryptSecret } = await loadCrypto({
      TOKEN_KMS_KEY_RESOURCE: "",
      LOCAL_DEV_ENCRYPTION_KEY: DEV_KEY,
    });
    const a = await encryptSecret("same");
    const b = await encryptSecret("same");
    expect(a).not.toBe(b);
  });

  it("rejects tampered ciphertext", async () => {
    const { encryptSecret, decryptSecret } = await loadCrypto({
      TOKEN_KMS_KEY_RESOURCE: "",
      LOCAL_DEV_ENCRYPTION_KEY: DEV_KEY,
    });
    const ciphertext = await encryptSecret("secret");
    const raw = Buffer.from(ciphertext.slice("local:".length), "base64");
    raw[raw.length - 1] ^= 0xff;
    await expect(decryptSecret("local:" + raw.toString("base64"))).rejects.toThrow();
  });

  it("refuses local-key encryption in production", async () => {
    const { encryptSecret } = await loadCrypto({
      TOKEN_KMS_KEY_RESOURCE: "",
      LOCAL_DEV_ENCRYPTION_KEY: DEV_KEY,
      NODE_ENV: "production",
    });
    await expect(encryptSecret("secret")).rejects.toThrow(/TOKEN_KMS_KEY_RESOURCE/);
  });

  it("fails clearly when no encryption is configured at all", async () => {
    const { encryptSecret } = await loadCrypto({
      TOKEN_KMS_KEY_RESOURCE: "",
      LOCAL_DEV_ENCRYPTION_KEY: "",
    });
    await expect(encryptSecret("secret")).rejects.toThrow(/No encryption configured/);
  });
});
