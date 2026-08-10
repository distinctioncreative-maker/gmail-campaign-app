import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth/requireUser";
import { handleApiErrors } from "@/lib/api";
import { WebhookEventSchema } from "@/schemas/integration";
import { validateWebhookTarget } from "@/lib/webhooks/target";
import {
  createWebhookEndpoint,
  deleteWebhookEndpoint,
  listRecentDeliveries,
  listWebhookEndpoints,
  setWebhookEndpointEnabled,
} from "@/lib/webhooks/store";
import { auditActor, recordAudit } from "@/lib/audit/log";

/**
 * Managing webhook subscriptions.
 *
 * Admin-only, like API keys, and for a sharper reason: a subscription decides
 * where a workspace's reply and deal data is sent. Letting any member add one
 * would make data exfiltration a normal-looking feature.
 */
export const GET = handleApiErrors(async () => {
  const ctx = await requireRole("ADMIN");
  const [endpoints, deliveries] = await Promise.all([
    listWebhookEndpoints(ctx.organizationId),
    listRecentDeliveries(ctx.organizationId, 15),
  ]);
  return NextResponse.json({
    endpoints,
    // The signed body is not returned. It is the workspace's own data, but a
    // deliveries panel is a log view, not an export, and the bodies would make
    // it one.
    deliveries: deliveries.map((d) => ({
      deliveryId: d.deliveryId,
      endpointId: d.endpointId,
      event: d.event,
      status: d.status,
      lastStatus: d.lastStatus,
      attempt: d.attempt,
      history: d.history,
      createdAt: d.createdAt,
      nextAttemptAt: d.nextAttemptAt,
    })),
  });
});

const CreateSchema = z.object({
  url: z.string().min(1).max(2000),
  description: z.string().trim().max(120).default(""),
  events: z.array(WebhookEventSchema).min(1),
});

export const POST = handleApiErrors(async (req: NextRequest) => {
  const ctx = await requireRole("ADMIN");
  const input = CreateSchema.parse(await req.json());

  // The security boundary. Everything downstream trusts that a stored URL got
  // through here, so this must run before the write and not beside it.
  const verdict = validateWebhookTarget(input.url);
  if (!verdict.ok) {
    return NextResponse.json({ error: verdict.reason }, { status: 400 });
  }

  const result = await createWebhookEndpoint({
    organizationId: ctx.organizationId,
    createdByUserId: ctx.userId,
    url: verdict.url,
    description: input.description,
    events: input.events,
  });
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  // Same reasoning as an API key, pointed the other way: this decides where
  // the workspace's reply and deal data is sent.
  await recordAudit(auditActor(ctx), {
    action: "webhook.created",
    subject: verdict.url,
    summary: `${ctx.email} added a webhook to ${verdict.url}.`,
    details: { events: input.events.join(" ") },
  });

  return NextResponse.json({
    endpoint: result.endpoint,
    // Shown once, for the same reason an API key is: a receiver needs it to
    // verify signatures, and nothing about storing it in two places makes it
    // safer. Unlike a key, it stays readable here, because verification breaks
    // without it and rotating means re-deploying the receiver.
    signingSecret: result.signingSecret,
    message:
      "Copy the signing secret into your receiver. Deliveries are signed with it, and a receiver that does not check the signature will accept anything.",
  });
});

const ToggleSchema = z.object({
  endpointId: z.string().min(1),
  enabled: z.boolean(),
});

export const PATCH = handleApiErrors(async (req: NextRequest) => {
  const ctx = await requireRole("ADMIN");
  const input = ToggleSchema.parse(await req.json());
  const ok = await setWebhookEndpointEnabled(
    ctx.organizationId,
    input.endpointId,
    input.enabled
  );
  if (!ok) return NextResponse.json({ error: "That subscription does not exist." }, { status: 404 });
  await recordAudit(auditActor(ctx), {
    action: input.enabled ? "webhook.enabled" : "webhook.disabled",
    subject: input.endpointId,
    summary: `${ctx.email} turned a webhook ${input.enabled ? "on" : "off"}.`,
  });
  return NextResponse.json({ ok: true, enabled: input.enabled });
});

const DeleteSchema = z.object({ endpointId: z.string().min(1) });

export const DELETE = handleApiErrors(async (req: NextRequest) => {
  const ctx = await requireRole("ADMIN");
  const { endpointId } = DeleteSchema.parse(await req.json());
  // Scoped to this organization's subcollection, so an id from elsewhere finds
  // nothing rather than deleting someone else's subscription.
  const removed = await deleteWebhookEndpoint(ctx.organizationId, endpointId);
  if (!removed) {
    return NextResponse.json({ error: "That subscription does not exist." }, { status: 404 });
  }
  await recordAudit(auditActor(ctx), {
    action: "webhook.deleted",
    subject: endpointId,
    summary: `${ctx.email} removed a webhook.`,
  });
  return NextResponse.json({
    ok: true,
    message: "Removed. Queued deliveries for it will not be sent.",
  });
});
