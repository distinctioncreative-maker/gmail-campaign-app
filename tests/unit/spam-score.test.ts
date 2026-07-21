import { describe, expect, it } from "vitest";
import { analyzeSpam } from "@/lib/spam/score";

const CLEAN = {
  subject: "Quick question about Rivera Roofing",
  html:
    "<p>Hi Jordan,</p><p>I work with roofing businesses on funding and wanted to see if a short call next week would be useful. We help with working capital without the usual paperwork.</p><p>Either way, best of luck this season.</p><p>Best,<br>Alex</p><p>{{unsubscribe_text}}</p><p>{{physical_address}}</p>",
  hasUnsubscribe: true,
  hasPhysicalAddress: true,
};

const SPAMMY = {
  subject: "FREE MONEY!!! ACT NOW GUARANTEED WINNER $$$",
  html:
    "<p>CLICK HERE to BUY NOW!</p>" +
    Array.from({ length: 10 }, (_, i) => `<a href="https://bit.ly/x${i}">click here</a>`).join(" ") +
    "<img src='a.png'><img src='b.png'><img src='c.png'>",
  hasUnsubscribe: false,
  hasPhysicalAddress: false,
};

describe("analyzeSpam", () => {
  it("scores a clean, personal email highly (A/B)", () => {
    const r = analyzeSpam(CLEAN);
    expect(r.score).toBeGreaterThanOrEqual(80);
    expect(["A", "B"]).toContain(r.grade);
    expect(r.checks.find((c) => c.label === "Opt-out line")?.status).toBe("pass");
  });

  it("scores a spammy email low and flags the right problems", () => {
    const r = analyzeSpam(SPAMMY);
    expect(r.score).toBeLessThan(50);
    expect(r.grade).toBe("D");
    const byLabel = Object.fromEntries(r.checks.map((c) => [c.label, c.status]));
    expect(byLabel["Spam trigger words"]).toBe("fail");
    expect(byLabel["Opt-out line"]).toBe("fail");
    expect(byLabel["Link domains"]).toBe("fail"); // bit.ly shortener
    expect(["warn", "fail"]).toContain(byLabel["Links"]);
  });

  it("worst issues sort to the top", () => {
    const r = analyzeSpam(SPAMMY);
    expect(r.checks[0].status).toBe("fail");
  });

  it("flags a missing unsubscribe line", () => {
    const r = analyzeSpam({ ...CLEAN, hasUnsubscribe: false });
    expect(r.checks.find((c) => c.label === "Opt-out line")?.status).toBe("fail");
  });

  it("keeps the score within 0–100", () => {
    const r = analyzeSpam(SPAMMY);
    expect(r.score).toBeGreaterThanOrEqual(0);
    expect(r.score).toBeLessThanOrEqual(100);
  });
});
