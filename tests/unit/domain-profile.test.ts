import { describe, expect, it } from "vitest";
import {
  acceptsEveryAddress,
  describeProvider,
  isConsumerDomain,
  mailProviderFor,
} from "@/lib/leads/domainProfile";
import { summarize, verifyEmailOffline } from "@/lib/leads/verify";
import { VERDICT_BADGES } from "@/components/imports/leadBadges";

describe("classifying a domain from its MX records", () => {
  it("recognises Google Workspace", () => {
    expect(mailProviderFor("acme.com", ["aspmx.l.google.com"])).toBe("GOOGLE");
    expect(mailProviderFor("acme.com", ["alt1.aspmx.l.google.com"])).toBe("GOOGLE");
  });

  it("recognises Microsoft 365", () => {
    expect(mailProviderFor("acme.com", ["acme-com.mail.protection.outlook.com"])).toBe("MICROSOFT");
  });

  it("recognises a forwarding service", () => {
    expect(mailProviderFor("acme.com", ["mx1.improvmx.com", "mx2.improvmx.com"])).toBe("FORWARDER");
    expect(mailProviderFor("acme.com", ["mx1.forwardemail.net"])).toBe("FORWARDER");
  });

  it("puts the forwarder ahead of what it forwards into", () => {
    // A domain can forward through a service into Workspace. The forwarder is
    // the part that decides whether mail is accepted, so it is the part that
    // decides whether the address can be confirmed.
    expect(mailProviderFor("acme.com", ["mx1.improvmx.com", "aspmx.l.google.com"])).toBe(
      "FORWARDER"
    );
  });

  it("recognises a filtering gateway", () => {
    expect(mailProviderFor("acme.com", ["mx1.pphosted.com"])).toBe("SECURITY_GATEWAY");
    expect(mailProviderFor("acme.com", ["eu-smtp-inbound-1.mimecast.com"])).toBe(
      "SECURITY_GATEWAY"
    );
  });

  it("classifies a personal address by its domain, not its MX", () => {
    // gmail.com's own MX records are Google's, so an MX-first check would call
    // it a Workspace domain: the same infrastructure, a completely different
    // kind of recipient.
    expect(mailProviderFor("gmail.com", ["gmail-smtp-in.l.google.com"])).toBe("CONSUMER");
    expect(mailProviderFor("outlook.com", ["outlook-com.olc.protection.outlook.com"])).toBe(
      "CONSUMER"
    );
  });

  it("reports an unknown host as its own mail server rather than guessing", () => {
    expect(mailProviderFor("acme.com", ["mail.acme.com"])).toBe("OTHER");
  });

  it("reports no records as none", () => {
    expect(mailProviderFor("acme.com", [])).toBe("NONE");
    expect(mailProviderFor("acme.com", ["", "  "])).toBe("NONE");
  });

  it("is not fooled by a lookalike suffix", () => {
    // "notgoogle.com" ends with "google.com" as a string but is a different
    // registrable domain, and matching it would misattribute a stranger's mail.
    expect(mailProviderFor("acme.com", ["mx.notgoogle.com"])).toBe("OTHER");
    expect(mailProviderFor("acme.com", ["mx.improvmx.com.attacker.net"])).toBe("OTHER");
  });

  it("tolerates a trailing dot, which DNS answers often carry", () => {
    expect(mailProviderFor("acme.com", ["aspmx.l.google.com."])).toBe("GOOGLE");
  });

  it("is case-insensitive", () => {
    expect(mailProviderFor("ACME.com", ["ASPMX.L.GOOGLE.COM"])).toBe("GOOGLE");
    expect(isConsumerDomain("GMAIL.COM")).toBe(true);
  });
});

describe("which providers accept every address", () => {
  it("says so only where it is a property of the service", () => {
    expect(acceptsEveryAddress("FORWARDER")).toBe(true);
  });

  it("does not claim Workspace or 365 are catch-alls", () => {
    // Either can be configured as one and usually is not. Claiming otherwise
    // would put a warning on most of the business addresses in existence, and a
    // warning that applies to everything is one people learn to ignore.
    expect(acceptsEveryAddress("GOOGLE")).toBe(false);
    expect(acceptsEveryAddress("MICROSOFT")).toBe(false);
    expect(acceptsEveryAddress("OTHER")).toBe(false);
    expect(acceptsEveryAddress("SECURITY_GATEWAY")).toBe(false);
    expect(acceptsEveryAddress("CONSUMER")).toBe(false);
  });

  it("describes every provider in words a customer can act on", () => {
    for (const provider of [
      "GOOGLE",
      "MICROSOFT",
      "FORWARDER",
      "SECURITY_GATEWAY",
      "CONSUMER",
      "OTHER",
      "NONE",
    ] as const) {
      expect(describeProvider(provider).length, provider).toBeGreaterThan(5);
    }
  });
});

