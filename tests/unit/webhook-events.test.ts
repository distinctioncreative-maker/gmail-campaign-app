import { describe, expect, it } from "vitest";
import {
  buildEnvelope,
  contactUnsubscribedData,
  dealUpdatedData,
  emailBouncedData,
  replyReceivedData,
  serializeEnvelope,
  testPingData,
} from "@/lib/webhooks/payload";
import {
  DELIVERY_HEADER,
  EVENT_HEADER,
  SIGNATURE_HEADER,
  TIMESTAMP_HEADER,
  signWebhook,
  verifyWebhook,
} from "@/lib/webhooks/signature";
import {
  AUTO_DISABLE_AFTER_FAILURES,
  decideRetry,
  shouldDisableAfterFailures,
} from "@/lib/webhooks/retry";
import { postDelivery } from "@/lib/webhooks/deliver";
import { WEBHOOK_EVENTS, WebhookDeliverySchema } from "@/schemas/integration";

const REF = {
  campaignId: "c1",
  campaignName: "Q3 outreach",
  recipientId: "r1",
  email: "lead@example.com",
};

function envelopeFor(data: Record<string, unknown>) {
  return buildEnvelope({
    deliveryId: "d-1",
    event: "reply.received",
    organizationId: "org-1",
    occurredAt: 1_700_000_000_000,
    data,
  });
}

describe("the event envelope", () => {
  it("carries the fields a receiver routes and deduplicates on", () => {
    const envelope = envelopeFor(replyReceivedData({ ...REF, replyIntent: "INTERESTED", snippet: "yes", repliedAt: 1 }));
    expect(envelope.id).toBe("d-1");
    expect(envelope.event).toBe("reply.received");
    expect(envelope.workspaceId).toBe("org-1");
    expect(typeof envelope.createdAt).toBe("number");
    expect(envelope.data).toBeTypeOf("object");
  });

  it("keeps every event-specific field inside data", () => {
    // The envelope is a published interface. A builder that put its fields
    // beside `data` rather than inside it would break a receiver that reads the
    // envelope generically and hands `data` to per-event code.
    const envelope = envelopeFor(emailBouncedData({ ...REF, bounceType: "HARD", bouncedAt: 1 }));
    expect(Object.keys(envelope).sort()).toEqual([
      "createdAt",
      "data",
      "event",
      "id",
      "workspaceId",
    ]);
  });

  it("serializes to something a receiver can verify with the documented scheme", () => {
    // The whole point of signing `timestamp.body`: prove the bytes we send are
    // the bytes the documented verifier accepts.
    const body = serializeEnvelope(envelopeFor(testPingData({ triggeredByUserId: "u1" })));
    const secret = "whsec_test";
    const timestampSeconds = 1_700_000_000;
    const signature = signWebhook(secret, timestampSeconds, body);
    expect(
      verifyWebhook({ secret, signature, timestampSeconds, body, nowMs: timestampSeconds * 1000 })
        .valid
    ).toBe(true);
  });

  it("changes the signature when a single byte of the body changes", () => {
    const secret = "whsec_test";
    const ts = 1_700_000_000;
    const body = serializeEnvelope(envelopeFor(testPingData({ triggeredByUserId: "u1" })));
    const signature = signWebhook(secret, ts, body);
    const verdict = verifyWebhook({
      secret,
      signature,
      timestampSeconds: ts,
      body: `${body} `,
      nowMs: ts * 1000,
    });
    expect(verdict.valid).toBe(false);
  });
});

describe("reply.received", () => {
  it("reports how the reply read and who sent it", () => {
    const data = replyReceivedData({
      ...REF,
      replyIntent: "INTERESTED",
      snippet: "Sure, Tuesday works",
      repliedAt: 42,
    });
    expect(data.email).toBe("lead@example.com");
    expect(data.replyIntent).toBe("INTERESTED");
    expect(data.preview).toBe("Sure, Tuesday works");
    expect(data.repliedAt).toBe(42);
  });

  it("caps the preview rather than posting a transcript to a third party", () => {
    const data = replyReceivedData({
      ...REF,
      replyIntent: "REPLIED",
      snippet: "x".repeat(5000),
      repliedAt: 1,
    });
    expect(String(data.preview).length).toBeLessThanOrEqual(281);
  });

  it("flattens newlines so a quoted reply does not smuggle structure into the field", () => {
    const data = replyReceivedData({
      ...REF,
      replyIntent: "REPLIED",
      snippet: "line one\n\n  line two\ttab",
      repliedAt: 1,
    });
    expect(data.preview).toBe("line one line two tab");
  });

  it("carries no field the emitter did not intend", () => {
    // Guards against a future change spreading a whole Recipient in here, which
    // would post lead notes, thread ids, and tracking state to an external URL.
    expect(
      Object.keys(
        replyReceivedData({ ...REF, replyIntent: null, snippet: "", repliedAt: 1 })
      ).sort()
    ).toEqual([
      "campaignId",
      "campaignName",
      "email",
      "preview",
      "recipientId",
      "repliedAt",
      "replyIntent",
    ]);
  });
});

