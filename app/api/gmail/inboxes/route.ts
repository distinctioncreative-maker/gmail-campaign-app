import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth/requireUser";
import { handleApiErrors } from "@/lib/api";
import {
  deleteConnection,
  listConnections,
  setPrimaryConnection,
  updateConnectionSettings,
} from "@/lib/repositories/gmailConnections";
import { getInboxDailyCounts, ownerFromCtx } from "@/lib/repositories/campaigns";
import { localDayKey } from "@/lib/scheduling/window";
import { getSenderProfile } from "@/lib/repositories/userSettings";
import { assessInbox, poolCapacity, type InboxCandidate } from "@/lib/sending/inboxPool";
import { clampThresholds } from "@/lib/campaigns/bounceGuard";

/**
 * The connected inboxes, with the same assessment the send path uses.
 *
 * Deliberately the same function rather than a parallel "is it healthy" check
 * for display: an inbox that the settings page calls ready and the worker then
 * skips is the kind of disagreement nobody can debug from a screenshot.
 */
export const GET = handleApiErrors(async () => {
  const ctx = await requireUser();
  const owner = ownerFromCtx(ctx);
  const [connections, profile] = await Promise.all([
    listConnections(ctx.userId),
    getSenderProfile(ctx),
  ]);
  const dayKey = localDayKey(Date.now(), profile.timezone);
  const sentToday = await getInboxDailyCounts(
    owner,
    connections.map((c) => c.connectionId),
    dayKey
  );

  const candidates: InboxCandidate[] = connections.map((c) => ({
    connectionId: c.connectionId,
    connectedEmail: c.connectedEmail,
    label: c.label,
    status: c.status,
    paused: c.paused,
    primary: c.primary,
    connectedAt: c.createdAt,
    lifetimeSends: c.lifetimeSends,
    sentToday: sentToday[c.connectionId] ?? 0,
    sentCount: c.sentCount,
    bounceCount: c.bounceCount,
    dailyLimit: c.dailyLimit,
  }));

  const options = { now: Date.now(), thresholds: clampThresholds({}) };
  return NextResponse.json({
    inboxes: candidates.map((candidate) => {
      const assessment = assessInbox(candidate, options);
      return {
        connectionId: candidate.connectionId,
        connectedEmail: candidate.connectedEmail,
        label: candidate.label,
        status: candidate.status,
        paused: candidate.paused,
        primary: candidate.primary,
        connectedAt: candidate.connectedAt,
        lifetimeSends: candidate.lifetimeSends,
        sentToday: candidate.sentToday,
        sentCount: candidate.sentCount,
        bounceCount: candidate.bounceCount,
        dailyLimit: candidate.dailyLimit,
        usable: assessment.usable,
        skipReason: assessment.skipReason,
        // Infinity does not survive JSON, and null renders as "no limit".
        dailyCap: Number.isFinite(assessment.dailyCap) ? assessment.dailyCap : null,
        remaining: Number.isFinite(assessment.remaining) ? assessment.remaining : null,
        detail: assessment.detail,
      };
    }),
    capacity: poolCapacity(candidates, options),
  });
});

const PatchSchema = z.object({
  connectionId: z.string().min(1),
  label: z.string().trim().max(60).optional(),
  /** Null clears the override and returns this inbox to the shared ceilings. */
  dailyLimit: z.number().int().min(1).max(2000).nullable().optional(),
  paused: z.boolean().optional(),
  makePrimary: z.boolean().optional(),
});

export const PATCH = handleApiErrors(async (req: NextRequest) => {
  const ctx = await requireUser();
  const input = PatchSchema.parse(await req.json());
  const owned = await listConnections(ctx.userId);
  // Scoped to this user's own connections. Without this an id from another
  // workspace would be written into this user's subcollection path.
  if (!owned.some((c) => c.connectionId === input.connectionId)) {
    return NextResponse.json({ error: "That inbox is not connected." }, { status: 404 });
  }

  await updateConnectionSettings(ctx.userId, input.connectionId, {
    label: input.label,
    dailyLimit: input.dailyLimit,
    paused: input.paused,
  });
  if (input.makePrimary) await setPrimaryConnection(ctx.userId, input.connectionId);

  return NextResponse.json({ ok: true, message: "Inbox updated." });
});

const DeleteSchema = z.object({ connectionId: z.string().min(1) });

export const DELETE = handleApiErrors(async (req: NextRequest) => {
  const ctx = await requireUser();
  const { connectionId } = DeleteSchema.parse(await req.json());
  const owned = await listConnections(ctx.userId);
  if (!owned.some((c) => c.connectionId === connectionId)) {
    return NextResponse.json({ error: "That inbox is not connected." }, { status: 404 });
  }

  const result = await deleteConnection(ctx.userId, connectionId);
  if (!result.deleted) {
    return NextResponse.json({ error: result.reason }, { status: 400 });
  }
  return NextResponse.json({ ok: true, message: "Inbox removed." });
});
