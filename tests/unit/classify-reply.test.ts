import { describe, expect, it } from "vitest";
import {
  stripQuotedText,
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

describe("unsubscribe false-positive protection", () => {
  it("treats a normal question as a human reply even when the quoted original contains 'unsubscribe'", () => {
    const bodyText = [
      "Hey, this sounds interesting — how does the program work? What are the rates?",
      "",
      "On Mon, Jul 21, 2026 at 9:00 AM Alex <alex@example.com> wrote:",
      "> Hi John, quick note about funding options.",
      "> To stop receiving these emails, reply with unsubscribe.",
    ].join("\n");
    expect(classifyInboundMessage(msg({ bodyText }))).toBe("HUMAN_REPLY");
  });

  it("treats a long reply that merely mentions unsubscribing as a human reply", () => {
    const bodyText =
      "Thanks for reaching out. I have a few questions about the terms before deciding anything. " +
      "Also, if I ever want to unsubscribe later, how would that work? Anyway, can you send more details on pricing?";
    expect(classifyInboundMessage(msg({ bodyText }))).toBe("HUMAN_REPLY");
  });

  it("still honors a bare 'unsubscribe' reply", () => {
    expect(classifyInboundMessage(msg({ bodyText: "unsubscribe" }))).toBe("UNSUBSCRIBE");
    expect(classifyInboundMessage(msg({ bodyText: "Please unsubscribe me." }))).toBe("UNSUBSCRIBE");
  });

  it("honors an explicit request even inside a longer message", () => {
    const bodyText =
      "Hi, thanks but this isn't relevant to us. Please remove me from your list — we don't take outside funding. Best, Pat";
    expect(classifyInboundMessage(msg({ bodyText }))).toBe("UNSUBSCRIBE");
  });

  it("honors 'stop emailing me' directed requests", () => {
    expect(classifyInboundMessage(msg({ bodyText: "Stop emailing me please." }))).toBe("UNSUBSCRIBE");
  });

  it("ignores inline-quoted '>' lines when classifying", () => {
    const bodyText = [
      "Sounds good, let's talk Friday.",
      "> To stop receiving these emails, reply unsubscribe",
    ].join("\n");
    expect(classifyInboundMessage(msg({ bodyText }))).toBe("HUMAN_REPLY");
  });
});

describe("stripQuotedText", () => {
  it("cuts at 'On ... wrote:' and drops '>' lines", () => {
    const out = stripQuotedText(
      "Fresh text here.\n\nOn Tue, Jul 21, 2026 X <x@y.com> wrote:\n> old stuff\n> more old"
    );
    expect(out).toBe("Fresh text here.");
  });
  it("cuts at Outlook-style From: headers", () => {
    expect(stripQuotedText("Yes please call me.\nFrom: Sales Team\nSent: Monday")).toBe(
      "Yes please call me."
    );
  });
  it("returns whole body when nothing is quoted", () => {
    expect(stripQuotedText("Just a plain reply.")).toBe("Just a plain reply.");
  });
});