describe("email.bounced", () => {
  it("says whether the address was also suppressed", () => {
    // A receiver mirroring our do-not-email list needs this, and deriving it
    // from bounceType on their side means every integration reimplements the
    // same rule.
    expect(emailBouncedData({ ...REF, bounceType: "HARD", bouncedAt: 1 }).suppressed).toBe(true);
    expect(emailBouncedData({ ...REF, bounceType: "SOFT", bouncedAt: 1 }).suppressed).toBe(false);
  });

  it("passes an unreadable bounce through as UNKNOWN rather than guessing SOFT", () => {
    // classifyBounce returns three values, not two. Collapsing UNKNOWN into
    // SOFT would have a receiver keep emailing an address we could not classify,
    // or retire one we could not either. Neither is ours to decide for them.
    const data = emailBouncedData({ ...REF, bounceType: "UNKNOWN", bouncedAt: 1 });
    expect(data.bounceType).toBe("UNKNOWN");
    expect(data.suppressed).toBe(false);
  });
});

describe("contact.unsubscribed", () => {
  it("distinguishes the one-click link from a reply asking to be removed", () => {
    expect(
      contactUnsubscribedData({
        email: "a@b.com",
        source: "UNSUBSCRIBE_LINK",
        unsubscribedAt: 1,
      }).source
    ).toBe("UNSUBSCRIBE_LINK");
    expect(
      contactUnsubscribedData({ email: "a@b.com", source: "REPLY_MONITOR", unsubscribedAt: 1 })
        .source
    ).toBe("REPLY_MONITOR");
  });

  it("keeps the campaign fields present as null rather than absent", () => {
    // A receiver reading data.campaignId should get null, not undefined that
    // JSON.stringify silently drops, leaving them to guess whether the key was
    // omitted or the value was unknown.
    const data = contactUnsubscribedData({
      email: "a@b.com",
      source: "UNSUBSCRIBE_LINK",
      unsubscribedAt: 1,
    });
    expect(JSON.parse(JSON.stringify(data))).toMatchObject({
      campaignId: null,
      campaignName: null,
      recipientId: null,
    });
  });
});

describe("deal.updated", () => {
  it("reports the value in minor units, unrounded", () => {
    const data = dealUpdatedData({
      ...REF,
      dealStatus: "WON",
      dealValueCents: 250_050,
      dealNote: "annual",
      updatedAt: 7,
    });
    expect(data.dealValueCents).toBe(250_050);
    expect(data.dealStatus).toBe("WON");
  });

  it("expresses a cleared outcome as null, so an undo is receivable", () => {
    const data = dealUpdatedData({
      ...REF,
      dealStatus: null,
      dealValueCents: null,
      dealNote: "",
      updatedAt: 7,
    });
    expect(data.dealStatus).toBeNull();
    expect(data.dealValueCents).toBeNull();
  });
});

describe("the test ping", () => {
  it("is unmistakably a test on the receiving end", () => {
    // A customer wiring up verification must not have their receiver create a
    // record from it.
    const data = testPingData({ triggeredByUserId: "u1" });
    expect(data.test).toBe(true);
    expect(String(data.message).toLowerCase()).toContain("test");
  });

  it("is not something a subscription can ask for", () => {
    expect(WEBHOOK_EVENTS as readonly string[]).not.toContain("test.ping");
  });
});

