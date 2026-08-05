import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";
import { NextResponse } from "next/server";
import { handleApiErrors } from "@/lib/api";
import { UnauthorizedError, ForbiddenError } from "@/lib/auth/requireUser";
import { AuthError } from "@/lib/auth/session";
import { ZodError } from "zod";
import { verifyTaskRequest, TaskAuthError } from "@/lib/tasks/verifyOidc";
import { assertAiWritingEnabled } from "@/lib/ai/enabled";
import { AiNotConfiguredError } from "@/lib/ai/generateEmail";

/** Every route handler in the tree, keyed by its URL-shaped path. */
function* findRoutes(dir: string): Generator<{ id: string; source: string }> {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* findRoutes(path);
    else if (entry.name === "route.ts") {
      yield {
        id: dir.replace(/^app\//, "").replace(/\\/g, "/"),
        source: readFileSync(path, "utf8"),
      };
    }
  }
}

async function statusFor(err: unknown): Promise<number> {
  const wrapped = handleApiErrors(async () => {
    throw err;
  });
  const res = await wrapped();
  return res.status;
}

describe("handleApiErrors — error → status mapping", () => {
  it("maps auth/permission/validation errors to safe status codes", async () => {
    expect(await statusFor(new UnauthorizedError())).toBe(401);
    expect(await statusFor(new ForbiddenError())).toBe(403);
    expect(await statusFor(new AuthError("nope"))).toBe(403);
    expect(await statusFor(new ZodError([]))).toBe(400);
  });

  it("hides unexpected errors behind a generic 500 (no stack leak)", async () => {
    const wrapped = handleApiErrors(async () => {
      throw new Error("secret internal detail");
    });
    const res = await wrapped();
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(JSON.stringify(body)).not.toContain("secret internal detail");
  });

  it("passes through a normal response untouched", async () => {
    const wrapped = handleApiErrors(async () => NextResponse.json({ ok: true }));
    const res = await wrapped();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });
});

describe("verifyTaskRequest — worker auth guard", () => {
  it("rejects a request with no bearer token", async () => {
    const req = new Request("https://app.example/api/tasks/send-message", { headers: {} });
    await expect(verifyTaskRequest(req)).rejects.toBeInstanceOf(TaskAuthError);
  });
});

describe("assertAiWritingEnabled — AI gate", () => {
  it("throws when AI is off for the org", () => {
    expect(() => assertAiWritingEnabled({ aiEnabled: false })).toThrow(AiNotConfiguredError);
  });
});

describe("route guards — every authenticated route is scoped", () => {
  /** Routes that legitimately have no session: public pages, webhooks with
   * their own signature check, tracking pixels, and the OIDC worker. Each
   * entry is an exemption someone has to justify, which is the point. */
  const UNAUTHENTICATED = new Set([
    "api/auth/session", // establishes the session
    "api/billing/webhook", // Stripe HMAC
    "api/cron/sweep", // scheduler OIDC
    "api/gmail/callback", // OAuth redirect, verifies its own state
    "api/health",
    "api/t/c/[token]/[index]", // click redirect
    "api/t/o/[token]", // open pixel
    "api/tasks/send-message", // Cloud Tasks OIDC
    "api/u/[token]", // one-click unsubscribe
    "api/waitlist", // public contact form
  ]);

  const routes = [...findRoutes("app")];

  it("finds the route tree (guards against a vacuous pass)", () => {
    expect(routes.length).toBeGreaterThan(40);
  });

  it("authenticates every route that is not explicitly public", () => {
    // requireRole wraps requireUser (lib/auth/requireUser.ts:163), so either
    // one establishes a session.
    const missing = routes
      .filter(({ id }) => !UNAUTHENTICATED.has(id))
      .filter(({ source }) => !/\brequire(?:User|Role)\(/.test(source))
      .map(({ id }) => id);
    expect(missing).toEqual([]);
  });

  it("scopes every campaign route to the signed-in owner", () => {
    // A campaign route that reads or writes without ownerFromCtx would be
    // addressing another workspace's documents by ID.
    const missing = routes
      .filter(({ id }) => id.startsWith("api/campaigns/"))
      .filter(({ source }) => !source.includes("ownerFromCtx("))
      .map(({ id }) => id);
    expect(missing).toEqual([]);
  });
});
