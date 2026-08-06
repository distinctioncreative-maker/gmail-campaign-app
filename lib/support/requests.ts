import "server-only";
import crypto from "node:crypto";
import { firestore } from "@/lib/firebase/admin";
import { env } from "@/lib/env";
import { getOrgSettings } from "@/lib/repositories/orgSettings";
import { getConnectionPublic } from "@/lib/repositories/gmailConnections";
import type { AuthContext } from "@/lib/auth/requireUser";
import { redactErrorMessage } from "@/lib/observability/report";
import {
  describeCategory,
  supportReference,
  type SupportCategory,
} from "./contact";

/**
 * What the customer already told us by being signed in.
 *
 * Most of a support round trip is spent establishing which workspace, which
 * plan, test mode or live, Gmail connected or not, and which deploy. Asking
 * for it is the product wasting the customer's time when it holds every
 * answer already. Collected server-side so a client cannot claim to be on a
 * plan it is not on, which would send us debugging the wrong thing.
 *
 * Deliberately excluded: anything from the mailbox, any lead, any recipient,
 * and the Gmail refresh token. A support ticket is not a reason to copy a
 * customer's data somewhere new. `getConnectionPublic` drops the token; the
 * connected address stays because "which inbox" is the first question of any
 * sending problem.
 */
export interface SupportDiagnostics {
  organizationId: string;
  userId: string;
  role: string;
  plan: string;
  subscriptionStatus: string;
  sendingMode: "TEST" | "LIVE";
  gmailConnected: boolean;
  gmailAddress: string;
  gmailStatus: string;
  /** Cloud Run revision, so a report can be tied to a specific deploy. */
  revision: string;
  userAgent: string;
  reportedFrom: string;
}

export async function collectDiagnostics(
  ctx: AuthContext,
  req: { userAgent: string; reportedFrom: string }
): Promise<SupportDiagnostics> {
  // Neither read is allowed to sink the request: a customer reporting that
  // something is broken must not be blocked by that same broken thing.
  const [settings, connection] = await Promise.all([
    getOrgSettings(ctx.organizationId).catch(() => null),
    getConnectionPublic(ctx.userId).catch(() => null),
  ]);

  return {
    organizationId: ctx.organizationId,
    userId: ctx.userId,
    role: ctx.role,
    plan: settings?.billing.plan ?? "unknown",
    subscriptionStatus: settings?.billing.status ?? "unknown",
    sendingMode: settings?.sendingMode ?? "TEST",
    gmailConnected: connection !== null,
    gmailAddress: connection?.connectedEmail ?? "",
    gmailStatus: connection?.status ?? "none",
    revision: process.env.K_REVISION ?? "local",
    userAgent: req.userAgent.slice(0, 300),
    reportedFrom: req.reportedFrom.slice(0, 200),
  };
}

export interface SupportRequestRecord {
  reference: string;
  category: SupportCategory;
  subject: string;
  message: string;
  replyTo: string;
  status: "OPEN";
  createdAt: number;
  diagnostics: SupportDiagnostics;
}

/**
 * Record a request and notify, in that order.
 *
 * Firestore first because it is the durable copy: a webhook that fails must
 * not lose the customer's message. Top-level `supportRequests` rather than an
 * org subcollection, because whoever answers these reads across every
 * workspace and the collection is server-only either way (firestore.rules
 * denies it under the catch-all).
 */
export async function recordSupportRequest(
  ctx: AuthContext,
  input: {
    category: SupportCategory;
    subject: string;
    message: string;
    replyTo: string;
    diagnostics: SupportDiagnostics;
  }
): Promise<SupportRequestRecord> {
  const reference = supportReference(crypto.randomBytes(8).toString("hex"));
  const record: SupportRequestRecord = {
    reference,
    category: input.category,
    subject: input.subject,
    message: input.message,
    replyTo: input.replyTo,
    status: "OPEN",
    createdAt: Date.now(),
    diagnostics: input.diagnostics,
  };

  await firestore().collection("supportRequests").doc(reference).set(record);
  notify(record);
  return record;
}

/**
 * Best-effort ping so a request does not sit unseen in a collection nobody
 * opens. Never awaited and never throws: the customer's message is already
 * saved, and a Slack outage is not their problem.
 *
 * The body is redacted with the same helper the error reporter uses. A support
 * message routinely contains a customer's own address, and a webhook sink is
 * usually a chat room with a wider audience than the ticket itself.
 */
function notify(record: SupportRequestRecord): void {
  const url = env.SUPPORT_WEBHOOK_URL.trim();
  if (!url) return;
  const text = [
    `📮 ${record.reference}: ${describeCategory(record.category)}`,
    redactErrorMessage(record.subject).slice(0, 200),
    `${record.diagnostics.plan} plan, ${record.diagnostics.sendingMode} mode, revision ${record.diagnostics.revision}`,
  ].join("\n");
  void fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  }).catch(() => {
    /* Best-effort: the durable copy is already written. */
  });
}
