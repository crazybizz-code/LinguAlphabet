import { ImageResponse } from "next/og";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/**
 * Generated at request/build time from the same brand tokens as
 * favicon.svg (--color-primary #FF6B00 → #EA580C gradient, the "L" mark)
 * — not a new design asset, just a social-preview render of the existing
 * identity so links shared in Slack/iMessage/Twitter don't show a blank
 * card.
 */
export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, #FF9A56 0%, #EA580C 100%)",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        <div
          style={{
            display: "flex",
            height: 140,
            width: 140,
            borderRadius: 36,
            background: "rgba(255,255,255,0.18)",
            alignItems: "center",
            justifyContent: "center",
            marginBottom: 40,
          }}
        >
          <span style={{ fontSize: 80, fontWeight: 800, color: "#FFFFFF" }}>L</span>
        </div>
        <div style={{ display: "flex", fontSize: 64, fontWeight: 800, color: "#FFFFFF" }}>LinguAlphabet</div>
        <div style={{ display: "flex", fontSize: 30, color: "rgba(255,255,255,0.85)", marginTop: 16 }}>
          AI Coach for Language Mastery
        </div>
      </div>
    ),
    { ...size },
  );
}
