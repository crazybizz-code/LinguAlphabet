import type { NextConfig } from "next";

// Baseline security headers only — no Content-Security-Policy yet. This
// app loads Google Fonts, Framer Motion (inline transforms), Next/Image,
// and the Supabase JS SDK; a CSP strict enough to matter but not tested
// live against every screen risks silently breaking one of those, which
// is worse than shipping without one. Revisit with real browser testing
// before adding one.
const SECURITY_HEADERS = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const nextConfig: NextConfig = {
  images: {
    // TEMP DEMO FALLBACK — remove after thumbnail extraction is fixed.
    // next/image refuses to optimize .svg by default (untrusted-SVG risk).
    // The only SVGs this app ever passes to <Image> are the 10 hand-authored
    // placeholders in public/assets/placeholders (src/lib/content/thumbnailFallback.ts)
    // -- no user-supplied or remote SVG ever reaches this path.
    dangerouslyAllowSVG: true,
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.unsplash.com",
      },
      // The Conversation article thumbnails (extracted from their official
      // republish package) are served from images.theconversation.com --
      // the wildcard also covers their other asset subdomains. next/image
      // THROWS on any host not listed here, crashing the whole page, so
      // this must stay in sync with what ingestion can store.
      {
        protocol: "https",
        hostname: "**.theconversation.com",
      },
    ],
  },
  async headers() {
    return [{ source: "/:path*", headers: SECURITY_HEADERS }];
  },
};

export default nextConfig;
