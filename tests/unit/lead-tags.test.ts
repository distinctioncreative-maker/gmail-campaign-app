import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ContactPatchSchema } from "@/lib/leads/engagement";
import {
  MAX_CONTACT_TAGS,
  addContactTag,
  normalizeContactTags,
  removeContactTag,
} from "@/lib/leads/tags";
import { ContactSchema } from "@/schemas/contact";

describe("lead tags", () => {
  it("normalizes whitespace, removes case-insensitive duplicates, and sorts", () => {
    expect(normalizeContactTags(["  Decision   Maker ", "founder", "FOUNDER", " Northeast "])).toEqual([
      "Decision Maker",
      "founder",
      "Northeast",
    ]);
  });

  it("caps each contact without changing the first accepted labels", () => {
    const tags = Array.from({ length: MAX_CONTACT_TAGS + 5 }, (_, index) => `Tag ${index}`);
    expect(normalizeContactTags(tags)).toHaveLength(MAX_CONTACT_TAGS);
  });

  it("adds and removes labels case-insensitively", () => {
    expect(addContactTag(["Founder"], "founder")).toEqual(["Founder"]);
    expect(removeContactTag(["Founder", "Priority"], " FOUNDER ")).toEqual(["Priority"]);
  });

  it("validates editable tag lengths and normalizes a patch", () => {
    expect(ContactPatchSchema.parse({ tags: [" Priority ", "priority", "Founder"] }).tags).toEqual([
      "Founder",
      "Priority",
    ]);
    expect(() => ContactPatchSchema.parse({ tags: ["x".repeat(33)] })).toThrow();
  });

  it("keeps legacy contact documents readable with an empty tag default", () => {
    const contact = ContactSchema.parse({
      contactId: "contact-1",
      ownerUserId: "user-1",
      organizationId: "org-1",
      normalizedEmail: "lead@example.com",
      email: "lead@example.com",
      firstSeenAt: 1,
      lastSeenAt: 1,
      createdAt: 1,
      updatedAt: 1,
    });
    expect(contact.tags).toEqual([]);
  });
});

describe("lead organization integration guards", () => {
  it("keeps bulk operations authenticated and owner-scoped", () => {
    const route = readFileSync("app/api/contacts/bulk/route.ts", "utf8");
    const repository = readFileSync("lib/repositories/contacts.ts", "utf8");
    expect(route).toContain("const ctx = await requireUser()");
    expect(route).toContain('z.literal("add_tag")');
    expect(route).toContain('z.literal("add_to_list")');
    expect(route).toContain("[...new Set(ids)]");
    expect(repository).toContain('firestore().collection("users").doc(ctx.userId).collection("contacts")');
    expect(repository).toContain("bulkUpdateContactList");
    expect(repository).toContain("Math.max(0, currentCount + delta)");
  });

  it("exposes tag and list filters in the directory and campaign picker", () => {
    const directory = readFileSync("components/ContactsTable.tsx", "utf8");
    const wizard = readFileSync("components/campaign/CampaignWizard.tsx", "utf8");
    expect(directory).toContain('id="lead-tag-filter"');
    expect(directory).toContain('id="lead-list-filter"');
    expect(directory).toContain("BulkLeadOrganizer");
    expect(wizard).toContain('aria-label="Filter leads by tag"');
    expect(wizard).toContain("TagChips");
  });
});
