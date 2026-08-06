import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireRole, requireUser } from "@/lib/auth/requireUser";
import { handleApiErrors } from "@/lib/api";
import { getOrgSettings, saveTrackingDomain } from "@/lib/repositories/orgSettings";
import { verifyTrackingDomain } from "@/lib/tracking/verifyDomain";
import {
  describeDomainStatus,
  dnsInstruction,
  normalizeTrackingDomain,
} from "@/lib/tracking/domain";
import { enforceUserRateLimit, RATE_LIMITS } from "@/lib/util/userRateLimit";
import { env } from "@/lib/env";

/** The workspace's tracking domain and what DNS it needs. */
export const GET = handleApiErrors(async () => {
  const ctx = await requireUser();
  const settings = await getOrgSettings(ctx.organizationId);
  const domain = settings.trackingDomain;
  return NextResponse.json({
    domain,
    summary: describeDomainStatus(domain),
    dns: domain.host ? dnsInstruction(domain.host, env.APP_BASE_URL) : null,
    // Shown as the example so the customer sees the shape before they commit.
    suggestion: dnsInstruction("track.yourcompany.com", env.APP_BASE_URL),
  });
});

const PutSchema = z.object({ host: z.string().max(300) });

/**
 * Set or replace the tracking domain, then check DNS immediately.
 *
 * Admin-only: it changes the hostname in every tracked link the whole workspace
 * sends, which is not a per-rep decision.
 */
export const PUT = handleApiErrors(async (req: NextRequest) => {
  const ctx = await requireRole("ADMIN");
  await enforceUserRateLimit(ctx, RATE_LIMITS.trackingDomain);
  const { host: raw } = PutSchema.parse(await req.json());

  const normalized = normalizeTrackingDomain(raw);
  if (!normalized.ok) {
    return NextResponse.json({ error: normalized.reason }, { status: 400 });
  }

  // Checked before it is stored, so a domain never sits at VERIFIED because a
  // previous host of the same record happened to be verified.
  const verification = await verifyTrackingDomain(normalized.host);
  const now = Date.now();
  const domain = {
    host: normalized.host,
    status: verification.status,
    verifiedAt: verification.verified ? now : null,
    lastCheckedAt: now,
  };
  await saveTrackingDomain(ctx.organizationId, domain);

  return NextResponse.json({
    domain,
    verified: verification.verified,
    message: verification.message,
    dns: dnsInstruction(normalized.host, env.APP_BASE_URL),
  });
});

/** Re-check DNS for the domain already saved. */
export const POST = handleApiErrors(async () => {
  const ctx = await requireRole("ADMIN");
  await enforceUserRateLimit(ctx, RATE_LIMITS.trackingDomain);
  const settings = await getOrgSettings(ctx.organizationId);
  const existing = settings.trackingDomain;
  if (!existing.host) {
    return NextResponse.json({ error: "No tracking domain is set yet." }, { status: 400 });
  }

  const verification = await verifyTrackingDomain(existing.host);
  const now = Date.now();
  const domain = {
    host: existing.host,
    status: verification.status,
    // Keep the original verification date once verified: it is when the domain
    // started carrying real links, which is the fact worth keeping.
    verifiedAt: verification.verified ? existing.verifiedAt ?? now : null,
    lastCheckedAt: now,
  };
  await saveTrackingDomain(ctx.organizationId, domain);
  return NextResponse.json({ domain, verified: verification.verified, message: verification.message });
});

/**
 * Stop using a custom domain and go back to the shared one.
 *
 * Note what this cannot undo: links in mail already delivered carry the
 * hostname they were built with. Removing the domain here stops future sends
 * using it, and the customer should keep the CNAME in place while any recent
 * campaign is still being read.
 */
export const DELETE = handleApiErrors(async () => {
  const ctx = await requireRole("ADMIN");
  await saveTrackingDomain(ctx.organizationId, {
    host: "",
    status: "NONE",
    verifiedAt: null,
    lastCheckedAt: Date.now(),
  });
  return NextResponse.json({
    ok: true,
    message:
      "Removed. New sends use Cadence's shared domain. Leave the CNAME in place while recent campaigns are still being read, or links already delivered will stop working.",
  });
});
