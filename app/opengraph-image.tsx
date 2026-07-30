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
        background: "#07111f",
        color: "#f7f9fc",
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
            color: "#7eb3ff",
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
            color: "#b7c2d4",
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
