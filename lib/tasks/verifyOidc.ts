import "server-only";
import { OAuth2Client } from "google-auth-library";
import { env } from "@/lib/env";

const verifier = new OAuth2Client();

export class TaskAuthError extends Error {
  constructor(message = "Unauthorized task request") {
    super(message);
  }
}

/**
 * Verify a Cloud Tasks / Cloud Scheduler OIDC identity token: Google-signed,
 * audience matches our worker audience, and the caller is our tasks service
 * account. Workers must call this before touching any data.
 */
export async function verifyTaskRequest(req: Request): Promise<void> {
  const header = req.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) throw new TaskAuthError("Missing bearer token");

  const audience = env.CLOUD_TASKS_WORKER_AUDIENCE || env.APP_BASE_URL;
  let email: string | undefined;
  try {
    const ticket = await verifier.verifyIdToken({ idToken: token, audience });
    const payload = ticket.getPayload();
    email = payload?.email;
    if (payload?.iss !== "https://accounts.google.com" && payload?.iss !== "accounts.google.com") {
      throw new TaskAuthError("Unexpected issuer");
    }
  } catch (err) {
    throw new TaskAuthError(err instanceof Error ? err.message : "Token verification failed");
  }

  if (!email || email !== env.CLOUD_TASKS_SERVICE_ACCOUNT) {
    throw new TaskAuthError("Caller is not the tasks service account");
  }
}
