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
  TEST_MODE: z.string().default("true"),
  TEST_EMAIL_DESTINATION: z.string().default(""),
  NODE_ENV: z.string().default("development"),
});

export const env = EnvSchema.parse(process.env);

/** Real sending is opt-out: anything but the literal string "false" keeps test mode on. */
export function isTestMode(): boolean {
  return env.TEST_MODE.toLowerCase() !== "false";
}
