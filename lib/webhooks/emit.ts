import "server-only";
import { reportError } from "@/lib/observability/report";
import { enqueueTask, tasksConfigured } from "@/lib/tasks/enqueue";
import {
  WEBHOOK_TEST_EVENT,
  type WebhookDeliveryEvent,
  type WebhookEvent,
} from "@/schemas/integration";
import { buildEnvelope, serializeEnvelope } from "./payload";
import { createDelivery, getWebhookEndpoint, newDeliveryId, subscribersFor } from "./store";
import { runDelivery } from "./deliver";

/**
 * Emitting an event.
 *
 * Called from inside the reply sweep, the bounce sweep, the unsubscribe route,
 * and the outcome route, which is to say from four places whose actual job is
 * something else. That shapes the contract:
 *
 * **It never throws.** A webhook is a courtesy to an external system. A
 * customer's reply must still be recorded, their follow-ups still stopped, and
 * their unsubscribe still honoured if a subscription is misconfigured or
 * Firestore hiccups. Every failure here is reported and swallowed.
 *
 * **It never waits for the receiver.** Emission writes a delivery document and
 * queues a task. The HTTP request to someone else's server happens in the
 * worker, so a slow endpoint cannot slow down a sweep, and a retry two minutes
 * later has somewhere durable to resume from.
 */

export interface EmitTarget {
  organizationId: string;
  /** Carried on the task payload only. Deliveries are org-scoped. */
  ownerUserId: string;
}

export async function emitWebhookEvent(
  target: EmitTarget,
  event: WebhookEvent,
  data: Record<string, unknown>
): Promise<number> {
  try {
    const endpoints = await subscribersFor(target.organizationId, event);
    // The common case, and the reason listWebhookEndpoints is cached: no
    // subscriptions means no writes and no queue work.
    if (endpoints.length === 0) return 0;

    let queued = 0;
    for (const endpoint of endpoints) {
      const ok = await queueDelivery({
        organizationId: target.organizationId,
        ownerUserId: target.ownerUserId,
        endpointId: endpoint.endpointId,
        url: endpoint.url,
        event,
        data,
      });
      if (ok) queued += 1;
    }
    return queued;
  } catch (err) {
    reportError(err, { scope: "webhooks.emit", kind: event });
    return 0;
  }
}

/** The test ping, which targets one subscription and bypasses its event list:
 * the point is to prove signing and reachability before any real event exists to
 * subscribe to. */
export async function emitTestPing(
  target: EmitTarget,
  endpointId: string,
  data: Record<string, unknown>
): Promise<boolean> {
  const endpoint = await getWebhookEndpoint(target.organizationId, endpointId);
  if (!endpoint) return false;
  return queueDelivery({
    organizationId: target.organizationId,
    ownerUserId: target.ownerUserId,
    endpointId,
    url: endpoint.url,
    event: WEBHOOK_TEST_EVENT,
    data,
  });
}

async function queueDelivery(input: {
  organizationId: string;
  ownerUserId: string;
  endpointId: string;
  url: string;
  event: WebhookDeliveryEvent;
  data: Record<string, unknown>;
}): Promise<boolean> {
  const now = Date.now();
  // One id for the delivery and for the event inside it, so a receiver that
  // deduplicates on `id` sees a single event across every retry of it.
  const deliveryId = newDeliveryId();
  const body = serializeEnvelope(
    buildEnvelope({
      deliveryId,
      event: input.event,
      organizationId: input.organizationId,
      occurredAt: now,
      data: input.data,
    })
  );
  await createDelivery({
    deliveryId,
    organizationId: input.organizationId,
    endpointId: input.endpointId,
    url: input.url,
    event: input.event,
    body,
  });

  if (!tasksConfigured()) {
    // Local development: there is no queue, so deliver in the background and
    // accept that a retry will not be scheduled. The delivery document still
    // records what happened.
    void runDelivery(input.organizationId, deliveryId).catch(() => {
      /* Recorded on the delivery document. */
    });
    return true;
  }

  const name = await enqueueTask(
    "webhook-delivery",
    { organizationId: input.organizationId, ownerUserId: input.ownerUserId, deliveryId },
    now
  );
  return name !== null;
}
