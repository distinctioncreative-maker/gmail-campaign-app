import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  STEP_UP_ACTIONS,
  STEP_UP_WINDOW_MS,
  isPlatformOperator,
  needsStepUp,
  parseOperatorEmails,
  platformConfigured,
  stepUpSatisfied,
} from "@/lib/platform/operators";
import { assessWorkspace } from "@/lib/platform/checkup";
import { PlatformSettingsSchema, PlanOverrideSchema } from "@/schemas/platform";

describe("the operator list", () => {
  const LIST = "owner@example.com, second@example.com";

  it("matches a configured operator", () => {
    expect(isPlatformOperator("owner@example.com", LIST)).toBe(true);
    expect(isPlatformOperator("OWNER@Example.com", LIST)).toBe(true);
    expect(isPlatformOperator(" owner@example.com ", LIST)).toBe(true);
  });

  it("refuses everyone else", () => {
    expect(isPlatformOperator("someone@example.com", LIST)).toBe(false);
    expect(isPlatformOperator("", LIST)).toBe(false);
    expect(isPlatformOperator("owner", LIST)).toBe(false);
  });

  it("does not match by domain", () => {
    // "Anyone at my company" is how an operator list quietly grows to include a
    // contractor's account, and the blast radius here is every customer's data.
    expect(isPlatformOperator("intern@example.com", "@example.com")).toBe(false);
    expect(parseOperatorEmails("@example.com")).toEqual([]);
  });

  it("ignores a typo'd entry rather than treating it as a wildcard", () => {
    expect(parseOperatorEmails("owner@example.com, notanemail, *")).toEqual([
      "owner@example.com",
    ]);
  });

  it("reports an unconfigured deployment as having no portal", () => {
    // The portal should behave as though it does not exist rather than as though
    // nobody has access to it.
    expect(platformConfigured("")).toBe(false);
    expect(platformConfigured("   ")).toBe(false);
    expect(platformConfigured("notanemail")).toBe(false);
    expect(platformConfigured("owner@example.com")).toBe(true);
  });

  it("accepts whitespace or comma separation, since both get typed", () => {
    expect(parseOperatorEmails("a@b.com\nc@d.com  e@f.com")).toEqual([
      "a@b.com",
      "c@d.com",
      "e@f.com",
    ]);
  });
});

describe("step-up on destructive actions", () => {
  const now = 1_700_000_000_000;

  it("accepts a recent sign-in", () => {
    expect(stepUpSatisfied(now / 1000 - 60, now)).toBe(true);
  });

  it("refuses a stale one", () => {
    // A five-day session should not be enough to suspend a customer.
    expect(stepUpSatisfied(now / 1000 - STEP_UP_WINDOW_MS / 1000 - 60, now)).toBe(false);
  });

  it("fails closed on a missing or unreadable auth time", () => {
    // An unknown authentication time is not a recent one.
    expect(stepUpSatisfied(null, now)).toBe(false);
    expect(stepUpSatisfied(undefined, now)).toBe(false);
    expect(stepUpSatisfied(0, now)).toBe(false);
    expect(stepUpSatisfied(NaN, now)).toBe(false);
  });

  it("refuses a future auth time, which means a clock problem", () => {
    // Trusting it would make the window effectively infinite.
    expect(stepUpSatisfied(now / 1000 + 3600, now)).toBe(false);
  });

  it("covers every action the portal can perform", () => {
    // Everything the owner route accepts is a state change, so nothing in it
    // should be able to run on a five-day-old session.
    for (const action of [
      "signup.mode",
      "readonly.mode",
      "sending.halted",
      "notice.banner",
      "workspace.suspend",
      "workspace.unsuspend",
      "identity.ban",
      "identity.unban",
      "plan.override",
      "plan.override_cleared",
    ]) {
      expect(needsStepUp(action), action).toBe(true);
    }
    expect(STEP_UP_ACTIONS.length).toBe(10);
  });
});

describe("platform settings", () => {
  it("leaves signup mode unset rather than defaulting it", () => {
    // A stored "allowlist" and an unset value are different facts, and only one
    // of them was a decision. Defaulting would silently override the
    // deployment's own configuration.
    const parsed = PlatformSettingsSchema.parse({ updatedAt: 1 });
    expect(parsed.signupMode).toBeNull();
  });

  it("defaults every incident control to off", () => {
    const parsed = PlatformSettingsSchema.parse({ updatedAt: 1 });
    expect(parsed.readOnlyMode).toBe(false);
    expect(parsed.sendingHalted).toBe(false);
    expect(parsed.noticeBanner).toBe("");
  });

  it("refuses a signup mode nothing implements", () => {
    expect(() =>
      PlatformSettingsSchema.parse({ updatedAt: 1, signupMode: "invite-only" })
    ).toThrow();
  });
});

