import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  AUDIT_ACTIONS,
  AuditActionSchema,
  AuditEntrySchema,
  type AuditAction,
} from "@/schemas/audit";
import {
  AUDIT_CATEGORIES,
  CATEGORY_LABELS,
  allAuditActions,
  auditCategory,
  auditLabel,
  auditWeight,
} from "@/lib/audit/actions";

const VALID = {
  entryId: "e-1",
  organizationId: "org-1",
  action: "sending.mode_changed",
  actorUserId: "u-1",
  actorEmail: "admin@example.com",
  subject: "",
  summary: "admin@example.com switched the workspace to live sending.",
  details: { from: "TEST", to: "LIVE" },
  at: 1_700_000_000_000,
};

describe("the audit entry", () => {
  it("accepts a well-formed entry", () => {
    const entry = AuditEntrySchema.parse(VALID);
    expect(entry.action).toBe("sending.mode_changed");
    expect(entry.details.to).toBe("LIVE");
  });

  it("requires an actor email, not just an id", () => {
    // An entry naming only "u_9fA2..." answers nobody's question, and after the
    // member is removed there is no document left to resolve it against.
    expect(() => AuditEntrySchema.parse({ ...VALID, actorEmail: "" })).toThrow();
  });

  it("requires a summary, because the action name alone is not a sentence", () => {
    expect(() => AuditEntrySchema.parse({ ...VALID, summary: "" })).toThrow();
  });

  it("refuses an action outside the catalog", () => {
    // A free-string action drifts into three spellings of the same event, and a
    // log you cannot filter reliably is a log nobody reads.
    expect(() => AuditEntrySchema.parse({ ...VALID, action: "sending.went_live" })).toThrow();
  });

  it("keeps details to scalars", () => {
    // A nested payload here would turn the audit log into a second copy of the
    // data deletion exists to destroy.
    expect(() =>
      AuditEntrySchema.parse({ ...VALID, details: { lead: { email: "a@b.com" } } })
    ).toThrow();
    expect(() => AuditEntrySchema.parse({ ...VALID, details: { list: ["a"] } })).toThrow();
  });

  it("allows null in details, so an absent prior value is expressible", () => {
    const entry = AuditEntrySchema.parse({ ...VALID, details: { from: null, to: "ADMIN" } });
    expect(entry.details.from).toBeNull();
  });

  it("defaults subject and details so an older stored entry still parses", () => {
    const { subject: _s, details: _d, ...withoutOptional } = VALID;
    const entry = AuditEntrySchema.parse(withoutOptional);
    expect(entry.subject).toBe("");
    expect(entry.details).toEqual({});
  });

  it("bounds the summary so one entry cannot carry an email body", () => {
    expect(() => AuditEntrySchema.parse({ ...VALID, summary: "x".repeat(401) })).toThrow();
  });
});

describe("the action catalog", () => {
  it("describes every action the schema allows", () => {
    // A stored action with no definition would render as a raw identifier in the
    // one surface a security review reads.
    for (const action of AUDIT_ACTIONS) {
      expect(auditLabel(action), action).not.toBe(action);
      expect(auditCategory(action), action).not.toBeNull();
    }
  });

  it("stays in sync with the schema enum", () => {
    expect([...allAuditActions()].sort()).toEqual([...AuditActionSchema.options].sort());
  });

  it("puts every action in a category the filter offers", () => {
    for (const action of AUDIT_ACTIONS) {
      const category = auditCategory(action);
      expect(AUDIT_CATEGORIES, action).toContain(category);
      expect(CATEGORY_LABELS[category!], action).toBeTruthy();
    }
  });

  it("treats going live, keys, webhooks, exports, and deletion as the serious ones", () => {
    // The log is only useful if the entries that matter are findable in it.
    for (const action of [
      "sending.mode_changed",
      "apikey.created",
      "webhook.created",
      "data.exported",
      "account.deletion_requested",
    ] as AuditAction[]) {
      expect(auditWeight(action), action).toBe("CRITICAL");
    }
  });

  it("reads an unknown action as notable rather than routine", () => {
    // A stored entry could name an action from another deployment. Quietly
    // presenting the unknown as unimportant is the wrong way round for a
    // security log.
    expect(auditWeight("something.new")).toBe("NOTABLE");
    expect(auditLabel("something.new")).toBe("something.new");
  });
});

describe("the write sites", () => {
  /** Every route handler, keyed by URL-shaped path. */
  function routes(): { id: string; source: string }[] {
    const found: { id: string; source: string }[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) walk(path);
        else if (entry.name === "route.ts") {
          found.push({ id: dir.replace(/^app\//, ""), source: readFileSync(path, "utf8") });
        }
      }
    };
    walk("app");
    return found;
  }

  /** The actions that must be recorded, and where from. If one of these routes
   * stops writing its entry, the log silently loses an event and nothing else in
   * the suite would notice. */
  const REQUIRED: Record<string, string> = {
    "api/admin/sending-mode": "sending.mode_changed",
    "api/admin/members": "member.role_changed",
    "api/admin/ai-writing": "sending.ai_writing_changed",
    "api/admin/workspace": "workspace.renamed",
    "api/invites": "invite.created",
    "api/gmail/callback": "gmail.connected",
    "api/gmail/disconnect": "gmail.disconnected",
    "api/account/export": "data.exported",
    "api/account/deletion": "account.deletion_requested",
    "api/account/sessions": "session.revoked_everywhere",
    "api/api-keys": "apikey.created",
    "api/webhooks": "webhook.created",
    "api/tracking-domain": "sending.tracking_domain_changed",
  };

  const all = routes();

  it("finds the route tree", () => {
    expect(all.length).toBeGreaterThan(40);
  });

  it("records the action at each site that performs it", () => {
    const missing = Object.entries(REQUIRED).filter(([id, action]) => {
      const route = all.find((r) => r.id === id);
      // A moved or renamed route is a failure too: the list is then wrong.
      return !route || !route.source.includes(`"${action}"`);
    });
    expect(missing.map(([id]) => id)).toEqual([]);
  });

  it("goes through recordAudit rather than writing the collection directly", () => {
    // A route touching the collection itself could update or delete an entry,
    // which is the one thing an append-only log must not permit.
    const direct = all
      .filter(({ source }) => source.includes('collection("auditLog")'))
      .map(({ id }) => id);
    expect(direct).toEqual([]);
  });

  it("exposes no way for a client to write history", () => {
    // The read route is deliberately GET-only. A POST here would let a caller
    // append entries, and an audit log anyone can write is not evidence.
    const audit = all.find((r) => r.id === "api/admin/audit");
    expect(audit).toBeDefined();
    expect(audit!.source).toContain("export const GET");
    for (const method of ["export const POST", "export const PATCH", "export const DELETE", "export const PUT"]) {
      expect(audit!.source, method).not.toContain(method);
    }
  });

  it("keeps the log admin-only", () => {
    expect(all.find((r) => r.id === "api/admin/audit")!.source).toContain('requireRole("ADMIN")');
  });
});
