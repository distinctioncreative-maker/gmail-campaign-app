import { describe, expect, it } from "vitest";
import {
  FAKE_PREVIEW_VALUES,
  listPlaceholders,
  renderHtmlTemplate,
  renderTemplate,
} from "@/lib/personalization/render";

describe("renderTemplate", () => {
  it("replaces known placeholders", () => {
    const { output, unresolved } = renderTemplate(
      "Hi {{first_name}}, I saw {{business_name}} and thought of you.",
      { first_name: "Jason", business_name: "Mainmastics Llc" }
    );
    expect(output).toBe("Hi Jason, I saw Mainmastics Llc and thought of you.");
    expect(unresolved).toEqual([]);
  });

  it("tolerates whitespace inside braces", () => {
    const { output } = renderTemplate("Hi {{ first_name }}!", { first_name: "Ana" });
    expect(output).toBe("Hi Ana!");
  });

  it("reports unresolved placeholders and leaves them visible", () => {
    const { output, unresolved } = renderTemplate("Hi {{first_name}} from {{company_name}}", {
      first_name: "Jo",
    });
    expect(output).toContain("{{company_name}}");
    expect(unresolved).toEqual(["company_name"]);
  });

  it("treats empty values as unresolved", () => {
    const { unresolved } = renderTemplate("{{phone}}", { phone: "" });
    expect(unresolved).toEqual(["phone"]);
  });

  it("drops an empty signature instead of reporting it unresolved", () => {
    const { output, unresolved } = renderTemplate("Thanks,\n{{signature}}", {
      signature: "",
    });
    expect(output).toBe("Thanks,\n");
    expect(unresolved).toEqual([]);
  });

  it("drops a missing signature (no value supplied at all)", () => {
    const { output, unresolved } = renderTemplate("Cheers {{signature}}", {});
    expect(output).toBe("Cheers ");
    expect(unresolved).toEqual([]);
  });

  it("still fills the signature when a value is present", () => {
    const { output } = renderTemplate("{{signature}}", { signature: "Alex · Advisor" });
    expect(output).toBe("Alex · Advisor");
  });

  it("escapes contact values in HTML without flattening a sanitized signature", () => {
    const { output } = renderHtmlTemplate(
      "<p>Hi {{first_name}}</p>{{signature}}",
      {
        first_name: '<img src=x onerror="alert(1)">',
        signature: "<p><strong>Alex</strong></p>",
      }
    );
    expect(output).toContain("&lt;img");
    expect(output).not.toContain("<img");
    expect(output).toContain("<strong>Alex</strong>");
  });

  it("escapes quotes in values inserted into HTML attributes", () => {
    const { output } = renderHtmlTemplate('<a title="{{business_name}}">Company</a>', {
      business_name: '" onmouseover="alert(1)',
    });
    expect(output).toContain("&quot; onmouseover=&quot;");
    expect(output).not.toContain('title="" onmouseover=');
  });

  it("fake preview data covers every spec placeholder", () => {
    const template =
      "{{first_name}}{{last_name}}{{full_name}}{{business_name}}{{email}}{{phone}}{{region}}{{requested_amount}}{{lead_source}}{{sender_name}}{{sender_title}}{{sender_phone}}{{sender_email}}{{company_name}}{{company_website}}{{physical_address}}{{unsubscribe_text}}";
    const { unresolved } = renderTemplate(template, FAKE_PREVIEW_VALUES);
    expect(unresolved).toEqual([]);
  });
});

describe("listPlaceholders", () => {
  it("lists unique placeholders", () => {
    expect(listPlaceholders("{{a}} {{b}} {{a}}")).toEqual(["a", "b"]);
  });
});
