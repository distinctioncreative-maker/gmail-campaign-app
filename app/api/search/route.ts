import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/requireUser";
import { handleApiErrors } from "@/lib/api";
import { capabilitiesFor } from "@/lib/tenancy/capabilities";
import { getOrgSettings } from "@/lib/repositories/orgSettings";
import { searchWorkspace } from "@/lib/search/workspace";
import { enforceUserRateLimit, RATE_LIMITS } from "@/lib/util/userRateLimit";

/**
 * Command palette search.
 *
 * Scoped to the signed-in user's own documents through the AuthContext, like
 * every other route: a palette is a search box over someone's data, which
 * makes it exactly the kind of endpoint where a client-supplied owner id would
 * be a cross-tenant read.
 */
export const GET = handleApiErrors(async (req: NextRequest) => {
  const ctx = await requireUser();
  const query = (req.nextUrl.searchParams.get("q") ?? "").slice(0, 100);
  if (query.trim().length < 2) {
    // One character matches most of the workspace and is never a real query.
    // Returning early keeps a stray keystroke from costing four reads.
    return NextResponse.json({ results: [], leadsPrefixOnly: false });
  }

  await enforceUserRateLimit(ctx, RATE_LIMITS.search);

  const settings = await getOrgSettings(ctx.organizationId).catch(() => null);
  const capabilities = capabilitiesFor(ctx.tenantType, settings?.billing.plan ?? "TEAM");

  const found = await searchWorkspace(ctx, query, {
    isAdmin: ctx.role === "ADMIN" && capabilities.adminConsole,
    hasTeams: capabilities.teams,
  });
  return NextResponse.json(found);
});
