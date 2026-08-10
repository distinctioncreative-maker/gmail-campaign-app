import { AUDIT_ACTIONS, type AuditAction } from "@/schemas/audit";

/**
 * How each audited action is presented.
 *
 * Pure, and imported by client code, so it holds no server-only dependency. The
 * three things here are a label, a category, and a weight.
 *
 * The weight exists because an audit log is only useful if the serious entries
 * are findable in it. A workspace rename and a switch to live sending are not
 * equally interesting, and a flat list where both look identical is a list
 * somebody scrolls past. It is a presentation concern only: nothing is filtered
 * out or hidden on the basis of it, because the entry a reviewer needs is
 * occasionally the boring one.
 */

export type AuditCategory = "SENDING" | "ACCESS" | "MAILBOX" | "CREDENTIALS" | "DATA" | "IDENTITY";

/** How much attention an entry deserves at a glance. */
export type AuditWeight = "CRITICAL" | "NOTABLE" | "ROUTINE";

interface ActionDefinition {
  label: string;
  category: AuditCategory;
  weight: AuditWeight;
}

const DEFINITIONS: Record<AuditAction, ActionDefinition> = {
  // Going live starts sending real mail to real people from a real mailbox.
  // Nothing else in this list is harder to take back.
  "sending.mode_changed": { label: "Sending mode changed", category: "SENDING", weight: "CRITICAL" },
  "sending.ai_writing_changed": {
    label: "AI writing changed",
    category: "SENDING",
    weight: "ROUTINE",
  },
  "sending.tracking_domain_changed": {
    label: "Tracking domain changed",
    category: "SENDING",
    weight: "NOTABLE",
  },
  "member.role_changed": { label: "Role changed", category: "ACCESS", weight: "NOTABLE" },
  "member.deactivated": { label: "Member deactivated", category: "ACCESS", weight: "NOTABLE" },
  "member.reactivated": { label: "Member reactivated", category: "ACCESS", weight: "NOTABLE" },
  "invite.created": { label: "Invitation sent", category: "ACCESS", weight: "ROUTINE" },
  "invite.revoked": { label: "Invitation revoked", category: "ACCESS", weight: "ROUTINE" },
  "gmail.connected": { label: "Gmail connected", category: "MAILBOX", weight: "NOTABLE" },
  "gmail.disconnected": { label: "Gmail disconnected", category: "MAILBOX", weight: "NOTABLE" },
  // A key or an endpoint is standing access to the workspace's data from
  // outside it, and unlike a member it does not appear on the Team page.
  "apikey.created": { label: "API key created", category: "CREDENTIALS", weight: "CRITICAL" },
  "apikey.revoked": { label: "API key revoked", category: "CREDENTIALS", weight: "NOTABLE" },
  "webhook.created": { label: "Webhook added", category: "CREDENTIALS", weight: "CRITICAL" },
  "webhook.deleted": { label: "Webhook removed", category: "CREDENTIALS", weight: "NOTABLE" },
  "webhook.enabled": { label: "Webhook turned on", category: "CREDENTIALS", weight: "ROUTINE" },
  "webhook.disabled": { label: "Webhook turned off", category: "CREDENTIALS", weight: "ROUTINE" },
  "data.exported": { label: "Data exported", category: "DATA", weight: "CRITICAL" },
  "account.deletion_requested": {
    label: "Deletion scheduled",
    category: "DATA",
    weight: "CRITICAL",
  },
  "account.deletion_cancelled": {
    label: "Deletion cancelled",
    category: "DATA",
    weight: "NOTABLE",
  },
  "session.revoked_everywhere": {
    label: "Signed out everywhere",
    category: "ACCESS",
    weight: "NOTABLE",
  },
  "workspace.renamed": { label: "Workspace renamed", category: "IDENTITY", weight: "ROUTINE" },
};

export function auditLabel(action: string): string {
  return DEFINITIONS[action as AuditAction]?.label ?? action;
}

export function auditCategory(action: string): AuditCategory | null {
  return DEFINITIONS[action as AuditAction]?.category ?? null;
}

export function auditWeight(action: string): AuditWeight {
  // An action the catalog does not recognise reads as NOTABLE rather than
  // ROUTINE. A stored entry could name an action from a newer or older
  // deployment, and quietly presenting the unknown as unimportant is the wrong
  // way round for a security log.
  return DEFINITIONS[action as AuditAction]?.weight ?? "NOTABLE";
}

export const AUDIT_CATEGORIES: AuditCategory[] = [
  "SENDING",
  "ACCESS",
  "MAILBOX",
  "CREDENTIALS",
  "DATA",
  "IDENTITY",
];

export const CATEGORY_LABELS: Record<AuditCategory, string> = {
  SENDING: "Sending",
  ACCESS: "Access",
  MAILBOX: "Mailboxes",
  CREDENTIALS: "Keys and webhooks",
  DATA: "Data",
  IDENTITY: "Workspace",
};

/** Every action the catalog covers, for the filter UI and for the test that
 * asserts the two lists have not drifted apart. */
export function allAuditActions(): AuditAction[] {
  return [...AUDIT_ACTIONS];
}
