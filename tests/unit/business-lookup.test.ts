import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { lookupDomainFor } from "@/lib/enrichment/businessLookup";

describe("choosing which domains are worth reading", () => {
  it("reads a real company domain", () => {
    expect(lookupDomainFor("jane@acmeroofing.com")).toBe("acmeroofing.com");
    expect(lookupDomainFor("JANE@AcmeRoofing.com")).toBe("acmeroofing.com");
  });

  it("never reads a consumer mailbox provider", () => {
    /**
     * The check that decides whether this feature is cheap or ruinous. A list
     * of small-business leads is full of personal addresses, and fetching
     * gmail.com to learn about a prospect costs a request and a model call to
     * discover that Gmail is an email service.
     */
    for (const email of [
      "jane@gmail.com",
      "jane@yahoo.com",
      "jane@hotmail.com",
      "jane@outlook.com",
      "jane@icloud.com",
      "jane@aol.com",
    ]) {
      expect(lookupDomainFor(email), email).toBeNull();
    }
  });

  it("never reads a throwaway domain", () => {
    // A lead here was never a real prospect, so there is nothing to learn.
    expect(lookupDomainFor("x@mailinator.com")).toBeNull();
    expect(lookupDomainFor("x@guerrillamail.com")).toBeNull();
  });

  it("returns null for anything that is not a usable address", () => {
    for (const bad of ["", "not-an-email", "jane@", "@acme.com", "jane@localhost"]) {
      expect(lookupDomainFor(bad), bad).toBeNull();
    }
  });
});

describe("the rules that keep enrichment from breaking a send", () => {
  const source = readFileSync("lib/enrichment/businessLookup.ts", "utf8");
  const launch = readFileSync("lib/campaigns/launch.ts", "utf8");

  it("returns null on failure rather than throwing", () => {
    /**
     * The whole feature is an enhancement to an opening line. An enhancement
     * that can fail a campaign launch is a bug with a nice name, so every exit
     * from the lookup is a null and the outer try/catch covers even a Firestore
     * outage.
     */
    expect(source).toMatch(/} catch \{[\s\S]{0,200}return null;/);
    expect(source).not.toMatch(/throw new/);
  });

  it("caches failures as well as successes", () => {
    // Without this every launch retries the same unreachable site forever, and
    // the sites most likely to fail are the ones most likely to be retried.
    expect(source).toContain("failed: summary === \"\"");
    expect(source).toContain("NEGATIVE_TTL_MS");
    // A negative must expire sooner than a success: sites come back.
    const ttl = Number(source.match(/const TTL_MS = (\d+)/)?.[1] ?? 0);
    const negative = Number(source.match(/const NEGATIVE_TTL_MS = (\d+)/)?.[1] ?? 0);
    expect(negative).toBeLessThan(ttl);
  });

  it("resolves each distinct domain once per launch, before writing openers", () => {
    /**
     * Not merely an optimization. Doing the lookup inside the opener loop lets
     * contacts at one company race each other: several workers start fetching
     * the same site before any of them writes the cache, so the prospect sees a
     * burst of requests from us for no benefit.
     */
    const block = launch.slice(launch.indexOf("const domains = ["), launch.indexOf("await batchCreateRecipients"));
    expect(block).toContain("new Set(");
    // The dedupe must come before the opener pass, not after it.
    expect(launch.indexOf("const domains = [")).toBeLessThan(
      launch.indexOf("r.aiOpenerSnapshot = await generateOpener")
    );
  });
});

describe("grounding the opener in what the site actually said", () => {
  const opener = readFileSync("lib/ai/generateOpener.ts", "utf8");

  it("only tells the model to be specific when it has something to be specific about", () => {
    /**
     * The instruction inverts on purpose. Told to be specific about a company
     * with no facts in hand, a model invents: it will congratulate someone on an
     * expansion that never happened. The grounded rules are appended only when a
     * summary exists, so "be specific" always means "about this, and nothing
     * else".
     */
    expect(opener).toContain("const GROUNDED");
    expect(opener).toMatch(/grounded \? `\$\{SYSTEM\}\$\{GROUNDED\}` : SYSTEM/);
    expect(opener).toContain("Use ONLY what the description states");
  });

  it("offers a safe general line as the fallback rather than a guess", () => {
    // The instruction has to say which way to fail, or the model picks the
    // confident wrong sentence about a real company.
    expect(opener).toMatch(/too thin[\s\S]{0,160}general line/i);
  });

  it("lowers the temperature once there are facts to be faithful to", () => {
    // High temperature buys drift, and with a real summary in context the only
    // thing to drift away from is the thing keeping the line true.
    expect(opener).toMatch(/temperature: grounded \? 0\.\d+ : 0\.\d+/);
  });

  it("never tells the prospect their website was read", () => {
    expect(opener).toContain("Never mention that you read their website");
  });
});
