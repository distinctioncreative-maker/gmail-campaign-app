import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth/requireUser";
import { handleApiErrors } from "@/lib/api";
import { enforceUserRateLimit, RATE_LIMITS } from "@/lib/util/userRateLimit";
import { classifyLead } from "@/lib/leads/classify";
import { verifyLeadBatch } from "@/lib/leads/verifyBatch";
import { activeSourcingProvider } from "@/lib/sourcing/registry";
import { ApolloSourcingError } from "@/lib/sourcing/apollo";
import { isSearchable, type SourcingCriteria } from "@/lib/sourcing/provider";
import { toParsedLeads, withheldCount } from "@/lib/sourcing/normalize";
import { MAX_CREDITS_PER_SEARCH, describeCredits } from "@/lib/sourcing/quota";
import {
  getCreditState,
  reserveCredits,
  settleReservation,
} from "@/lib/repositories/sourcingUsage";
import { reportError } from "@/lib/observability/report";

/**
 * Search a lead provider and return a preview.
 *
 * The response is deliberately the same shape the CSV preview returns, so the
 * existing preview table, verification badges, and import route all work
 * unchanged. A second import path with its own rules would be a second place for
 * a suppressed address to get through.
 *
 * Nothing is written to the contact directory here. The customer picks rows in
 * the preview and the existing /api/leads/import route does the writing, which
 * keeps the server-side import rules in exactly one place.
 */
const BodySchema = z.object({
  keywords: z.string().max(200).default(""),
  titles: z.array(z.string().min(1).max(80)).max(10).default([]),
  locations: z.array(z.string().min(1).max(80)).max(10).default([]),
  industries: z.array(z.string().min(1).max(80)).max(10).default([]),
  minEmployees: z.number().int().positive().max(1_000_000).nullable().default(null),
  maxEmployees: z.number().int().positive().max(1_000_000).nullable().default(null),
  page: z.number().int().min(1).max(50).default(1),
  perPage: z.number().int().min(1).max(MAX_CREDITS_PER_SEARCH).default(25),
});

export const POST = handleApiErrors(async (req: NextRequest) => {
  const ctx = await requireUser();
  await enforceUserRateLimit(ctx, RATE_LIMITS.leadSourcing);

  const provider = activeSourcingProvider();
  if (!provider) {
    return NextResponse.json(
      {
        error:
          "Lead sourcing is not set up on this deployment yet. Importing a list still works.",
      },
      { status: 503 }
    );
  }

  const input = BodySchema.parse(await req.json());
  const criteria: SourcingCriteria = {
    keywords: input.keywords,
    titles: input.titles,
    locations: input.locations,
    industries: input.industries,
    minEmployees: input.minEmployees,
    maxEmployees: input.maxEmployees,
  };

  // Checked before anything is reserved or spent: an unfiltered search returns
  // the vendor's whole database a page at a time and bills for every page.
  if (!isSearchable(criteria)) {
    return NextResponse.json(
      {
        error:
          "Narrow the search first. Add a job title, an industry, or a keyword, so this returns people worth emailing rather than everybody.",
      },
      { status: 400 }
    );
  }

  const { granted } = await reserveCredits(ctx.organizationId, input.perPage);
  if (granted === 0) {
    const state = await getCreditState(ctx.organizationId);
    return NextResponse.json({ error: describeCredits(state) }, { status: 402 });
  }

  let page;
  try {
    page = await provider.search(criteria, input.page, granted);
  } catch (err) {
    // The reservation is released in full: nothing was returned, so nothing
    // should be charged.
    await settleReservation(ctx.organizationId, granted, 0);
    if (err instanceof ApolloSourcingError) {
      return NextResponse.json({ error: err.message }, { status: 502 });
    }
    reportError(err, { scope: "sourcing.search" });
    return NextResponse.json(
      { error: "The lead provider could not be reached. Try again in a moment." },
      { status: 502 }
    );
  }

  await settleReservation(ctx.organizationId, granted, page.creditsUsed);

  // The same pipeline a pasted CSV goes through: classified against the existing
  // directory and suppression list, then address-verified, before anyone sees a
  // row they might import.
  const leads = toParsedLeads(page.people);
  const classified = await Promise.all(
    leads.map(async (lead) => ({ ...lead, ...(await classifyLead(ctx, lead)) }))
  );
  const { verified, counts } = await verifyLeadBatch(classified);

  const state = await getCreditState(ctx.organizationId);
  return NextResponse.json({
    provider: provider.name,
    leads: verified,
    totalRecords: verified.length,
    totalAvailable: page.totalAvailable,
    page: page.page,
    // Reported rather than hidden. A vendor routinely returns people whose
    // address it will not release, and a result count that quietly excluded them
    // would make the search look worse than it is while the credits went anyway.
    withheld: withheldCount(page.people),
    creditsUsed: page.creditsUsed,
    creditsMessage: describeCredits(state),
    globalWarnings: [],
    verification: counts,
  });
});
