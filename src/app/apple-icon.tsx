import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

/** Same mark as favicon.svg, rendered as the PNG size iOS expects for home-screen/pinned icons. */
export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, #FF9A56 0%, #EA580C 100%)",
        }}
      >
        <span style={{ fontSize: 100, fontWeight: 800, color: "#FFFFFF", fontFamily: "system-ui, sans-serif" }}>L</span>
      </div>
    ),
    { ...size },
  );
}
