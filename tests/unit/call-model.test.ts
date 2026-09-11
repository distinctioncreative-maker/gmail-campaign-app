import { afterEach, describe, expect, it, vi } from "vitest";

const envMock = {
  GEMINI_MODEL: "gemini-flash-latest",
  GEMINI_API_KEY: "gem-key",
  AI_PROVIDER: "gemini",
  GROQ_API_KEY: "groq-key",
  GROQ_MODEL: "openai/gpt-oss-120b",
  ERROR_WEBHOOK_URL: "",
};
vi.mock("@/lib/env", () => ({ env: envMock }));

const { callModel, activeProvider, activeModel } = await import("@/lib/ai/callModel");

/** Capture the one request the adapter makes. */
function stubFetch(body: unknown, ok = true, status = 200) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
  envMock.AI_PROVIDER = "gemini";
});

describe("the default provider", () => {
  it("sends exactly the request the ten hand-written call sites sent", async () => {
    /**
     * The whole risk of this refactor in one test. Ten features built this
     * body by hand; if the shared version differs in any field, every AI
     * feature changes behaviour on a deploy nobody asked for.
     */
    const fetchMock = stubFetch({
      candidates: [{ content: { parts: [{ text: '{"ok":true}' }] } }],
    });

    const text = await callModel({ system: "SYS", user: "USR", temperature: 0.8 });

    expect(text).toBe('{"ok":true}');
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=gem-key"
    );
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({ "Content-Type": "application/json" });
    expect(JSON.parse(init.body)).toEqual({
      systemInstruction: { parts: [{ text: "SYS" }] },
      contents: [{ role: "user", parts: [{ text: "USR" }] }],
      generationConfig: { temperature: 0.8, responseMimeType: "application/json" },
    });
  });

  it("is what an unset AI_PROVIDER means", () => {
    envMock.AI_PROVIDER = "";
    expect(activeProvider()).toBe("gemini");
    expect(activeModel()).toBe("gemini-flash-latest");
  });
});

describe("the OpenAI-compatible provider", () => {
  it("speaks chat completions, which is also Cerebras, OpenRouter and Mistral", async () => {
    envMock.AI_PROVIDER = "groq";
    const fetchMock = stubFetch({ choices: [{ message: { content: '{"ok":true}' } }] });

    const text = await callModel({ system: "SYS", user: "USR", temperature: 0.2 });

    expect(text).toBe('{"ok":true}');
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.groq.com/openai/v1/chat/completions");
    expect(init.headers.Authorization).toBe("Bearer groq-key");
    expect(JSON.parse(init.body)).toEqual({
      model: "openai/gpt-oss-120b",
      messages: [
        { role: "system", content: "SYS" },
        { role: "user", content: "USR" },
      ],
      temperature: 0.2,
      response_format: { type: "json_object" },
    });
  });

  it("carries the key in a header, never in the URL", async () => {
    envMock.AI_PROVIDER = "groq";
    const fetchMock = stubFetch({ choices: [{ message: { content: "{}" } }] });
    await callModel({ system: "s", user: "u", temperature: 0 });
    expect(String(fetchMock.mock.calls[0][0])).not.toContain("groq-key");
  });
});

describe("both providers", () => {
  it("read a JSON body out of their own response shape identically", async () => {
    const payload = '{"subject":"Hi","html":"<p>x</p>"}';

    stubFetch({ candidates: [{ content: { parts: [{ text: payload }] } }] });
    const viaGemini = await callModel({ system: "s", user: "u", temperature: 0.5 });

    envMock.AI_PROVIDER = "groq";
    stubFetch({ choices: [{ message: { content: payload } }] });
    const viaGroq = await callModel({ system: "s", user: "u", temperature: 0.5 });

    expect(viaGemini).toBe(viaGroq);
    expect(JSON.parse(viaGroq)).toEqual({ subject: "Hi", html: "<p>x</p>" });
  });

  it("returns empty rather than throwing when a response carries no text", async () => {
    stubFetch({ candidates: [] });
    await expect(callModel({ system: "s", user: "u", temperature: 0 })).resolves.toBe("");
  });

  it("refuses up front when the configured provider has no key", async () => {
    envMock.AI_PROVIDER = "groq";
    envMock.GROQ_API_KEY = "";
    const fetchMock = stubFetch({});
    await expect(callModel({ system: "s", user: "u", temperature: 0 })).rejects.toThrow(
      /isn't set up/i
    );
    // And does not spend a request finding that out.
    expect(fetchMock).not.toHaveBeenCalled();
    envMock.GROQ_API_KEY = "groq-key";
  });
});
