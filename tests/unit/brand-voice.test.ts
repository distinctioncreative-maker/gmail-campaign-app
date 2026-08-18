import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  BRAND_TONES,
  BRAND_VOICE_FIELDS,
  EMPTY_BRAND_VOICE,
  brandVoiceCompleteness,
  compileBrandVoice,
  isVoiceUsable,
  type BrandVoice,
} from "@/lib/ai/brandVoice";
import { extractText, normalizeSiteUrl } from "@/lib/net/fetchPage";
import { normalizeHost, rejectPublicHost } from "@/lib/net/publicHost";

function voice(patch: Partial<BrandVoice> = {}): BrandVoice {
  return { ...EMPTY_BRAND_VOICE, ...patch };
}

describe("compiling brand voice into a prompt", () => {
  it("never blanks a legacy profile that has no structured fields", () => {
    /**
     * The single most important property in this feature. Every existing
     * workspace has its brand memory as one free-text blob and no `voice`. If
     * compiling an empty voice returned an empty string, the first read after
     * deploy would overwrite `content` with nothing and silently delete every
     * customer's brand memory.
     */
    const compiled = compileBrandVoice(EMPTY_BRAND_VOICE, "Alpine: fast working capital.");
    expect(compiled).toBe("Alpine: fast working capital.");
  });

  it("keeps the legacy text when fields are added alongside it", () => {
    // Filling in the form must add to what someone wrote, not replace it.
    const compiled = compileBrandVoice(voice({ offer: "Working capital" }), "Old notes here");
    expect(compiled).toContain("Working capital");
    expect(compiled).toContain("Old notes here");
  });

  it("labels each part so a prohibition is not just another fact", () => {
    /**
     * The reason structure beats a blob. In one paragraph "never mention rates"
     * competes for attention with everything else; labelled, it arrives as an
     * instruction. It is placed last so it is the final thing in context.
     */
    const compiled = compileBrandVoice(
      voice({ offer: "Loans", avoid: "never mention rates", tones: ["Warm"] })
    );
    expect(compiled).toContain("WHAT THEY SELL: Loans");
    expect(compiled).toContain("NEVER SAY");
    expect(compiled.indexOf("NEVER SAY")).toBeGreaterThan(compiled.indexOf("WHAT THEY SELL"));
  });

  it("omits empty fields rather than emitting empty labels", () => {
    // A prompt full of "PROOF THEY CAN CITE:" with nothing after it teaches the
    // model that blank sections are normal.
    const compiled = compileBrandVoice(voice({ offer: "Loans" }));
    expect(compiled).toBe("WHAT THEY SELL: Loans");
  });

  it("produces nothing at all from nothing at all", () => {
    expect(compileBrandVoice(EMPTY_BRAND_VOICE, "")).toBe("");
    expect(isVoiceUsable(EMPTY_BRAND_VOICE)).toBe(false);
  });
});

describe("the completeness meter", () => {
  it("does not call a voice half-done when only the tone is set", () => {
    /**
     * The meter exists because the old box gave no signal for when you were
     * finished, and people stopped after two lines. A meter that rewards the
     * cheapest possible input would reproduce that exact failure.
     */
    expect(brandVoiceCompleteness(voice({ tones: ["Warm"] }))).toBeLessThan(0.3);
  });

  it("reaches the encouraging band once the essentials are answered", () => {
    const filled = voice({ offer: "Loans", audience: "Trade firms" });
    expect(brandVoiceCompleteness(filled)).toBeGreaterThanOrEqual(0.5);
  });

  it("is 1 only when everything is answered", () => {
    const full = voice({
      offer: "a",
      audience: "b",
      proof: "c",
      avoid: "d",
      tones: ["Warm"],
    });
    expect(brandVoiceCompleteness(full)).toBe(1);
    expect(brandVoiceCompleteness(EMPTY_BRAND_VOICE)).toBe(0);
  });

  it("weighs every field the form actually shows", () => {
    // Guards the guard: if the field list and the meter drift apart, a question
    // can be asked that counts for nothing, or counted without being asked.
    for (const field of BRAND_VOICE_FIELDS) {
      const only = brandVoiceCompleteness(voice({ [field.key]: "x" } as Partial<BrandVoice>));
      expect(only, `${field.key} contributes nothing to the meter`).toBeGreaterThan(0);
    }
  });
});

