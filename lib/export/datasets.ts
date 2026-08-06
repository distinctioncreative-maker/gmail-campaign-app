import "server-only";
import { firestore } from "@/lib/firebase/admin";
import type { AuthContext } from "@/lib/auth/requireUser";
import { ContactSchema } from "@/schemas/contact";
import { CampaignSchema, RecipientSchema } from "@/schemas/campaign";
import { SuppressionSchema } from "@/schemas/suppression";
import { TemplateSchema } from "@/schemas/template";
import { SequenceSchema } from "@/schemas/sequence";
import { resolveTracking } from "@/lib/tracking/settings";
import {
  csvRow,
  csvTimestamp,
  DATASET_INFO,
  type ExportDataset,
} from "./serialize";

/**
 * Row sources for data export.
 *
 * Every one of these is an async generator that pages through Firestore with a
 * cursor and yields one row at a time. That is not gold-plating: a workspace
 * with fifty thousand leads and a few hundred thousand recipient rows would
 * otherwise be assembled entirely in memory on a Cloud Run instance before the
 * first byte reached the customer, and the instance would fall over on exactly
 * the accounts that most need an export.
 *
 * There is deliberately no staging bucket and no signed URL. Writing the
 * export to storage would create a second copy of precisely the personal data
 * that lib/account/deletion.ts exists to destroy, which would then need its own
 * retention policy and its own purge path, and a bug in either would leave a
 * customer's leads sitting in a bucket after they were told everything was
 * deleted. Streaming the response creates no copy at all.
 */

const PAGE = 500;

async function* pagedDocs(
  query: FirebaseFirestore.Query
): AsyncGenerator<FirebaseFirestore.QueryDocumentSnapshot> {
  let cursor: FirebaseFirestore.QueryDocumentSnapshot | null = null;
  for (;;) {
    let page = query.limit(PAGE);
    if (cursor) page = page.startAfter(cursor);
    const snap = await page.get();
    if (snap.empty) return;
    for (const doc of snap.docs) yield doc;
    if (snap.size < PAGE) return;
    cursor = snap.docs[snap.docs.length - 1];
  }
}

const userRef = (ctx: AuthContext) => firestore().collection("users").doc(ctx.userId);

async function* leadRows(ctx: AuthContext): AsyncGenerator<string> {
  const query = userRef(ctx).collection("contacts").orderBy("createdAt", "asc");
  for await (const doc of pagedDocs(query)) {
    const c = ContactSchema.parse(doc.data());
    yield csvRow([
      c.email,
      c.firstName,
      c.lastName,
      c.fullName,
      c.businessName,
      c.phone,
      c.region,
      c.leadSource,
      c.emailOptOut,
      c.campaignCount,
      c.lastCampaignName,
      csvTimestamp(c.lastCampaignAt),
      c.lastOutcome,
      csvTimestamp(c.firstSeenAt),
      csvTimestamp(c.lastSeenAt),
    ]);
  }
}

async function* campaignRows(ctx: AuthContext): AsyncGenerator<string> {
  const query = userRef(ctx).collection("campaigns").orderBy("createdAt", "asc");
  for await (const doc of pagedDocs(query)) {
    const c = CampaignSchema.parse(doc.data());
    yield csvRow([
      c.campaignId,
      c.name,
      c.status,
      c.totalRecipients,
      c.sentCount,
      c.followupSentCount,
      c.replyCount,
      c.bounceCount,
      c.unsubscribeCount,
      c.meetingCount,
      c.wonCount,
      c.lostCount,
      c.wonValueCents,
      csvTimestamp(c.createdAt),
      csvTimestamp(c.startedAt),
      csvTimestamp(c.completedAt),
    ]);
  }
}

/**
 * Sending history, campaign by campaign.
 *
 * Nested paging rather than a collection-group query: recipients live under
 * each campaign, and a collection group would need its own composite index and
 * would read across every owner before filtering back down to this one.
 */
async function* recipientRows(ctx: AuthContext): AsyncGenerator<string> {
  const campaigns = userRef(ctx).collection("campaigns").orderBy("createdAt", "asc");
  for await (const campaignDoc of pagedDocs(campaigns)) {
    const recipients = campaignDoc.ref.collection("recipients").orderBy("createdAt", "asc");
    for await (const doc of pagedDocs(recipients)) {
      const r = RecipientSchema.parse(doc.data());
      yield csvRow([
        r.campaignId,
        r.emailSnapshot,
        r.fullNameSnapshot,
        r.businessNameSnapshot,
        r.status,
        r.included,
        r.exclusionReason,
        r.currentStep,
        csvTimestamp(r.initialSentAt),
        csvTimestamp(r.lastSentAt),
        csvTimestamp(r.repliedAt),
        r.replyIntent,
        csvTimestamp(r.bouncedAt),
        csvTimestamp(r.unsubscribedAt),
        r.dealStatus,
        r.dealValueCents,
      ]);
    }
  }
}

