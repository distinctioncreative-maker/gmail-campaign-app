import { z } from "zod";

const EnvSchema = z.object({
  GOOGLE_CLOUD_PROJECT_ID: z.string().default(""),
  GOOGLE_CLOUD_REGION: z.string().default("us-central1"),
  FIREBASE_PROJECT_ID: z.string().default(""),
  GOOGLE_OAUTH_CLIENT_ID: z.string().default(""),
  GOOGLE_OAUTH_CLIENT_SECRET: z.string().default(""),
  GOOGLE_OAUTH_REDIRECT_URI: z.string().default("http://localhost:3000/api/gmail/callback"),
  ALLOWED_GOOGLE_WORKSPACE_DOMAIN: z.string().default(""),
  SESSION_SECRET: z.string().default(""),
  TOKEN_KMS_KEY_RESOURCE: z.string().default(""),
  LOCAL_DEV_ENCRYPTION_KEY: z.string().default(""),
  CLOUD_TASKS_QUEUE: z.string().default("campaign-sends"),
  CLOUD_TASKS_SERVICE_ACCOUNT: z.string().default(""),
  CLOUD_TASKS_WORKER_AUDIENCE: z.string().default(""),
  APP_BASE_URL: z.string().default("http://localhost:3000"),
  DEFAULT_ORGANIZATION_NAME: z.string().default("My Organization"),
  // Optional deployment-level lock: when "true", the app is forced into
  // test mode and the in-app live switch is disabled (use on staging).
  // Production leaves this unset so an admin controls sending in-app.
  FORCE_TEST_MODE: z.string().default(""),
  // Legacy: still read as a lock for backward compatibility.
  TEST_MODE: z.string().default(""),
  TEST_EMAIL_DESTINATION: z.string().default(""),
  NODE_ENV: z.string().default("development"),
});

export const env = EnvSchema.parse(process.env);

/** Deployment-level test-mode lock. When true, no in-app toggle can enable
 * real sending. Both FORCE_TEST_MODE and the legacy TEST_MODE=true act as
 * locks. */
export function envForcesTestMode(): boolean {
  return (
    env.FORCE_TEST_MODE.toLowerCase() === "true" ||
    env.TEST_MODE.toLowerCase() === "true"
  );
}
