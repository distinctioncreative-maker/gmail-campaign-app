import { ImageResponse } from "next/og";

export const alt =
  "Cadence, AI-powered Gmail outreach for qualified conversations";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    <div
      style={{
        alignItems: "center",
        /* Hex rather than tokens: satori renders this off-DOM, so CSS custom
           properties are not available. Values mirror --ink, --on-ink,
           --primary, and --on-ink-muted from app/globals.css. */
        background: "linear-gradient(135deg, #0b0f17 0%, #131a26 55%, #1b2331 100%)",
        color: "#e8edf5",
        display: "flex",
        height: "100%",
        justifyContent: "center",
        padding: "72px",
        width: "100%",
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", maxWidth: 980 }}>
        <div
          style={{
            color: "#8fb3ff",
            display: "flex",
            fontSize: 30,
            fontWeight: 650,
            letterSpacing: "-0.02em",
          }}
        >
          CADENCE
        </div>
        <div
          style={{
            display: "flex",
            fontSize: 70,
            fontWeight: 700,
            letterSpacing: "-0.05em",
            lineHeight: 1.02,
            marginTop: 30,
          }}
        >
          Turn Gmail outreach into qualified conversations.
        </div>
        <div
          style={{
            color: "#a3afc2",
            display: "flex",
            fontSize: 30,
            lineHeight: 1.35,
            marginTop: 28,
          }}
        >
          Human-reviewed campaigns, visible sending controls, and reply-focused
          reporting in one Gmail-connected workspace.
        </div>
      </div>
    </div>,
    size
  );
}