describe("plan overrides", () => {
  it("require a reason", () => {
    // An override with no explanation is indistinguishable from a mistake six
    // months later.
    expect(() =>
      PlanOverrideSchema.parse({
        organizationId: "org1",
        plan: "TEAM",
        note: "",
        setByEmail: "owner@example.com",
        setAt: 1,
      })
    ).toThrow();
  });

  it("refuse a plan that is not in the catalog", () => {
    // The catalog stays in code because plan limits gate send caps and seat
    // counts; an override must pick from it, not invent a tier.
    expect(() =>
      PlanOverrideSchema.parse({
        organizationId: "org1",
        plan: "UNLIMITED",
        note: "comped",
        setByEmail: "owner@example.com",
        setAt: 1,
      })
    ).toThrow();
  });
});

describe("the abuse checkup", () => {
  const base = {
    organizationId: "org1",
    name: "Acme",
    sendingMode: "LIVE" as const,
    sentCount: 0,
    bounceCount: 0,
    unsubscribeCount: 0,
    replyCount: 0,
    campaignCount: 1,
  };

  it("says nothing about a healthy workspace", () => {
    const risk = assessWorkspace({ ...base, sentCount: 1000, replyCount: 40, bounceCount: 5 });
    expect(risk.verdict).toBe("OK");
    expect(risk.reasons).toEqual([]);
  });

  it("escalates a bounce rate that spends the platform's reputation", () => {
    const risk = assessWorkspace({ ...base, sentCount: 1000, bounceCount: 80, replyCount: 20 });
    expect(risk.verdict).toBe("ACT");
    expect(risk.reasons.join(" ")).toMatch(/reputation/i);
  });

  it("flags high volume with no engagement", () => {
    // The signature of a scraped list being worked through.
    const risk = assessWorkspace({ ...base, sentCount: 5000, replyCount: 3 });
    expect(risk.verdict).not.toBe("OK");
    expect(risk.reasons.join(" ")).toMatch(/opted into|engagement/i);
  });

  it("flags an opt-out rate, because complaints follow opt-outs", () => {
    const risk = assessWorkspace({ ...base, sentCount: 1000, unsubscribeCount: 30, replyCount: 40 });
    expect(risk.reasons.join(" ")).toMatch(/opted out/i);
  });

  it("does not judge a workspace that has barely sent anything", () => {
    // One bounce out of three is 33% and means nothing; a checkup that fires on
    // noise is one an operator learns to ignore.
    const risk = assessWorkspace({ ...base, sentCount: 3, bounceCount: 1 });
    expect(risk.verdict).toBe("OK");
  });
});

