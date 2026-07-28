import { describe, it, expect } from "vitest";
import { applyRateLimit, requestRateLimitKey } from "@/lib/util/rateLimit";

const WINDOW = 60_000;

describe("applyRateLimit", () => {
  it("allows and opens a fresh window when there is no prior state", () => {
    const { allowed, next } = applyRateLimit(null, 1000, 3, WINDOW);
    expect(allowed).toBe(true);
    expect(next).toEqual({ count: 1, windowStart: 1000 });
  });

  it("increments within an open window until the limit", () => {
    const a = applyRateLimit({ count: 1, windowStart: 1000 }, 1500, 3, WINDOW);
    expect(a.allowed).toBe(true);
    expect(a.next.count).toBe(2);

    const b = applyRateLimit({ count: 2, windowStart: 1000 }, 2000, 3, WINDOW);
    expect(b.allowed).toBe(true);
    expect(b.next.count).toBe(3);
  });

  it("rejects once the count reaches the limit and does not advance state", () => {
    const prev = { count: 3, windowStart: 1000 };
    const { allowed, next } = applyRateLimit(prev, 2000, 3, WINDOW);
    expect(allowed).toBe(false);
    expect(next).toBe(prev);
  });

  it("resets to a new window after the window elapses", () => {
    const prev = { count: 3, windowStart: 1000 };
    const { allowed, next } = applyRateLimit(prev, 1000 + WINDOW, 3, WINDOW);
    expect(allowed).toBe(true);
    expect(next).toEqual({ count: 1, windowStart: 1000 + WINDOW });
  });
});

describe("requestRateLimitKey", () => {
  const request = (forwardedFor: string) => ({
    headers: new Headers({
      "x-forwarded-for": forwardedFor,
      "user-agent": "test-agent",
    }),
  });

  it("uses Google's appended client hop, not a spoofed prefix or shared load balancer", () => {
    const clean = requestRateLimitKey(
      request("203.0.113.8, 198.51.100.2"),
      "waitlist"
    );
    const spoofedPrefix = requestRateLimitKey(
      request("1.2.3.4, 203.0.113.8, 198.51.100.2"),
      "waitlist"
    );
    const otherClient = requestRateLimitKey(
      request("203.0.113.9, 198.51.100.2"),
      "waitlist"
    );
    expect(spoofedPrefix).toBe(clean);
    expect(otherClient).not.toBe(clean);
  });
});
