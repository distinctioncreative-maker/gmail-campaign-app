import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth/requireUser";
import { handleApiErrors } from "@/lib/api";
import { enforceUserRateLimit, RATE_LIMITS } from "@/lib/util/userRateLimit";
import { csvStream, settingsSnapshot } from "@/lib/export/datasets";
import { EXPORT_DATASETS, exportFilename } from "@/lib/export/serialize";
import { auditActor, recordAudit } from "@/lib/audit/log";

/** Cloud Run buffers a static response; a data export has to stream. */
export const dynamic = "force-dynamic";

const QuerySchema = z.enum([...EXPORT_DATASETS, "settings"]);

/**
 * Download one dataset.
 *
 * A GET that streams rather than a job that emails a link. The link version
 * needs a bucket, signed URLs, a lifecycle policy, and a notification, and it
 * leaves a copy of the customer's leads in storage that account deletion would
 * then have to find and destroy. This produces the same file with none of
 * that, and the customer has it in one click instead of an unknown number of
 * minutes.
 */
export const GET = handleApiErrors(async (req: NextRequest) => {
  const ctx = await requireUser();
  await enforceUserRateLimit(ctx, RATE_LIMITS.dataExport);

  const parsed = QuerySchema.safeParse(req.nextUrl.searchParams.get("dataset"));
  if (!parsed.success) {
    return NextResponse.json(
      { error: `Unknown dataset. Choose one of: ${EXPORT_DATASETS.join(", ")}, settings.` },
      { status: 400 }
    );
  }
  const dataset = parsed.data;
  const day = new Date().toISOString().slice(0, 10);

  // Before the stream rather than after: the response is streamed, so there is
  // no "after" inside this handler, and an export that began is the fact worth
  // recording.
  await recordAudit(auditActor(ctx), {
    action: "data.exported",
    summary: `${ctx.email} exported ${dataset}.`,
    details: { dataset },
  });

  if (dataset === "settings") {
    const snapshot = await settingsSnapshot(ctx);
    return new NextResponse(JSON.stringify(snapshot, null, 2), {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="cadence-settings-${day}.json"`,
        "Cache-Control": "no-store",
      },
    });
  }

  return new NextResponse(csvStream(ctx, dataset), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${exportFilename(dataset, Date.now())}"`,
      // Never cached anywhere: this is the customer's entire lead list, and a
      // proxy or browser cache holding it is a copy nobody asked for.
      "Cache-Control": "no-store, private",
    },
  });
});