describe("fetching a customer-supplied page", () => {
  it("accepts a bare domain, because that is what people type", () => {
    expect(normalizeSiteUrl("acme.com")).toBe("https://acme.com");
    expect(normalizeSiteUrl("  acme.com  ")).toBe("https://acme.com");
    // An explicit scheme is preserved rather than doubled.
    expect(normalizeSiteUrl("http://acme.com")).toBe("http://acme.com");
    expect(normalizeSiteUrl("https://acme.com/about")).toBe("https://acme.com/about");
    expect(normalizeSiteUrl("")).toBe("");
  });

  it("strips script and style bodies, not merely tags", () => {
    /**
     * Tag-stripping alone leaves minified JavaScript in the output, which is
     * both useless to a model and the bulk of a modern page's bytes.
     */
    const html = `
      <html><head><style>.a{color:red}</style><script>var x=1;alert("hi")</script></head>
      <body><h1>Acme Roofing</h1><p>We fix roofs in Denver.</p></body></html>`;
    const text = extractText(html);
    expect(text).toContain("Acme Roofing");
    expect(text).toContain("We fix roofs in Denver.");
    expect(text).not.toContain("alert");
    expect(text).not.toContain("color:red");
  });

  it("keeps block boundaries so sentences do not fuse", () => {
    const text = extractText("<p>First thing.</p><p>Second thing.</p>");
    expect(text).toMatch(/First thing\.\s*\n\s*Second thing\./);
  });

  it("decodes the entities that appear in real business copy", () => {
    expect(extractText("<p>Bolts &amp; Nuts &nbsp; Ltd&#39;s</p>")).toBe("Bolts & Nuts Ltd's");
  });
});

describe("the shared host guard", () => {
  it("blocks the cloud metadata server in every notation", () => {
    /**
     * The specific prize on Google Cloud: a GET to 169.254.169.254 from inside
     * Cloud Run returns service-account tokens. Blocking the dotted form while
     * allowing the others would be theatre, since they all resolve alike.
     */
    for (const host of [
      "169.254.169.254",
      "2852039166",
      "0xa9fea9fe",
      "0251.0376.0251.0376",
      "::ffff:169.254.169.254",
    ]) {
      expect(rejectPublicHost(normalizeHost(host)), `${host} was allowed`).toBe("IP_LITERAL");
    }
  });

  it("blocks internal names and bare hostnames", () => {
    expect(rejectPublicHost("localhost")).toBe("BLOCKED_HOST");
    expect(rejectPublicHost("metadata.google.internal")).toBe("BLOCKED_HOST");
    expect(rejectPublicHost("db.internal")).toBe("BLOCKED_HOST");
    expect(rejectPublicHost("intranet")).toBe("NO_DOT");
    expect(rejectPublicHost("")).toBe("EMPTY");
  });

  it("cannot be bypassed with a trailing root dot", () => {
    // "evil.internal." would sidestep a naive endsWith check on the suffix list.
    expect(rejectPublicHost(normalizeHost("db.internal."))).toBe("BLOCKED_HOST");
  });

  it("allows an ordinary public website", () => {
    expect(rejectPublicHost("acme.com")).toBeNull();
    expect(rejectPublicHost("www.acme.co.uk")).toBeNull();
  });
});

describe("the tone vocabulary", () => {
  it("is a closed set, because free-text tone is not a tone", () => {
    // "professional yet approachable" is what a text field collects, and it does
    // not survive contact with a prompt.
    expect(BRAND_TONES.length).toBeGreaterThanOrEqual(5);
    expect(new Set(BRAND_TONES).size).toBe(BRAND_TONES.length);
  });

  it("never asks a website to supply the prohibitions", () => {
    /**
     * A company's site does not say which claims its compliance team forbids, so
     * a suggestion there would be a confident guess that silently changes what
     * the AI will write. The extractor's prompt must not mention the field.
     */
    const source = readFileSync("lib/ai/suggestBrandVoice.ts", "utf8");
    const prompt = source.slice(source.indexOf("const SYSTEM"), source.indexOf("export interface"));
    expect(prompt).not.toContain("avoid:");
  });
});
