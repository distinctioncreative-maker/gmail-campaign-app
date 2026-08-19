import { z } from "zod";

const EnvSchema = z.object({
  GOOGLE_CLOUD_PROJECT_ID: z.string().default(""),
  GOOGLE_CLOUD_REGION: z.string().default("us-central1"),
  FIREBASE_PROJECT_ID: z.string().default(""),
  GOOGLE_OAUTH_CLIENT_ID: z.string().default(""),
  GOOGLE_OAUTH_CLIENT_SECRET: z.string().default(""),
  GOOGLE_OAUTH_REDIRECT_URI: z.string().default("http://localhost:3000/api/gmail/callback"),
  ALLOWED_GOOGLE_WORKSPACE_DOMAIN: z.string().default(""),
  /**
   * Who may sign in.
   *
   * "allowlist" (default) restricts sign-in to ALLOWED_GOOGLE_WORKSPACE_DOMAIN.
   * In production an empty allowlist fails closed, so a deployment that sets
   * neither refuses everyone, which is the intended safe state rather than a
   * bug to work around.
   *
   * "open" lets any verified Google account sign in. Two consequences are worth
   * knowing before flipping it, because neither is obvious from the value:
   *
   * Consumer addresses (gmail.com and friends) each get a private one-person
   * workspace. That part is uncomplicated.
   *
   * A custom domain gets one shared workspace per domain, and the first person
   * to arrive claims ADMIN of it. Everyone who signs up from that domain
   * afterwards joins that same workspace as a rep. For real colleagues this is
   * the point. For a large employer where two unrelated people happen to sign
   * up, the second lands inside the first one's workspace, under their
   * administration and against their seat count.
   *
   * Billing is now in place, so that half of the old precondition is met. The
   * remaining gate is Google OAuth verification: this app requests
   * gmail.compose and gmail.readonly, which are restricted scopes, so until the
   * app is verified only listed test users can connect at all and their refresh
   * tokens expire after seven days.
   */
  SIGNUP_MODE: z.string().default("allowlist"),
  // Who operates the platform, comma separated. Deliberately configuration
  // rather than a database collection: this is the floor under every other
  // privilege, so it must not be grantable from inside the app. See
  // lib/platform/operators.ts.
  PLATFORM_OWNER_EMAILS: z.string().default(""),
  // Optional alerting sink for unexpected server errors (Slack incoming
  // webhook, Sentry ingest, etc.). Unset = structured console logs only.
  ERROR_WEBHOOK_URL: z.string().default(""),
  // Where customers reach a human. Shown on the public /support page, which is
  // the only path open to someone who cannot sign in, and in the legal footer.
  // Unset is honest rather than broken: the page says the address is not
  // published yet instead of rendering a mailto that goes nowhere.
  SUPPORT_EMAIL: z.union([z.literal(""), z.string().trim().email()]).default(""),
  // Optional notification sink for new support requests (Slack incoming
  // webhook or similar). Unset means requests are recorded in Firestore only,
  // which is fine while someone watches the collection and not fine once
  // customers are paying.
  SUPPORT_WEBHOOK_URL: z.string().default(""),
  // Lead sourcing. Unset means the feature is absent rather than broken: see
  // lib/sourcing/registry.ts. This is the only key in the file that buys
  // something per row, which is why lib/sourcing/quota.ts exists.
  APOLLO_API_KEY: z.string().default(""),
  // Monthly sourcing credits per workspace. A ceiling on our own cost, not a
  // price: nothing bills for these yet.
  SOURCING_MONTHLY_CREDITS: z.coerce.number().int().nonnegative().default(250),
  // Stripe billing. All optional: when STRIPE_SECRET_KEY is unset, billing
  // is a no-op and the pricing UI stays "coming soon".
  STRIPE_SECRET_KEY: z.string().default(""),
  STRIPE_WEBHOOK_SECRET: z.string().default(""),
  STRIPE_PRICE_STARTER: z.string().default(""),
  STRIPE_PRICE_TEAM: z.string().default(""),
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
  TEST_EMAIL_DESTINATION: z
    .union([z.literal(""), z.string().trim().email()])
    .default(""),
  NODE_ENV: z.string().default("development"),
  // Optional AI email writer. Set GEMINI_API_KEY (a free Google AI Studio
  // key) to enable "Write with AI" in the template editor.
  GEMINI_API_KEY: z.string().default(""),
  GEMINI_MODEL: z.string().default("gemini-2.0-flash"),
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
