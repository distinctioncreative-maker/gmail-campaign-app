import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { verifyTaskRequest, TaskAuthError } from "@/lib/tasks/verifyOidc";
import { runDelivery } from "@/lib/webhooks/deliver";
import { reportError } from "@/lib/observability/report";

/**
 * Deliver one webhook event.
 *
 * A Cloud Tasks worker rather than part of the request that produced the event,
 * for the same reason sending is: the work involves someone else's server, and
 * a retry an hour later needs a durable place to resume from.
 *
 * A delivery that ran and failed still answers 200. Returning a non-2xx would
 * make Cloud Tasks retry on its own schedule on top of the schedule in
 * lib/webhooks/retry.ts, and the two would compound into far more requests at a
 * struggling endpoint than either intended. Whether to retry a failed *delivery*
 * is ours to decide, so the queue is told the task itself succeeded.
 *
 * A delivery that could not run at all is the opposite case and answers 500, so
 * the queue does retry it: nothing was recorded and our own ladder never
 * engaged, so without the queue the event would sit in RETRYING with no task
 * behind it. That retry can re-post an event whose recording failed after the
 * request went out, which is why the delivery id is the event id: a receiver
 * deduplicating on `id` sees one event.
 */

const PayloadSchema = z.object({
  organizationId: z.string().min(1),
  ownerUserId: z.string().min(1),
  deliveryId: z.string().min(1),
});

export async function POST(req: NextRequest) {
  try {
    await verifyTaskRequest(req);
  } catch (err) {
    const message = err instanceof TaskAuthError ? err.message : "Unauthorized";
    return NextResponse.json({ error: message }, { status: 401 });
  }

  const parsed = PayloadSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    // Malformed payloads are the one case worth failing: a retry cannot fix it,
    // and 400 stops the queue from redelivering it.
    return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
  }

  try {
    const result = await runDelivery(parsed.data.organizationId, parsed.data.deliveryId);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    reportError(err, { scope: "tasks.webhook-delivery" });
    // The delivery never completed a recorded attempt, so let the queue retry
    // it: see the note above on why this case differs from a failed endpoint.
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
