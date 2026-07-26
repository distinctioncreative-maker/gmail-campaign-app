import { describe, it, expect } from "vitest";
import { NextResponse } from "next/server";
import { handleApiErrors } from "@/lib/api";
import { UnauthorizedError, ForbiddenError } from "@/lib/auth/requireUser";
import { AuthError } from "@/lib/auth/session";
import { ZodError } from "zod";
import { verifyTaskRequest, TaskAuthError } from "@/lib/tasks/verifyOidc";
import { assertAiWritingEnabled } from "@/lib/ai/enabled";
import { AiNotConfiguredError } from "@/lib/ai/generateEmail";

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
