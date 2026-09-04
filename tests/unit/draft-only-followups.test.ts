import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildNextFollowupQueueItem } from "@/lib/campaigns/followups";
import { queueTypeFor } from "@/lib/campaigns/queueType";
import type { Campaign } from "@/schemas/campaign";
import type { Sequence } from "@/schemas/sequence";

/** Source with comments stripped, because these rules are about what runs. */
const code = (path: string) =>
  readFileSync(path, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

const completedAt = Date.UTC(2026, 6, 21, 14, 0);

const baseCampaign = {
  campaignId: "campaign-1",
  ownerUserId: "user-1",
  organizationId: "org-1",
  sequenceId: "sequence-1",
  draftStrategy: "SEND",
  schedule: {
    timezone: "America/New_York",
    allowedWeekdays: [1, 2, 3, 4, 5],
    startAt: null,
    sendWindowStart: "09:00",
    sendWindowEnd: "17:00",
    emailsPerBatch: 5,
    minDelaySeconds: 30,
    maxDelaySeconds: 90,
    interBatchDelayMinutes: 2,
    dailySendLimit: 100,
  },
} as unknown as Campaign;

const sequence = {
  sequenceId: "sequence-1",
  active: true,
  steps: [
    {
      stepId: "step-1",
      delayValue: 60,
      delayUnit: "MINUTES",
      bodyMode: "SAME",
      templateId: null,
      customSubject: "",
      customHtml: "",
      enabled: true,
    },
  ],
} as unknown as Sequence;

const owner = { organizationId: "org-1", userId: "user-1" };

/**
 * DRAFT_ONLY means nothing is sent. It meant it for one message.
 *
 * `launch.ts` chose CREATE_INITIAL_DRAFT or SEND_INITIAL from the campaign's
 * draftStrategy. `followups.ts` hard-coded SEND_FOLLOWUP. So a campaign set to
 * draft-only wrote a Gmail draft for the first email and then, on whatever
 * delay the sequence specified, sent every follow-up as real mail to real
 * people who had never been emailed by this campaign at all.
 *
 * The worker had always handled CREATE_FOLLOWUP_DRAFT, treating it exactly as
 * it treats CREATE_INITIAL_DRAFT. Nothing had ever produced it. The whole
 * defect was that one of two enqueue sites made a decision the other did not,
 * so that is what these tests pin: not the helper's return value alone, but
 * that both stages agree, and that they are physically incapable of
 * disagreeing again.
 */
describe("a draft-only campaign drafts its follow-ups instead of sending them", () => {
  it("enqueues a draft, not a send, for the follow-up", () => {
    const item = buildNextFollowupQueueItem(
      owner,
      { ...baseCampaign, draftStrategy: "DRAFT_ONLY" } as Campaign,
      sequence,
      "recipient-1",
      0,
      completedAt
    );
    expect(item).not.toBeNull();
    expect(item!.type).toBe("CREATE_FOLLOWUP_DRAFT");
  });

  it("still sends the follow-up for a normal campaign", () => {
    // The half that must not change. A fix that drafts everything is not a fix.
    const item = buildNextFollowupQueueItem(
      owner,
      baseCampaign,
      sequence,
      "recipient-1",
      0,
      completedAt
    );
    expect(item!.type).toBe("SEND_FOLLOWUP");
  });

  it("treats a campaign with no strategy set as sending", () => {
    // draftStrategy defaults to "SEND" in the schema. A campaign that predates
    // the field must behave exactly as it does today.
    const { draftStrategy, ...withoutStrategy } = baseCampaign as Campaign & {
      draftStrategy?: string;
    };
    void draftStrategy;
    const item = buildNextFollowupQueueItem(
      owner,
      withoutStrategy as Campaign,
      sequence,
      "recipient-1",
      0,
      completedAt
    );
    expect(item!.type).toBe("SEND_FOLLOWUP");
  });

  it("agrees with the initial message at both stages", () => {
    for (const strategy of ["SEND", "DRAFT_ONLY"] as const) {
      const campaign = { draftStrategy: strategy } as Campaign;
      const initial = queueTypeFor(campaign, "initial");
      const followup = queueTypeFor(campaign, "followup");
      const drafts = (t: string) => t.startsWith("CREATE_");
      expect(
        drafts(initial),
        `${strategy}: initial and follow-up must both draft or both send`
      ).toBe(drafts(followup));
    }
  });
});

/**
 * The rule, rather than the two call sites.
 *
 * Fixing followups.ts by pasting the same conditional next to launch.ts's copy
 * would satisfy every test above and leave the next stage free to forget it
 * again, which is precisely how this happened. So the enqueue sites are
 * required to route through the one function.
 */
describe("neither enqueue site can decide this on its own again", () => {
  const enqueueSites = ["lib/campaigns/launch.ts", "lib/campaigns/followups.ts"];

  it("routes both through the shared decision", () => {
    for (const path of enqueueSites) {
      expect(code(path), path).toMatch(/queueTypeFor\(campaign, "(initial|followup)"\)/);
    }
  });

  it("leaves no enqueue site naming a message type inline", () => {
    // A literal type on a queue item being built is the shape of the bug.
    for (const path of enqueueSites) {
      expect(code(path), path).not.toMatch(
        /type:\s*"(SEND_INITIAL|SEND_FOLLOWUP|CREATE_INITIAL_DRAFT|CREATE_FOLLOWUP_DRAFT)"/
      );
      expect(code(path), path).not.toMatch(/draftStrategy\s*===/);
    }
  });

  it("keeps the decision itself in one place", () => {
    // Non-vacuity: without this, deleting queueType.ts and every call would
    // satisfy both rules above.
    const helper = code("lib/campaigns/queueType.ts");
    expect(helper).toContain('draftStrategy === "DRAFT_ONLY"');
    expect(helper).toContain("CREATE_FOLLOWUP_DRAFT");
    expect(helper).toContain("CREATE_INITIAL_DRAFT");
  });
});
