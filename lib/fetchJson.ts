/**
 * Fetch JSON with friendly errors. When the server returns a non-JSON body
 * (e.g. a bare "Internal Server Error" from the platform when a container is
 * killed or times out), we surface a readable message and the status code
 * instead of a cryptic "Unexpected token 'I'… is not valid JSON".
 */
export async function fetchJson<T = unknown>(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<T> {
  const res = await fetch(input, init);
  const text = await res.text();

  let body: unknown = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      // Not JSON — the platform (not our API) returned an error page/string.
      const snippet = text.trim().slice(0, 120);
      if (!res.ok) {
        throw new Error(
          `The server hit a problem (error ${res.status}). ${
            snippet || "Please try again in a moment."
          }`
        );
      }
      throw new Error("The server sent an unexpected response. Please try again.");
    }
  }

  if (!res.ok) {
    const message =
      (body as { error?: string } | null)?.error ??
      `Request failed (error ${res.status}). Please try again.`;
    throw new Error(message);
  }

  return body as T;
}