describe("postDelivery", () => {
  const base = {
    url: "https://hooks.example.com/cadence",
    secret: "whsec_test",
    event: "reply.received",
    deliveryId: "d-9",
    body: '{"id":"d-9"}',
    nowMs: 1_700_000_000_000,
  };

  it("signs the request so the receiver can verify it with the secret alone", async () => {
    let seen: RequestInit & { headers?: Record<string, string> } = {};
    const fetchImpl = (async (_url: string, init: RequestInit) => {
      seen = init as typeof seen;
      return new Response("", { status: 200 });
    }) as unknown as typeof fetch;

    await postDelivery({ ...base, fetchImpl });

    const headers = seen.headers as Record<string, string>;
    const verdict = verifyWebhook({
      secret: base.secret,
      signature: headers[SIGNATURE_HEADER],
      timestampSeconds: Number(headers[TIMESTAMP_HEADER]),
      body: base.body,
      nowMs: base.nowMs,
    });
    expect(verdict.valid).toBe(true);
    expect(headers[EVENT_HEADER]).toBe("reply.received");
    expect(headers[DELIVERY_HEADER]).toBe("d-9");
  });

  it("sends the stored body byte for byte", async () => {
    // The signature is over these exact bytes. Re-serializing here would make a
    // retry present a body whose signature no longer matches what was signed.
    let sent: unknown = null;
    const fetchImpl = (async (_url: string, init: RequestInit) => {
      sent = init.body;
      return new Response("", { status: 202 });
    }) as unknown as typeof fetch;
    await postDelivery({ ...base, fetchImpl });
    expect(sent).toBe(base.body);
  });

  it("never follows a redirect", async () => {
    // A followed redirect would let a subscription aim our server anywhere by
    // returning a Location header, which makes the URL validation decorative.
    let mode: RequestRedirect | undefined;
    const fetchImpl = (async (_url: string, init: RequestInit) => {
      mode = init.redirect;
      return new Response("", { status: 302 });
    }) as unknown as typeof fetch;
    const result = await postDelivery({ ...base, fetchImpl });
    expect(mode).toBe("manual");
    expect(result.status).toBe(302);
  });

  it("treats a redirect as permanently failed, with a reason that says what to do", () => {
    const decision = decideRetry({ status: 302, attempt: 1 }, () => 0.5);
    expect(decision.outcome).toBe("FAILED");
    expect(decision.reason).toMatch(/redirect/i);
    expect(decision.reason).toMatch(/final URL/i);
  });

  it("returns no status when the request never got one", async () => {
    const fetchImpl = (async () => {
      throw new Error("getaddrinfo ENOTFOUND 10.0.0.5");
    }) as unknown as typeof fetch;
    const result = await postDelivery({ ...base, fetchImpl });
    expect(result.status).toBeNull();
  });

  it("does not surface anything the endpoint said", async () => {
    // Server-side request forgery is only fully useful when the attacker can
    // read the response. Only a status code leaves this function.
    const fetchImpl = (async () =>
      new Response("ya29.a0AfH6SM-service-account-token", { status: 200 })) as unknown as typeof fetch;
    const result = await postDelivery({ ...base, fetchImpl });
    expect(Object.keys(result)).toEqual(["status"]);
    expect(JSON.stringify(result)).not.toContain("ya29");
  });

  it("bounds the request so a silent receiver cannot hold a worker", async () => {
    let signal: AbortSignal | null | undefined;
    const fetchImpl = (async (_url: string, init: RequestInit) => {
      signal = init.signal;
      return new Response("", { status: 200 });
    }) as unknown as typeof fetch;
    await postDelivery({ ...base, fetchImpl });
    expect(signal).toBeInstanceOf(AbortSignal);
  });

  it("reports a timeout as a transport failure, which is retryable", async () => {
    const fetchImpl = (async (_url: string, init: RequestInit) => {
      await new Promise((resolve) => setTimeout(resolve, 50));
      if (init.signal?.aborted) throw new Error("aborted");
      return new Response("", { status: 200 });
    }) as unknown as typeof fetch;
    const result = await postDelivery({ ...base, timeoutMs: 5, fetchImpl });
    expect(result.status).toBeNull();
    expect(decideRetry({ status: null, attempt: 1 }, () => 0.5).outcome).toBe("RETRY");
  });
});

describe("turning a dead subscription off", () => {
  it("rides out a long outage before giving up on it", () => {
    // Turning off a working customer's webhook is worse than a few more days of
    // failed attempts, so the threshold is deliberately high.
    expect(AUTO_DISABLE_AFTER_FAILURES).toBeGreaterThanOrEqual(10);
    expect(shouldDisableAfterFailures(AUTO_DISABLE_AFTER_FAILURES - 1)).toBe(false);
    expect(shouldDisableAfterFailures(AUTO_DISABLE_AFTER_FAILURES)).toBe(true);
    expect(shouldDisableAfterFailures(AUTO_DISABLE_AFTER_FAILURES + 100)).toBe(true);
  });

  it("does not disable on a clean record", () => {
    expect(shouldDisableAfterFailures(0)).toBe(false);
  });
});

describe("the delivery record", () => {
  const valid = {
    deliveryId: "d-1",
    organizationId: "org-1",
    endpointId: "e-1",
    url: "https://hooks.example.com/x",
    event: "reply.received",
    body: '{"id":"d-1"}',
    attempt: 0,
    status: "PENDING",
    lastStatus: null,
    history: [],
    nextAttemptAt: 1,
    createdAt: 1,
    updatedAt: 1,
  };

  it("accepts a queued delivery", () => {
    expect(WebhookDeliverySchema.parse(valid).status).toBe("PENDING");
  });

  it("accepts the test ping as an event", () => {
    expect(WebhookDeliverySchema.parse({ ...valid, event: "test.ping" }).event).toBe("test.ping");
  });

  it("refuses an event nothing emits", () => {
    expect(() => WebhookDeliverySchema.parse({ ...valid, event: "reply.deleted" })).toThrow();
  });

  it("refuses a non-URL target, so a bad row cannot reach the delivery worker", () => {
    expect(() => WebhookDeliverySchema.parse({ ...valid, url: "not a url" })).toThrow();
  });
});
