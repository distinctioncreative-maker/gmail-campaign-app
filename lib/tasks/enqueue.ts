import "server-only";
import type { CloudTasksClient } from "@google-cloud/tasks";
import { env } from "@/lib/env";

// The @google-cloud/tasks client pulls in a heavy gRPC/protobuf stack. Import
// it lazily and only when Cloud Tasks is actually configured, so routes that
// merely reference this module (e.g. the campaign launch route) don't load it
// on every request — which on a small Cloud Run instance can spike memory and
// get the container OOM-killed mid-request (surfacing as a bare 500).
let client: CloudTasksClient | undefined;
async function tasks(): Promise<CloudTasksClient> {
  if (!client) {
    const { CloudTasksClient: Ctor } = await import("@google-cloud/tasks");
    client = new Ctor();
  }
  return client;
}

export type WorkerPath =
  | "send-message"
  | "reply-check"
  | "bounce-check";

export interface TaskPayload {
  organizationId: string;
  ownerUserId: string;
  campaignId?: string;
  queueItemId?: string;
  [key: string]: unknown;
}

/** True when Cloud Tasks is configured; otherwise callers fall back to
 * local in-process scheduling (dev only). */
export function tasksConfigured(): boolean {
  return Boolean(
    env.GOOGLE_CLOUD_PROJECT_ID &&
      env.CLOUD_TASKS_QUEUE &&
      env.CLOUD_TASKS_SERVICE_ACCOUNT &&
      env.APP_BASE_URL.startsWith("https://")
  );
}

/**
 * Schedule an HTTP task hitting our worker route at `scheduleAtMs`.
 * Payload carries only IDs — never lead data or tokens (spec §14).
 */
export async function enqueueTask(
  path: WorkerPath,
  payload: TaskPayload,
  scheduleAtMs: number
): Promise<string | null> {
  if (!tasksConfigured()) {
    console.warn("[tasks] Cloud Tasks not configured; task not enqueued", { path });
    return null;
  }

  const client = await tasks();
  const parent = client.queuePath(
    env.GOOGLE_CLOUD_PROJECT_ID,
    env.GOOGLE_CLOUD_REGION,
    env.CLOUD_TASKS_QUEUE
  );

  const [task] = await client.createTask(
    {
      parent,
      task: {
        scheduleTime: { seconds: Math.floor(scheduleAtMs / 1000) },
        httpRequest: {
          httpMethod: "POST",
          url: `${env.APP_BASE_URL}/api/tasks/${path}`,
          headers: { "Content-Type": "application/json" },
          body: Buffer.from(JSON.stringify(payload)).toString("base64"),
          oidcToken: {
            serviceAccountEmail: env.CLOUD_TASKS_SERVICE_ACCOUNT,
            audience: env.CLOUD_TASKS_WORKER_AUDIENCE || env.APP_BASE_URL,
          },
        },
      },
    },
    // Bound the call so a misconfigured queue can't hang the request.
    { timeout: 15_000 }
  );

  return task.name ?? null;
}

/** Best-effort delete of a not-yet-dispatched task (cancellation path).
 * Workers still re-check state — this is an optimization, not a guarantee. */
export async function deleteTask(cloudTaskName: string): Promise<void> {
  if (!tasksConfigured()) return;
  try {
    const client = await tasks();
    await client.deleteTask({ name: cloudTaskName }, { timeout: 15_000 });
  } catch {
    // Already dispatched or gone — the worker's re-check handles it.
  }
}
