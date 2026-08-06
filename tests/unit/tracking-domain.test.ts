import { describe, expect, it } from "vitest";
import {
  assessVerification,
  cnameTarget,
  describeDomainStatus,
  dnsInstruction,
  normalizeTrackingDomain,
  hostBelongsToOrganization,
  normalizeHostHeader,
  trackingBaseUrl,
  type WorkspaceDomain,
} from "@/lib/tracking/domain";

const APP = "https://outreach-abc123.a.run.app";

describe("normalizeTrackingDomain", () => {
  it("accepts a plain subdomain", () => {
    expect(normalizeTrackingDomain("track.acme.com")).toEqual({
      ok: true,
      host: "track.acme.com",
      reason: "",
    });
  });

  it("cleans up what people actually paste", () => {
    for (const input of [
      "https://track.acme.com",
      "http://track.acme.com/",
      "TRACK.ACME.COM",
      "  track.acme.com  ",
      "track.acme.com.",
      "https://track.acme.com/some/path?x=1#y",
    ]) {
      expect(normalizeTrackingDomain(input).host, input).toBe("track.acme.com");
    }
  });

  it("refuses anything that could redirect the link elsewhere", () => {
    // This is the security boundary: the result is interpolated into a URL that
    // goes into real email. A value carrying any of these could point the link
    // at a host the customer never approved.
    for (const hostile of [
      "track.acme.com@evil.example",
      "track.acme.com:8080",
      "track.acme.com\\@evil.example",
      "track.acme.com evil.example",
      "track.acme.com\nevil.example",
      "track.acme.com\tevil",
    ]) {
      const result = normalizeTrackingDomain(hostile);
      expect(result.ok, hostile).toBe(false);
      expect(result.host, hostile).toBe("");
    }
  });

  it("never returns a host when it refuses", () => {
    // A caller that ignored `ok` must still be safe.
    for (const bad of ["", "   ", "acme.com", "not a domain", "track.acme.localhost"]) {
      expect(normalizeTrackingDomain(bad).host, bad).toBe("");
    }
  });

  it("refuses the registrable domain itself", () => {
    // Pointing the apex at us would take over their website.
    const result = normalizeTrackingDomain("acme.com");
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/subdomain/i);
  });

  it("refuses reserved and non-public suffixes", () => {
    for (const bad of [
      "track.acme.localhost",
      "track.acme.local",
      "track.acme.internal",
      "track.acme.test",
      "track.acme.invalid",
      "track.acme.example",
    ]) {
      expect(normalizeTrackingDomain(bad).ok, bad).toBe(false);
    }
  });

  it("refuses characters that are legal in DNS but not wanted in a URL", () => {
    for (const bad of ["track_1.acme.com", "-track.acme.com", "track-.acme.com", "tr..acme.com"]) {
      expect(normalizeTrackingDomain(bad).ok, bad).toBe(false);
    }
  });

  it("refuses raw unicode and asks for punycode", () => {
    // Two different-looking strings can normalize to the same host, which is
    // exactly the confusion a homograph attack relies on.
    const result = normalizeTrackingDomain("träck.acme.com");
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/punycode/i);
  });

  it("accepts an already-punycoded host", () => {
    expect(normalizeTrackingDomain("xn--trck-hra.acme.com").ok).toBe(true);
  });

  it("refuses an absurdly long hostname", () => {
    expect(normalizeTrackingDomain(`${"a".repeat(300)}.acme.com`).ok).toBe(false);
  });

  it("gives a reason a customer can act on for every refusal", () => {
    for (const bad of ["", "acme.com", "träck.acme.com", "track.acme.local", "track_1.acme.com"]) {
      const result = normalizeTrackingDomain(bad);
      expect(result.reason.length, bad).toBeGreaterThan(15);
    }
  });
});

describe("cnameTarget and dnsInstruction", () => {
  it("derives the target from the running deployment", () => {
    // Hardcoding it would let a staging deployment verify a domain against
    // production by accident.
    expect(cnameTarget(APP)).toBe("outreach-abc123.a.run.app");
  });

  it("is empty rather than wrong for an unparseable base url", () => {
    expect(cnameTarget("not a url")).toBe("");
  });

  it("gives the subdomain only, which is what DNS interfaces want", () => {
    expect(dnsInstruction("track.acme.com", APP)).toEqual({
      type: "CNAME",
      name: "track",
      value: "outreach-abc123.a.run.app",
      ttl: "300 (or your provider's default)",
    });
  });
});

describe("assessVerification", () => {
  const expected = "outreach-abc123.a.run.app";

  it("verifies an exact match", () => {
    const result = assessVerification({ cnames: [expected], resolved: true, expectedTarget: expected });
    expect(result.verified).toBe(true);
    expect(result.status).toBe("VERIFIED");
  });

  it("ignores a trailing dot and casing from the resolver", () => {
    const result = assessVerification({
      cnames: ["Outreach-ABC123.a.run.app."],
      resolved: true,
      expectedTarget: expected,
    });
    expect(result.verified).toBe(true);
  });

  it("reports a lookup that could not complete as pending, never failed", () => {
    // DNS takes minutes to hours to propagate. Telling a customer their correct
    // configuration is broken sends them to change something already right.
    const result = assessVerification({ cnames: [], resolved: false, expectedTarget: expected });
    expect(result.status).toBe("PENDING");
    expect(result.verified).toBe(false);
    expect(result.message).toMatch(/normal/i);
  });

  it("fails a record pointing somewhere else, and says where", () => {
    const result = assessVerification({
      cnames: ["some-other-host.example.com"],
      resolved: true,
      expectedTarget: expected,
    });
    expect(result.status).toBe("FAILED");
    expect(result.message).toContain("some-other-host.example.com");
    expect(result.message).toContain(expected);
  });

  it("verifies when the target appears anywhere in a chain", () => {
    const result = assessVerification({
      cnames: ["intermediate.example.com", expected],
      resolved: true,
      expectedTarget: expected,
    });
    expect(result.verified).toBe(true);
  });
});

