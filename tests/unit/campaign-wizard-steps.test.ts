import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  needsSendConfirmation,
  SEND_CONFIRM_THRESHOLD,
  SEND_CONFIRM_WORD,
} from "@/lib/campaigns/confirmThreshold";

const wizard = readFileSync("components/campaign/CampaignWizard.tsx", "utf8");
const launchRoute = readFileSync("app/api/campaigns/[campaignId]/launch/route.ts", "utf8");

describe("how many steps it takes to send a campaign", () => {
  it("does not split the summary from the button it summarizes", () => {
    /**
     * There were two consecutive screens here. "Safety check" listed what was
     * about to happen; "Launch" listed what was about to happen and had the
     * button. One job, two screens, and a Continue click between them on every
     * campaign anyone ever sends.
     */
    const steps = wizard.match(/const STEPS = \[([^\]]+)\]/)?.[1] ?? "";
    expect(steps).not.toContain("Safety check");
    expect(steps.split(",").length).toBe(6);
  });

  it("keeps the steps that actually ask for something", () => {
    // Guards the guard: collapsing the wizard is only an improvement while the
    // steps carrying real decisions survive.
    const steps = wizard.match(/const STEPS = \[([^\]]+)\]/)?.[1] ?? "";
    for (const kept of ["Name", "Leads", "Email", "Schedule", "Launch"]) {
      expect(steps, `${kept} step went missing`).toContain(kept);
    }
  });

  it("hides the navigation on the final step, whichever number that now is", () => {
    // The bound moved with the merge. Left at the old value the Continue button
    // would render on the launch screen and step past the end.
    const final = (wizard.match(/const STEPS = \[([^\]]+)\]/)?.[1] ?? "").split(",").length - 1;
    expect(wizard).toContain(`{step < ${final} && (`);
    expect(wizard).toContain(`{step === ${final} && (`);
  });
});

describe("the confirmation for a large campaign", () => {
  it("is one threshold, not two", () => {
    /**
     * It was written twice: the route refused a launch over 100 without the
     * confirmation, and the wizard used its own literal to decide when to show
     * the box. The drift is silent and one-directional. Raise the server alone
     * and the box appears when it need not, which is annoying. Raise the client
     * alone and the box stops appearing when it is still required, so the launch
     * fails at the final button citing a field nobody was shown.
     */
    expect(wizard).not.toMatch(/counts\.selected > \d+/);
    expect(launchRoute).not.toMatch(/const SEND_CONFIRM_THRESHOLD = \d+/);
    expect(wizard).toContain("needsSendConfirmation(counts.selected)");
    expect(launchRoute).toContain("needsSendConfirmation(includedCount)");
  });

  it("gates the launch button rather than letting the server refuse it", () => {
    // The server is still the rule. Checking here too means someone learns they
    // missed the field while looking at it, not after pressing Start.
    expect(wizard).toContain("const confirmMissing =");
    expect(wizard).toContain("disabled={busy || confirmMissing}");
  });

  it("agrees with the server on the exact word", () => {
    expect(launchRoute).toContain("body.confirmText !== SEND_CONFIRM_WORD");
    expect(SEND_CONFIRM_WORD).toBe("SEND");
  });

  it("triggers strictly above the threshold", () => {
    expect(needsSendConfirmation(SEND_CONFIRM_THRESHOLD)).toBe(false);
    expect(needsSendConfirmation(SEND_CONFIRM_THRESHOLD + 1)).toBe(true);
    expect(needsSendConfirmation(0)).toBe(false);
  });
});
