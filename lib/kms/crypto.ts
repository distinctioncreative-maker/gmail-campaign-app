import "server-only";
import { KeyManagementServiceClient } from "@google-cloud/kms";
import crypto from "node:crypto";
import { env } from "@/lib/env";

/**
 * Refresh-token encryption boundary.
 *
 * Production: Cloud KMS encrypt/decrypt with the configured key resource.
 * Local development (no KMS key configured): AES-256-GCM with
 * LOCAL_DEV_ENCRYPTION_KEY. Production refuses to start sending without KMS.
 *
 * Ciphertexts are prefixed so the decrypt path is unambiguous.
 */

const KMS_PREFIX = "kms:";
const LOCAL_PREFIX = "local:";

let kmsClient: KeyManagementServiceClient | undefined;
function kms(): KeyManagementServiceClient {
  kmsClient ??= new KeyManagementServiceClient();
  return kmsClient;
}

function localKey(): Buffer {
  const raw = env.LOCAL_DEV_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error(
      "No encryption configured: set TOKEN_KMS_KEY_RESOURCE (production) or LOCAL_DEV_ENCRYPTION_KEY (development)."
    );
  }
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new Error("LOCAL_DEV_ENCRYPTION_KEY must be base64 for exactly 32 bytes.");
  }
  return key;
}

export async function encryptSecret(plaintext: string): Promise<string> {
  if (env.TOKEN_KMS_KEY_RESOURCE) {
    const [result] = await kms().encrypt({
      name: env.TOKEN_KMS_KEY_RESOURCE,
      plaintext: Buffer.from(plaintext, "utf8"),
    });
    if (!result.ciphertext) throw new Error("KMS returned empty ciphertext");
    return KMS_PREFIX + Buffer.from(result.ciphertext as Uint8Array).toString("base64");
  }

  if (env.NODE_ENV === "production") {
    throw new Error("TOKEN_KMS_KEY_RESOURCE is required in production.");
  }

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", localKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return LOCAL_PREFIX + Buffer.concat([iv, tag, encrypted]).toString("base64");
}

export async function decryptSecret(ciphertext: string): Promise<string> {
  if (ciphertext.startsWith(KMS_PREFIX)) {
    const [result] = await kms().decrypt({
      name: env.TOKEN_KMS_KEY_RESOURCE,
      ciphertext: Buffer.from(ciphertext.slice(KMS_PREFIX.length), "base64"),
    });
    if (!result.plaintext) throw new Error("KMS returned empty plaintext");
    return Buffer.from(result.plaintext as Uint8Array).toString("utf8");
  }

  if (ciphertext.startsWith(LOCAL_PREFIX)) {
    const buf = Buffer.from(ciphertext.slice(LOCAL_PREFIX.length), "base64");
    const iv = buf.subarray(0, 12);
    const tag = buf.subarray(12, 28);
    const data = buf.subarray(28);
    const decipher = crypto.createDecipheriv("aes-256-gcm", localKey(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
  }

  throw new Error("Unrecognized ciphertext format");
}
