import { describe, expect, it } from "vitest";
import {
  classifyInboundMessage,
  parseReturnDate,
  type InboundMessage,
} from "@/lib/gmail/classifyReply";

function msg(partial: Partial<InboundMessage>): InboundMessage {
  return { headers: {}, subject: "", snippet: "", bodyText: "", ...partial };
}

describe("classifyInboundMessage", () => {
  it("detects a genuine human reply", () => {
    expect(
      classifyInboundMessage(msg({ subject: "Re: Funding", bodyText: "Sure, let's talk Thursday." }))
    ).toBe("HUMAN_REPLY");
  });

  it("detects unsubscribe requests regardless of casing", () => {
    expect(classifyInboundMessage(msg({ bodyText: "Please UNSUBSCRIBE me." }))).toBe("UNSUBSCRIBE");
    expect(classifyInboundMessage(msg({ bodyText: "take me off your list" }))).toBe("UNSUBSCRIBE");
    expect(classifyInboundMessage(msg({ bodyText: "stop emailing me" }))).toBe("UNSUBSCRIBE");
  });

  it("detects not-interested replies", () => {
    expect(classifyInboundMessage(msg({ bodyText: "Not interested, thanks." }))).toBe(
      "NOT_INTERESTED"
    );
  });

  it("detects out-of-office by subject and header", () => {
    expect(classifyInboundMessage(msg({ subject: "Automatic reply: Out of Office" }))).toBe(
      "OUT_OF_OFFICE"
    );
    expect(
      classifyInboundMessage(
        msg({ headers: { "Auto-Submitted": "auto-replied" }, bodyText: "I am on vacation until Monday." })
      )
    ).toBe("OUT_OF_OFFICE");
  });

  it("flags generic automated responses via headers", () => {
    expect(
      classifyInboundMessage(
        msg({ headers: { "X-Autoreply": "yes" }, bodyText: "Ticket received." })
      )
    ).toBe("AUTO_RESPONSE");
  });

  it("prioritizes unsubscribe over automated flag", () => {
    expect(
      classifyInboundMessage(
        msg({ headers: { "Auto-Submitted": "auto-replied" }, bodyText: "unsubscribe" })
      )
    ).toBe("UNSUBSCRIBE");
  });

  it("does not rely on subject text alone for human replies", () => {
    // An empty-body message with only a subject is ambiguous, not a reply.
    expect(classifyInboundMessage(msg({ subject: "Re: Funding" }))).toBe("AMBIGUOUS");
  });
});

describe("parseReturnDate", () => {
  it("extracts a return date when present", () => {
    const t = parseReturnDate("I'll be back on January 20, 2026 and will respond then.");
    expect(t).not.toBeNull();
  });
  it("returns null when absent", () => {
    expect(parseReturnDate("I am away.")).toBeNull();
  });
});
