import { describe, expect, it } from "vitest";
import { validateWebhookTarget } from "@/lib/webhooks/target";

describe("validateWebhookTarget", () => {
  it("accepts an ordinary https endpoint", () => {
    const result = validateWebhookTarget("https://hooks.acme.com/cadence");
    expect(result.ok).toBe(true);
    expect(result.url).toBe("https://hooks.acme.com/cadence");
  });

  it("keeps the path and query, drops the fragment", () => {
    // A fragment is never sent to a server, so carrying one would only mislead
    // whoever reads the stored URL back.
    const result = validateWebhookTarget("https://hooks.acme.com/in?team=eu#ignored");
    expect(result.url).toBe("https://hooks.acme.com/in?team=eu");
  });

  it("refuses http, so a signed payload is not readable in transit", () => {
    const result = validateWebhookTarget("http://hooks.acme.com/cadence");
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/https/i);
  });

  it("refuses other schemes outright", () => {
    for (const bad of [
      "ftp://hooks.acme.com",
      "file:///etc/passwd",
      "gopher://hooks.acme.com",
      "javascript:alert(1)",
      "data:text/plain,hi",
    ]) {
      expect(validateWebhookTarget(bad).ok, bad).toBe(false);
    }
  });

  it("refuses credentials embedded in the URL", () => {
    // They would end up in every delivery log we keep.
    const result = validateWebhookTarget("https://user:pass@hooks.acme.com/in");
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/username and password/i);
  });

  describe("server-side request forgery", () => {
    it("refuses the cloud metadata server in every spelling", () => {
      // The specific prize on Google Cloud: a GET to 169.254.169.254 from
      // inside a Cloud Run instance returns service-account access tokens.
      // Blocking the dotted form while allowing the others would be theatre,
      // because every one of these resolves to the same host.
      for (const hostile of [
        "https://169.254.169.254/computeMetadata/v1/",
        "https://0xa9fea9fe/",
        "https://2852039166/",
        "https://0251.0376.0251.0376/",
        "https://metadata.google.internal/computeMetadata/v1/",
        "https://metadata/computeMetadata/v1/",
      ]) {
        const result = validateWebhookTarget(hostile);
        expect(result.ok, hostile).toBe(false);
        expect(result.url, hostile).toBe("");
      }
    });

    it("refuses loopback and private ranges", () => {
      for (const hostile of [
        "https://127.0.0.1/hook",
        "https://localhost/hook",
        "https://localhost.localdomain/hook",
        "https://10.0.0.5/hook",
        "https://192.168.1.1/hook",
        "https://172.16.0.1/hook",
        "https://0.0.0.0/hook",
      ]) {
        expect(validateWebhookTarget(hostile).ok, hostile).toBe(false);
      }
    });

    it("refuses IPv6 literals including the mapped forms", () => {
      for (const hostile of [
        "https://[::1]/hook",
        "https://[fe80::1]/hook",
        "https://[::ffff:169.254.169.254]/hook",
        "https://[0:0:0:0:0:ffff:127.0.0.1]/hook",
      ]) {
        expect(validateWebhookTarget(hostile).ok, hostile).toBe(false);
      }
    });

    it("refuses internal-looking names", () => {
      for (const hostile of [
        "https://api.internal/hook",
        "https://db.local/hook",
        "https://service.corp/hook",
        "https://thing.lan/hook",
        "https://kubernetes.default/hook",
        "https://instance-data/hook",
      ]) {
        expect(validateWebhookTarget(hostile).ok, hostile).toBe(false);
      }
    });

    it("refuses a bare hostname with no dot", () => {
      // Cannot be a public DNS name, and is how an internal service is usually
      // addressed from inside a cluster.
      expect(validateWebhookTarget("https://redis/hook").ok).toBe(false);
      expect(validateWebhookTarget("https://api-gateway/hook").ok).toBe(false);
    });

    it("still accepts a public host that merely contains a blocked word", () => {
      // "internal" as a label is fine; it is the *suffix* that is dangerous.
      // Over-blocking here would refuse legitimate customer endpoints.
      for (const fine of [
        "https://internal.acme.com/hook",
        "https://local.acme.com/hook",
        "https://test.acme.com/hook",
        "https://metadata.acme.com/hook",
      ]) {
        expect(validateWebhookTarget(fine).ok, fine).toBe(true);
      }
    });

    it("never returns a url when it refuses", () => {
      // A caller that ignored `ok` must still be safe.
      for (const hostile of [
        "https://169.254.169.254/",
        "http://hooks.acme.com",
        "https://user:pass@hooks.acme.com",
        "not a url",
        "",
      ]) {
        expect(validateWebhookTarget(hostile).url, hostile).toBe("");
      }
    });
  });

  it("normalizes an international domain to punycode rather than refusing it", () => {
    // Unlike the tracking-domain path, which takes a bare hostname string with
    // no parser involved, the URL constructor punycodes the host for us. What
    // gets stored is therefore already ASCII, which is the property that
    // mattered: two different-looking spellings cannot become two different
    // stored targets.
    const result = validateWebhookTarget("https://hööks.acme.com/in");
    expect(result.ok).toBe(true);
    expect(result.url).toBe("https://xn--hks-snaa.acme.com/in");
    expect(/^[\x20-\x7e]+$/.test(result.url)).toBe(true);
  });

  it("refuses an absurdly long URL", () => {
    expect(validateWebhookTarget(`https://hooks.acme.com/${"a".repeat(2100)}`).ok).toBe(false);
  });

  it("gives a reason a customer can act on for every refusal", () => {
    for (const bad of ["", "not a url", "http://hooks.acme.com", "https://127.0.0.1/x"]) {
      expect(validateWebhookTarget(bad).reason.length, bad).toBeGreaterThan(15);
    }
  });
});