describe("trackingBaseUrl", () => {
  it("uses the shared domain when no domain is configured", () => {
    expect(trackingBaseUrl(null, APP)).toBe(APP);
    expect(trackingBaseUrl({ host: "", status: "NONE" }, APP)).toBe(APP);
  });

  it("uses a verified domain over https", () => {
    expect(trackingBaseUrl({ host: "track.acme.com", status: "VERIFIED" }, APP)).toBe(
      "https://track.acme.com"
    );
  });

  it("never uses an unverified domain", () => {
    // A hostname that does not resolve breaks every link in the send, which is
    // strictly worse than the shared-domain risk it was meant to avoid.
    for (const status of ["PENDING", "FAILED", "NONE"] as const) {
      expect(trackingBaseUrl({ host: "track.acme.com", status }, APP), status).toBe(APP);
    }
  });
});

describe("normalizeHostHeader", () => {
  it("strips the port, casing, and trailing dot a Host header legitimately carries", () => {
    for (const input of ["TRACK.Acme.Com", "track.acme.com:443", "  track.acme.com.  "]) {
      expect(normalizeHostHeader(input), input).toBe("track.acme.com");
    }
  });

  it("is empty rather than throwing for a missing header", () => {
    expect(normalizeHostHeader(null)).toBe("");
    expect(normalizeHostHeader(undefined)).toBe("");
  });
});

describe("hostBelongsToOrganization", () => {
  const verified: WorkspaceDomain[] = [
    { organizationId: "org-a", host: "track.acme.com", status: "VERIFIED" },
    { organizationId: "org-b", host: "links.beta.com", status: "VERIFIED" },
    { organizationId: "org-c", host: "pending.gamma.com", status: "PENDING" },
  ];

  it("accepts a workspace's own verified host", () => {
    expect(hostBelongsToOrganization("track.acme.com", "org-a", verified, APP)).toBe(true);
    expect(hostBelongsToOrganization("links.beta.com:443", "org-b", verified, APP)).toBe(true);
  });

  it("refuses one customer's host serving another customer's links", () => {
    // The only thing this check exists for: without it, org-b's verified
    // hostname could serve org-a's tracking links, leaking that a specific
    // recipient opened a specific email across a tenant boundary.
    expect(hostBelongsToOrganization("links.beta.com", "org-a", verified, APP)).toBe(false);
    expect(hostBelongsToOrganization("track.acme.com", "org-b", verified, APP)).toBe(false);
  });

  it("always accepts the platform's own host", () => {
    // Where every link pointed before this feature, and where they still point
    // for any workspace without a verified domain.
    for (const org of ["org-a", "org-b", "org-unknown"]) {
      expect(hostBelongsToOrganization("outreach-abc123.a.run.app", org, verified, APP), org).toBe(
        true
      );
      expect(
        hostBelongsToOrganization("outreach-abc123.a.run.app:8080", org, verified, APP),
        org
      ).toBe(true);
    }
  });

  it("accepts a host belonging to no customer", () => {
    // Not a tenant-boundary problem: an unrecognised host cannot belong to a
    // different customer because it belongs to none, and Cloud Run would not
    // have routed it here anyway. Refusing would break a legitimate request
    // arriving through a proxy that rewrites Host.
    for (const host of ["evil.example", "track.acme.com.evil.example", "pending.gamma.com"]) {
      expect(hostBelongsToOrganization(host, "org-a", verified, APP), host).toBe(true);
    }
  });

  it("accepts a request with no Host header at all", () => {
    expect(hostBelongsToOrganization(null, "org-a", verified, APP)).toBe(true);
    expect(hostBelongsToOrganization("", "org-a", verified, APP)).toBe(true);
  });

  it("is case and trailing-dot insensitive when matching a verified host", () => {
    expect(hostBelongsToOrganization("  TRACK.Acme.Com.  ", "org-a", verified, APP)).toBe(true);
    expect(hostBelongsToOrganization("  TRACK.Acme.Com.  ", "org-b", verified, APP)).toBe(false);
  });
});

describe("describeDomainStatus", () => {
  it("is honest about the shared domain when none is set", () => {
    expect(describeDomainStatus(null)).toMatch(/every customer shares/i);
  });

  it("names the domain in every configured state", () => {
    for (const status of ["VERIFIED", "PENDING", "FAILED"] as const) {
      expect(describeDomainStatus({ host: "track.acme.com", status }), status).toContain(
        "track.acme.com"
      );
    }
  });

  it("says links still use the shared domain until verification", () => {
    for (const status of ["PENDING", "FAILED"] as const) {
      expect(describeDomainStatus({ host: "track.acme.com", status })).toMatch(/shared domain/i);
    }
  });
});