describe("the verdict a forwarding domain earns", () => {
  it("is cannot-confirm rather than verified", () => {
    // The overclaim this corrects: the address used to come back "Verified"
    // when the only thing established was that the domain has a mail server
    // which accepts everything.
    const result = verifyEmailOffline("dana@acme.com", {
      isValidSyntax: true,
      hasMx: true,
      mxHosts: ["mx1.improvmx.com"],
    });
    expect(result.verdict).toBe("UNCONFIRMABLE");
    expect(result.findings.map((f) => f.code)).toContain("CATCH_ALL");
  });

  it("is still importable, because most business domains are like this", () => {
    // Defaulting these out would break an ordinary import.
    expect(VERDICT_BADGES.UNCONFIRMABLE.selectable).toBe(true);
  });

  it("reads as neutral rather than as a warning", () => {
    // Colouring it amber would tell a customer their perfectly good list is
    // full of problems.
    expect(VERDICT_BADGES.UNCONFIRMABLE.className).not.toContain("warning");
    expect(VERDICT_BADGES.UNCONFIRMABLE.className).not.toContain("danger");
  });

  it("yields to a real problem at the same address", () => {
    // "We found a role inbox" is more actionable than "we could not check".
    const result = verifyEmailOffline("sales@acme.com", {
      isValidSyntax: true,
      hasMx: true,
      mxHosts: ["mx1.improvmx.com"],
    });
    expect(result.verdict).toBe("RISKY");
    expect(result.findings.map((f) => f.code)).toEqual(
      expect.arrayContaining(["ROLE_ADDRESS", "CATCH_ALL"])
    );
  });
});

describe("the other provider findings", () => {
  it("flags a personal address on a business list without condemning it", () => {
    const result = verifyEmailOffline("dana@gmail.com", {
      isValidSyntax: true,
      hasMx: true,
      mxHosts: ["gmail-smtp-in.l.google.com"],
    });
    expect(result.verdict).toBe("RISKY");
    expect(result.findings.map((f) => f.code)).toContain("CONSUMER_MAILBOX");
  });

  it("warns that a filtered domain drops rather than bounces", () => {
    const result = verifyEmailOffline("dana@acme.com", {
      isValidSyntax: true,
      hasMx: true,
      mxHosts: ["mx1.pphosted.com"],
    });
    expect(result.findings.map((f) => f.code)).toContain("SECURITY_GATEWAY");
    expect(result.findings.find((f) => f.code === "SECURITY_GATEWAY")!.detail).toMatch(
      /quietly|dropped/i
    );
  });

  it("leaves an ordinary Workspace address clean", () => {
    const result = verifyEmailOffline("dana@acme.com", {
      isValidSyntax: true,
      hasMx: true,
      mxHosts: ["aspmx.l.google.com"],
    });
    expect(result.verdict).toBe("DELIVERABLE");
    expect(result.findings).toEqual([]);
  });

  it("skips the provider checks entirely when no hosts were supplied", () => {
    // Callers that only have the boolean must behave exactly as before.
    const result = verifyEmailOffline("dana@acme.com", { isValidSyntax: true, hasMx: true });
    expect(result.verdict).toBe("DELIVERABLE");
  });

  it("still reports a dead domain as undeliverable regardless of hosts", () => {
    const result = verifyEmailOffline("dana@acme.com", {
      isValidSyntax: true,
      hasMx: false,
      mxHosts: [],
    });
    expect(result.verdict).toBe("UNDELIVERABLE");
  });
});

describe("the preview summary", () => {
  it("counts the new tier separately from the clean one", () => {
    const results = [
      verifyEmailOffline("a@acme.com", { isValidSyntax: true, hasMx: true, mxHosts: ["aspmx.l.google.com"] }),
      verifyEmailOffline("b@acme.com", { isValidSyntax: true, hasMx: true, mxHosts: ["mx1.improvmx.com"] }),
      verifyEmailOffline("sales@acme.com", { isValidSyntax: true, hasMx: true, mxHosts: ["aspmx.l.google.com"] }),
      verifyEmailOffline("c@dead.example", { isValidSyntax: true, hasMx: false }),
    ];
    expect(summarize(results)).toEqual({
      deliverable: 1,
      unconfirmable: 1,
      risky: 1,
      undeliverable: 1,
    });
  });

  it("labels the clean tier as checked, not verified", () => {
    // Nothing short of sending confirms a mailbox. Saying "Verified" made the
    // honest tier beside it look like a downgrade.
    expect(VERDICT_BADGES.DELIVERABLE.label).toBe("Checked");
  });
});