describe("the portal's guards, by sweep", () => {
  function routes(): { id: string; source: string }[] {
    const found: { id: string; source: string }[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) walk(path);
        else if (entry.name === "route.ts") {
          found.push({ id: dir.replace(/^app\//, ""), source: readFileSync(path, "utf8") });
        }
      }
    };
    walk("app");
    return found;
  }
  const all = routes();

  it("guards every owner route with requireOperator", () => {
    // The single most important assertion in this file. requireRole("ADMIN")
    // would look identical to every other admin route in the app and would hand
    // platform control to every customer, because the first member of each new
    // workspace becomes its ADMIN automatically.
    const owner = all.filter(({ id }) => id.startsWith("api/owner"));
    expect(owner.length).toBeGreaterThan(0);
    expect(
      owner.filter(({ source }) => !source.includes("requireOperator") && !source.includes("requireStepUp")).map(({ id }) => id)
    ).toEqual([]);
  });

  it("never gates a platform action on a workspace role", () => {
    const owner = all.filter(({ id }) => id.startsWith("api/owner"));
    expect(owner.filter(({ source }) => source.includes("requireRole(")).map(({ id }) => id)).toEqual(
      []
    );
  });

  it("keeps the operator list out of the database entirely", () => {
    // If this ever reads from Firestore, the root of trust has moved into the
    // thing it was meant to be independent of.
    const operators = readFileSync("lib/platform/operators.ts", "utf8");
    expect(operators).not.toContain("firestore");
    expect(operators).not.toContain("firebase");
  });

  it("authenticates before it parses the body", () => {
    // Parsing first leaked the endpoint's existence: valid JSON from a
    // non-operator returned 404 while malformed JSON returned 400, and the
    // difference confirms both that the route is real and that the payload shape
    // was right. That is the pair of facts the 404 exists to withhold.
    const route = readFileSync("app/api/owner/route.ts", "utf8");
    const guardAt = route.indexOf("requireStepUp()");
    const parseAt = route.indexOf("ActionSchema.parse(");
    expect(guardAt).toBeGreaterThan(0);
    expect(parseAt).toBeGreaterThan(guardAt);
  });

  it("keeps the portal out of robots.txt", () => {
    // Every other private path is listed there, because they are all guessable
    // from the product's navigation and listing them stops a crawler indexing a
    // signed-in page. This one is not guessable, and robots.txt is public: adding
    // it would publish the location of the most privileged surface in the system.
    // The noindex meta in the layout is the stronger signal anyway.
    expect(readFileSync("app/robots.ts", "utf8")).not.toMatch(/"\/owner/);
    expect(readFileSync("app/owner/layout.tsx", "utf8")).toContain("index: false");
  });

  it("never prerenders the portal", () => {
    // The bug this catches shipped once. requireOperator refuses before reading a
    // cookie, so at build time it 404s, and Next.js then treats the route as
    // static and serves that 404 forever: the build passes, every test passes,
    // and the page is broken for the only person meant to see it.
    const page = readFileSync("app/owner/page.tsx", "utf8");
    expect(page).toContain('export const dynamic = "force-dynamic"');
  });

  it("stops sending for a suspended workspace in the worker, not only in the UI", () => {
    // A suspension that does not stop the queue is not a suspension: already
    // enqueued Cloud Tasks would keep sending for days.
    const worker = readFileSync("app/api/tasks/send-message/route.ts", "utf8");
    expect(worker).toContain("isOrganizationSuspended");
    expect(worker).toContain("sendingHalted");
  });

  it("checks the ban list on every request, not only at sign-in", () => {
    // A cookie minted before the ban would otherwise stay good for five days.
    const guard = readFileSync("lib/auth/requireUser.ts", "utf8");
    expect(guard).toContain("isEmailBanned");
  });

  it("leaves a way back in when signup is closed", () => {
    // This shipped as an unrecoverable lockout and was reached in practice.
    // Reopening signup needs requireStepUp; step-up needs a sign-in inside the
    // last 30 minutes; signing in is exactly what "closed" refuses. The stored
    // value also wins over SIGNUP_MODE, so a redeploy could not undo it either.
    // The only remaining exit was hand-editing Firestore, which is not a thing
    // to discover during the incident that made you close the doors.
    //
    // An operator is now exempt from the signup gate. That is safe precisely
    // because the list lives in an environment variable: no database write and
    // no workspace role can put an address on it.
    const session = readFileSync("lib/auth/session.ts", "utf8");
    expect(session).toContain("isPlatformOperator");
    expect(session).toContain("PLATFORM_OWNER_EMAILS");
    expect(session).toMatch(/signupMode === "closed" && !isOperator/);

    // The exemption must not outrank the ban list: an operator who is banned
    // stays banned, so the ban check has to come after it.
    const exemptionAt = session.indexOf("const isOperator");
    const banAt = session.indexOf("isEmailBanned(email)");
    expect(exemptionAt).toBeGreaterThan(0);
    expect(banAt).toBeGreaterThan(exemptionAt);
  });

  it("does not tell locked-out customers their account still works", () => {
    // The gate runs at cookie mint, which happens on every sign-in and not only
    // the first, so "closed" locks out existing customers too. The old copy read
    // "If you already have an account, contact support", which is an invitation
    // to open a ticket support cannot resolve.
    const session = readFileSync("lib/auth/session.ts", "utf8");
    expect(session).toContain("including for existing accounts");
    expect(session).not.toContain("If you already have an account, contact support");
  });

  it("warns before the heaviest switch on the page", () => {
    // "closed" reads as "stop new signups" and is actually "stop all sign-in".
    const owner = readFileSync("components/owner/OwnerConsole.tsx", "utf8");
    expect(owner).toContain("chooseSignupMode");
    expect(owner).toContain("not just new accounts");
  });
});
