import "server-only";
import { CloudTasksClient } from "@google-cloud/tasks";
import { env } from "@/lib/env";

let client: CloudTasksClient | undefined;
function tasks(): CloudTasksClient {
  client ??= new CloudTasksClient();
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

  const parent = tasks().queuePath(
    env.GOOGLE_CLOUD_PROJECT_ID,
    env.GOOGLE_CLOUD_REGION,
    env.CLOUD_TASKS_QUEUE
  );

  const [task] = await tasks().createTask({
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
  });

  return task.name ?? null;
}

/** Best-effort delete of a not-yet-dispatched task (cancellation path).
 * Workers still re-check state — this is an optimization, not a guarantee. */
export async function deleteTask(cloudTaskName: string): Promise<void> {
  if (!tasksConfigured()) return;
  try {
    await tasks().deleteTask({ name: cloudTaskName });
  } catch {
    // Already dispatched or gone — the worker's re-check handles it.
  }
}
