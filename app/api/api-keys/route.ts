import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth/requireUser";
import { handleApiErrors } from "@/lib/api";
import { createApiKey, listApiKeys, revokeApiKey } from "@/lib/apiKeys/store";
import { ApiScopeSchema } from "@/schemas/integration";
import { describeScopes } from "@/lib/apiKeys/token";

/**
 * Managing API keys.
 *
 * Admin-only throughout. A key is a credential to the whole workspace's data,
 * so issuing one is not a per-rep action, and neither is revoking somebody
 * else's.
 */
export const GET = handleApiErrors(async () => {
  const ctx = await requireRole("ADMIN");
  const keys = await listApiKeys(ctx.organizationId);
  return NextResponse.json({
    keys: keys.map((key) => ({ ...key, scopeSummary: describeScopes(key.scopes) })),
  });
});

const CreateSchema = z.object({
  name: z.string().trim().min(1).max(60),
  scopes: z.array(ApiScopeSchema).min(1),
  environment: z.enum(["live", "test"]).default("live"),
});

export const POST = handleApiErrors(async (req: NextRequest) => {
  const ctx = await requireRole("ADMIN");
  const input = CreateSchema.parse(await req.json());

  const { key, secret } = await createApiKey({
    organizationId: ctx.organizationId,
    createdByUserId: ctx.userId,
    // The creator owns the data the key addresses, by default.
    ownerUserId: ctx.userId,
    name: input.name,
    scopes: input.scopes,
    environment: input.environment,
  });

  return NextResponse.json({
    key,
    // The one and only time this is ever returned. Nothing stores it.
    secret,
    message:
      "Copy this key now. It is stored only as a hash, so this is the only time it can be shown.",
  });
});

const RevokeSchema = z.object({ keyId: z.string().min(1) });

export const DELETE = handleApiErrors(async (req: NextRequest) => {
  const ctx = await requireRole("ADMIN");
  const { keyId } = RevokeSchema.parse(await req.json());
  // Scoped to this organization, so a key id from elsewhere cannot be revoked.
  const revoked = await revokeApiKey(ctx.organizationId, keyId);
  if (!revoked) {
    return NextResponse.json({ error: "That key does not exist." }, { status: 404 });
  }
  return NextResponse.json({
    ok: true,
    message: "Revoked. Any integration using it stops working immediately.",
  });
});
