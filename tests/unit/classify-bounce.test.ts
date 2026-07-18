import { describe, expect, it } from "vitest";
import {
  classifyBounce,
  isBounceMessage,
  parseFailedRecipient,
  type BounceMessage,
} from "@/lib/gmail/classifyBounce";

function msg(partial: Partial<BounceMessage>): BounceMessage {
  return { from: "", subject: "", bodyText: "", ...partial };
}

describe("isBounceMessage", () => {
  it("recognizes mailer-daemon and DSN subjects", () => {
    expect(isBounceMessage(msg({ from: "MAILER-DAEMON@google.com" }))).toBe(true);
    expect(isBounceMessage(msg({ subject: "Delivery Status Notification (Failure)" }))).toBe(true);
    expect(isBounceMessage(msg({ subject: "Undeliverable: Your message" }))).toBe(true);
  });
  it("ignores normal mail", () => {
    expect(isBounceMessage(msg({ from: "jane@company.com", subject: "Re: Hi" }))).toBe(false);
  });
});

describe("parseFailedRecipient", () => {
  it("extracts the address from a Final-Recipient header", () => {
    expect(parseFailedRecipient("Final-Recipient: rfc822; nobody@example.com")).toBe(
      "nobody@example.com"
    );
  });
  it("returns null when no address is found", () => {
    expect(parseFailedRecipient("Something went wrong.")).toBeNull();
  });
});

describe("classifyBounce", () => {
  it("classifies 5.x.x enhanced codes as hard", () => {
    expect(classifyBounce(msg({ bodyText: "Status: 5.1.1 user unknown" }))).toBe("HARD");
  });
  it("classifies 4.x.x enhanced codes as soft", () => {
    expect(classifyBounce(msg({ bodyText: "Status: 4.2.2 mailbox full" }))).toBe("SOFT");
  });
  it("classifies known hard phrases", () => {
    expect(classifyBounce(msg({ bodyText: "The email account that you tried to reach does not exist." }))).toBe(
      "HARD"
    );
  });
  it("classifies known soft phrases", () => {
    expect(classifyBounce(msg({ bodyText: "Recipient mailbox full; please try again later." }))).toBe(
      "SOFT"
    );
  });
  it("falls back to unknown", () => {
    expect(classifyBounce(msg({ bodyText: "Delivery problem." }))).toBe("UNKNOWN");
  });
});
