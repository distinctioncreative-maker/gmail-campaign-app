import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { plausibleAddress } from "@/lib/ai/suggestSenderIdentity";

describe("accepting an address read off a website", () => {
  it("takes a complete postal address", () => {
    for (const address of [
      "1200 Market Street, Suite 400, Denver, CO 80202",
      "Unit 7, 44 Bridge Road, Manchester, M1 2AB, United Kingdom",
      "PO Box 1194, Austin, TX 78767",
    ]) {
      expect(plausibleAddress(address), address).toBe(address);
    }
  });

  it("rejects a fragment rather than printing half an address in a footer", () => {
    /**
     * This is the check that earns its place. The field it fills is the legal
     * footer on every commercial email the customer sends, and a half-answer is
     * worse than a blank in a specific way: a blank prompts someone to type
     * their address, while "London, UK" sitting in the box looks deliberate and
     * gets saved without a second glance.
     */
    for (const fragment of ["London, UK", "United States", "Denver", "", "   ", "Suite 4"]) {
      expect(plausibleAddress(fragment), fragment).toBe("");
    }
  });

  it("requires a number, because every real postal address has one", () => {
    expect(plausibleAddress("Market Street, Denver, Colorado")).toBe("");
  });

  it("requires more than one part, so a bare postcode does not pass", () => {
    expect(plausibleAddress("CO 80202")).toBe("");
  });
});

describe("what the profile form asks a person to type", () => {
  const form = readFileSync("components/ProfileForm.tsx", "utf8");
  const onboarding = readFileSync("app/(dashboard)/onboarding/page.tsx", "utf8");
  const identity = readFileSync("lib/ai/suggestSenderIdentity.ts", "utf8");

  it("offers to read the fields off the company's own website", () => {
    // Nine text fields is the longest form in the product, it is the one a
    // trial user meets on day one, and two of its fields block campaign launch.
    expect(form).toContain("/api/settings/profile/suggest");
    expect(form).toContain("Fill the rest from my website");
  });

  it("fills only blanks, never replacing an answer someone gave", () => {
    expect(form).toContain("!profile.companyName.trim()");
    expect(form).toContain("!profile.physicalAddress.trim()");
  });

  it("decides what was filled outside the state updater", () => {
    /**
     * A state updater has to be a pure function of its argument, because React
     * is free to call it twice. An earlier version appended to the "filled"
     * list from inside it, which would report each field twice while filling it
     * once.
     */
    const body = form.slice(form.indexOf("async function readSite"), form.indexOf("const input ="));
    const updaterStart = body.indexOf("setProfile((p) => ({");
    const updaterEnd = body.indexOf("}));", updaterStart);
    expect(body.slice(updaterStart, updaterEnd)).not.toContain("filled");
  });

  it("seeds the name and address from the account that was just connected", () => {
    // The step before this one connects Gmail. Asking someone to type the
    // address of the mailbox they just authorised is asking them to do the
    // computer's work.
    expect(onboarding).toContain("profile.senderName || ctx.user.displayName");
    expect(onboarding).toContain("connection.connectedEmail");
  });

  it("keeps a saved value ahead of anything seeded", () => {
    // Someone who set a sending name different from their Google profile name
    // must not have it reverted on their next visit to onboarding.
    expect(onboarding).toMatch(/senderName: profile\.senderName \|\|/);
    expect(onboarding).toMatch(/senderEmail:\s*\n?\s*profile\.senderEmail \|\|/);
  });

  it("never guesses the two fields a website cannot answer", () => {
    /**
     * The opt-out sentence is in the sender's own voice and has a good default
     * already. The signature is personal rather than corporate, and is the one
     * field where a plausible invention is visible to the recipient.
     */
    // Checked against the prompt and the returned shape, not the whole file:
    // the comment above them names both excluded fields in order to explain why
    // they are excluded, and a rule that forbids describing itself gets worked
    // around instead of understood.
    const prompt = identity.slice(identity.indexOf("const SYSTEM"), identity.indexOf("export interface"));
    const returned = identity.slice(identity.indexOf("  return {"), identity.indexOf("export function plausibleAddress"));
    for (const scope of [prompt, returned]) {
      expect(scope).not.toContain("unsubscribeText");
      expect(scope.toLowerCase()).not.toContain("signature");
    }
    expect(prompt).toContain("companyName");
    expect(prompt).toContain("physicalAddress");
  });

  it("transcribes at zero temperature", () => {
    // A hallucinated street address is a compliance problem printed on every
    // message the customer sends.
    expect(identity).toContain("temperature: 0,");
  });
});
