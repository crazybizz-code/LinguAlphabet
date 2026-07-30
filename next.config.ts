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
    // Any https host. A hand-maintained hostname list is unworkable once
    // the catalog draws on multiple RSS sources whose image CDNs aren't
    // knowable ahead of time: every missing entry silently replaced a
    // real photo with the branded fallback, and next/image THROWS for an
    // unlisted host, which previously crashed whole pages.
    //
    // Safety does not come from this list. It comes from
    // content-engine/thumbnails.ts, which HEAD-validates every thumbnail
    // at ingestion so only URLs that really serve an image are ever
    // stored, plus the cards' isAllowedImageHost structural check and
    // onError fallback.
    //
    // TRADEOFF (deliberate, revisit post-launch): this lets /_next/image
    // optimize any https image, so it can be used as an open image
    // resizing proxy. Narrow to the observed CDN hosts once the
    // production source set has stabilised.
    remotePatterns: [{ protocol: "https", hostname: "**" }],
  },
  async headers() {
    return [{ source: "/:path*", headers: SECURITY_HEADERS }];
  },
};

export default nextConfig;
