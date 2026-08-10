"use client";

/**
 * The last resort: an error thrown by the root layout itself.
 *
 * This one has to render its own `<html>` and `<body>`, because the layout that
 * normally provides them is the thing that failed. It also cannot use the app's
 * components or CSS tokens for the same reason, so the few colours here are
 * inlined and match app/globals.css rather than referencing it.
 *
 * Nothing about the error is displayed beyond the digest. At this level the
 * failure could be anything, including a configuration error whose message names
 * an environment variable.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          background: "#f1f4f8",
          color: "#0f1729",
          font: "16px/1.55 system-ui, sans-serif",
        }}
      >
        <main style={{ maxWidth: 460, padding: 32, textAlign: "center" }}>
          <h1 style={{ margin: 0, fontSize: 26 }}>Cadence could not start</h1>
          <p style={{ color: "#5a6478" }}>
            Something failed before the app could load. Reloading usually clears it. If it does not,
            the problem is on our side and we are the ones who need to fix it.
          </p>
          {error.digest ? (
            <p style={{ color: "#5a6478", fontFamily: "monospace", fontSize: 12 }}>
              Reference {error.digest}
            </p>
          ) : null}
          <button
            onClick={reset}
            style={{
              minHeight: 44,
              marginTop: 12,
              padding: "0 20px",
              border: 0,
              borderRadius: 8,
              background: "#2354c7",
              color: "#fff",
              font: "inherit",
              fontWeight: 650,
              cursor: "pointer",
            }}
          >
            Reload
          </button>
        </main>
      </body>
    </html>
  );
}