async function* suppressionRows(ctx: AuthContext): AsyncGenerator<string> {
  const query = userRef(ctx).collection("suppressions").orderBy("createdAt", "asc");
  for await (const doc of pagedDocs(query)) {
    const s = SuppressionSchema.parse(doc.data());
    yield csvRow([s.email, s.reason, s.source, csvTimestamp(s.createdAt)]);
  }
}

async function* templateRows(ctx: AuthContext): AsyncGenerator<string> {
  const query = userRef(ctx).collection("templates").orderBy("createdAt", "asc");
  for await (const doc of pagedDocs(query)) {
    const t = TemplateSchema.parse(doc.data());
    // The HTML body, not the plain-text reduction: an export exists so the
    // customer can leave, and handing them a lossy copy of their own work
    // would make that harder than not exporting at all.
    yield csvRow([
      t.templateId,
      t.name,
      t.subjectTemplate,
      t.htmlTemplate,
      csvTimestamp(t.createdAt),
      csvTimestamp(t.updatedAt),
    ]);
  }
}

async function* sequenceRows(ctx: AuthContext): AsyncGenerator<string> {
  const query = userRef(ctx).collection("sequences").orderBy("createdAt", "asc");
  for await (const doc of pagedDocs(query)) {
    const s = SequenceSchema.parse(doc.data());
    yield csvRow([
      s.sequenceId,
      s.name,
      s.steps.length,
      csvTimestamp(s.createdAt),
      csvTimestamp(s.updatedAt),
    ]);
  }
}

const SOURCES: Record<ExportDataset, (ctx: AuthContext) => AsyncGenerator<string>> = {
  leads: leadRows,
  campaigns: campaignRows,
  recipients: recipientRows,
  suppressions: suppressionRows,
  templates: templateRows,
  sequences: sequenceRows,
};

/**
 * The dataset as a CSV byte stream, header first.
 *
 * Errors mid-stream cannot become an HTTP status: the 200 and the headers are
 * long gone by then. A truncated CSV that looks complete is worse than an
 * obviously broken one, so a failure appends a comment row the customer will
 * see at the end of the file rather than dying silently.
 */
export function csvStream(ctx: AuthContext, dataset: ExportDataset): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const rows = SOURCES[dataset](ctx);
  let sentHeader = false;

  return new ReadableStream({
    async pull(controller) {
      if (!sentHeader) {
        sentHeader = true;
        controller.enqueue(encoder.encode(`${csvRow(DATASET_INFO[dataset].headers)}\n`));
        return;
      }
      try {
        const next = await rows.next();
        if (next.done) {
          controller.close();
          return;
        }
        controller.enqueue(encoder.encode(`${next.value}\n`));
      } catch (err) {
        console.error("[export] stream failed", { dataset, err: String(err) });
        controller.enqueue(
          encoder.encode("# EXPORT INCOMPLETE: this file stopped early. Please export again.\n")
        );
        controller.close();
      }
    },
    async cancel() {
      // The customer navigated away or the connection dropped. Closing the
      // generator releases the Firestore cursor instead of leaving it paging.
      await rows.return(undefined);
    },
  });
}

/** Counts for the export page, so nobody downloads a file to find out it is empty. */
export async function exportSummary(ctx: AuthContext): Promise<Record<string, number>> {
  const ref = userRef(ctx);
  const [leads, campaigns, suppressions, templates, sequences] = await Promise.all([
    ref.collection("contacts").count().get(),
    ref.collection("campaigns").count().get(),
    ref.collection("suppressions").count().get(),
    ref.collection("templates").count().get(),
    ref.collection("sequences").count().get(),
  ]);
  return {
    leads: leads.data().count,
    campaigns: campaigns.data().count,
    suppressions: suppressions.data().count,
    templates: templates.data().count,
    sequences: sequences.data().count,
  };
}

/**
 * The settings a customer would otherwise have to reconstruct by hand, as
 * JSON. Small, and the one part of an export that is configuration rather than
 * records.
 */
export async function settingsSnapshot(ctx: AuthContext): Promise<unknown> {
  const campaigns = await userRef(ctx)
    .collection("campaigns")
    .orderBy("createdAt", "asc")
    .limit(500)
    .get();
  return {
    exportedAt: new Date().toISOString(),
    account: { email: ctx.email, role: ctx.role, organizationId: ctx.organizationId },
    campaigns: campaigns.docs.map((doc) => {
      const c = CampaignSchema.parse(doc.data());
      return {
        campaignId: c.campaignId,
        name: c.name,
        status: c.status,
        schedule: c.schedule,
        priorContactPolicy: c.priorContactPolicy,
        tracking: resolveTracking(c),
      };
    }),
  };
}
