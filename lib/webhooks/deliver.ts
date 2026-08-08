import "server-only";
import { reportError } from "@/lib/observability/report";
import { enqueueTask } from "@/lib/tasks/enqueue";
import {
  DELIVERY_HEADER,
  EVENT_HEADER,
  SIGNATURE_HEADER,
  TIMESTAMP_HEADER,
  signWebhook,
} from "./signature";
import {
  decideRetry,
  describeAttempt,
  shouldDisableAfterFailures,
  AUTO_DISABLE_AFTER_FAILURES,
  type AttemptResult,
} from "./retry";
import {
  disableWebhookEndpoint,
  getDelivery,
  getWebhookEndpoint,
  recordEndpointAttempt,
  updateDelivery,
} from "./store";

/**
 * Making the outbound request.
 *
 * This is where the residual risk documented in lib/webhooks/target.ts comes
 * due. Validation happened when the URL was stored; the hostname resolves here,
 * minutes or months later, and nothing about a name that looked public then can
 * promise it still points somewhere public now. Three things narrow that:
 *
 * **Redirects are not followed.** `redirect: "manual"` turns a 3xx into an
 * ordinary failed response. A followed redirect would let anyone with a
 * subscription aim our server wherever they liked simply by returning a
 * Location header, which would make the URL validation decorative.
 *
 * **The response body is never read, stored, or shown.** Only the status code
 * leaves this function. Server-side request forgery is only fully useful when
 * the attacker can see the response; a delivery log that echoed bodies back
 * would turn every endpoint into a read primitive against our private network.
 * That is also why a failed delivery reports a status and not "what the server
 * said", which is less helpful than it could be and is the right trade.
 *
 * **Every request is bounded.** A receiver that accepts the connection and
 * never answers would otherwise hold a worker until the platform kills it.
 */

/** Long enough for a cold serverless receiver, short enough to fail fast. */
const TIMEOUT_MS = 10_000;

export async function postDelivery(input: {
  url: string;
  secret: string;
  event: string;
  deliveryId: string;
  body: string;
  timeoutMs?: number;
  nowMs?: number;
  fetchImpl?: typeof fetch;
}): Promise<{ status: number | null }> {
  const timestampSeconds = Math.floor((input.nowMs ?? Date.now()) / 1000);
  const signature = signWebhook(input.secret, timestampSeconds, input.body);
  const doFetch = input.fetchImpl ?? fetch;

  try {
    const res = await doFetch(input.url, {
      method: "POST",
      redirect: "manual",
      signal: AbortSignal.timeout(input.timeoutMs ?? TIMEOUT_MS),
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "Cadence-Webhooks/1",
        [SIGNATURE_HEADER]: signature,
        [TIMESTAMP_HEADER]: String(timestampSeconds),
        [EVENT_HEADER]: input.event,
        [DELIVERY_HEADER]: input.deliveryId,
      },
      body: input.body,
    });
    return { status: res.status };
  } catch {
    // DNS failure, refused connection, TLS mismatch, timeout. No status, and
    // deliberately no detail: the message could carry the resolved address.
    return { status: null };
  }
}

/**
 * One attempt at one delivery, including what happens next.
 *
 * Idempotent on a settled delivery, because Cloud Tasks may dispatch the same
 * task twice and re-posting an already-delivered event would look like a
 * duplicate to the receiver.
 */
export async function runDelivery(
  organizationId: string,
  deliveryId: string,
  options: { fetchImpl?: typeof fetch } = {}
): Promise<{ outcome: string; status: number | null }> {
  const delivery = await getDelivery(organizationId, deliveryId);
  if (!delivery) return { outcome: "MISSING", status: null };
  if (delivery.status === "DELIVERED" || delivery.status === "FAILED") {
    return { outcome: delivery.status, status: delivery.lastStatus };
  }

  const endpoint = await getWebhookEndpoint(organizationId, delivery.endpointId);
  if (!endpoint || !endpoint.enabled) {
    // Settled rather than retried: the subscription was removed or turned off
    // after this event was queued, and the answer to "should we send it" is now
    // no. Recorded so the deliveries list explains the gap.
    await updateDelivery(organizationId, deliveryId, {
      attempt: delivery.attempt,
      status: "FAILED",
      lastStatus: null,
      historyLine: endpoint
        ? "Not sent: the subscription was turned off before this delivery ran."
        : "Not sent: the subscription was deleted before this delivery ran.",
      nextAttemptAt: null,
      priorHistory: delivery.history,
    });
    return { outcome: "CANCELLED", status: null };
  }

  const attempt = delivery.attempt + 1;
  const { status } = await postDelivery({
    url: endpoint.url,
    secret: endpoint.signingSecret,
    event: delivery.event,
    deliveryId: delivery.deliveryId,
    body: delivery.body,
    fetchImpl: options.fetchImpl,
  });

  const result: AttemptResult = { status, attempt };
  const decision = decideRetry(result);

  const consecutive = await recordEndpointAttempt(organizationId, endpoint.endpointId, {
    status,
    delivered: decision.outcome === "DELIVERED",
  });

  const terminal =
    decision.outcome === "DELIVERED"
      ? "DELIVERED"
      : decision.outcome === "RETRY"
        ? "RETRYING"
        : "FAILED";

  await updateDelivery(organizationId, deliveryId, {
    attempt,
    status: terminal,
    lastStatus: status,
    historyLine: describeAttempt(result, decision),
    nextAttemptAt: decision.outcome === "RETRY" ? Date.now() + decision.delayMs : null,
    priorHistory: delivery.history,
  });

  if (decision.outcome === "DISABLED") {
    await disableWebhookEndpoint(organizationId, endpoint.endpointId, decision.reason);
  } else if (decision.outcome !== "DELIVERED" && shouldDisableAfterFailures(consecutive)) {
    await disableWebhookEndpoint(
      organizationId,
      endpoint.endpointId,
      `Turned off after ${AUTO_DISABLE_AFTER_FAILURES} deliveries in a row failed. Fix the endpoint and switch it back on.`
    );
  }

  if (decision.outcome === "RETRY") {
    await scheduleRetry(organizationId, endpoint.createdByUserId, deliveryId, decision.delayMs);
  }

  return { outcome: decision.outcome, status };
}

async function scheduleRetry(
  organizationId: string,
  ownerUserId: string,
  deliveryId: string,
  delayMs: number
): Promise<void> {
  try {
    await enqueueTask(
      "webhook-delivery",
      { organizationId, ownerUserId, deliveryId },
      Date.now() + delayMs
    );
  } catch (err) {
    // The delivery keeps its RETRYING status and its nextAttemptAt, so a failed
    // enqueue is visible in the card rather than silently final.
    reportError(err, { scope: "webhooks.retry", kind: "enqueue" });
  }
}
