import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth/requireUser";
import { handleApiErrors } from "@/lib/api";
import { assertWritesAllowed } from "@/lib/platform/readonly";
import { getOrgSettings } from "@/lib/repositories/orgSettings";
import { assertAiWritingEnabled } from "@/lib/ai/enabled";
import { AiNotConfiguredError } from "@/lib/ai/generateEmail";
import { aiRequestAllowed } from "@/lib/ai/rateLimit";
import { listContacts, updateContactDetails, getContact } from "@/lib/repositories/contacts";
import { organizeLeads, MAX_LEADS_PER_PASS } from "@/lib/ai/organizeLeads";
import { addContactTag, normalizeTagName, MAX_CONTACT_TAG_LENGTH } from "@/lib/leads/tags";

/**
 * Propose groupings for a workspace's leads.
 *
 * Proposing and applying are separate requests on purpose. Tagging hundreds of
 * contacts is a large action that is tedious to undo by hand, and it must not be
 * the invisible half of pressing a button called "organize". The GET here
 * returns groups with the contact IDs they cover; nothing is written until a
 * person posts back the groups they actually want.
 */
export const GET = handleApiErrors(async () => {
  const ctx = await requireUser();
  const settings = await getOrgSettings(ctx.organizationId);

  try {
    assertAiWritingEnabled(settings);
  } catch (err) {
    if (err instanceof AiNotConfiguredError) {
      return NextResponse.json({ error: err.message }, { status: 503 });
    }
    throw err;
  }

  if (!(await aiRequestAllowed(ctx.organizationId, ctx.userId))) {
    return NextResponse.json(
      { error: "AI limit reached. Please try again later." },
      { status: 429 }
    );
  }

  const contacts = await listContacts(ctx, { limit: MAX_LEADS_PER_PASS });
  if (contacts.length < 4) {
    return NextResponse.json({ groups: [], reason: "Not enough leads to group yet." });
  }

  const proposed = await organizeLeads(
    contacts.map((contact, index) => ({
      index,
      businessName: contact.businessName || contact.fullName,
    }))
  );

  // Indices become contact IDs here rather than being sent to the client. The
  // client never needs to know the model addressed leads positionally, and a
  // position is meaningless by the time an apply request comes back.
  return NextResponse.json({
    groups: proposed.map((group) => ({
      name: group.name,
      reason: group.reason,
      contactIds: group.indices.map((index) => contacts[index].contactId),
      sample: group.indices
        .slice(0, 3)
        .map((index) => contacts[index].businessName || contacts[index].fullName)
        .filter(Boolean),
    })),
  });
});

const ApplySchema = z.object({
  groups: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(MAX_CONTACT_TAG_LENGTH),
        contactIds: z.array(z.string().min(1)).min(1).max(MAX_LEADS_PER_PASS),
      })
    )
    .min(1)
    .max(8),
});

/**
 * Apply the groups a person accepted, as tags.
 *
 * Tags rather than lists, and additive rather than replacing: this adds a label
 * to leads that already exist, so running it and disliking the result costs a
 * tag removal rather than an unpicked reorganization. Every contact ID is
 * re-read and re-scoped, because the client is holding IDs the server handed it
 * and must not be trusted to hand back only those.
 */
export const POST = handleApiErrors(async (req: NextRequest) => {
  const ctx = await requireUser();
  await assertWritesAllowed();
  const { groups } = ApplySchema.parse(await req.json());

  let tagged = 0;
  let skipped = 0;

  for (const group of groups) {
    const tag = normalizeTagName(group.name);
    if (!tag) continue;
    for (const contactId of group.contactIds) {
      // Scoped read: getContact is bound to this user's collection, so an ID
      // from another workspace resolves to nothing rather than being written.
      const contact = await getContact(ctx, contactId);
      if (!contact) {
        skipped++;
        continue;
      }
      const next = addContactTag(contact.tags, tag);
      // Already carrying the tag: nothing to write, and counting it as tagged
      // would report work that did not happen.
      if (next.length === contact.tags.length) continue;
      await updateContactDetails(ctx, contactId, { tags: next });
      tagged++;
    }
  }

  return NextResponse.json({ tagged, skipped });
});
