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
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.unsplash.com",
      },
    ],
  },
  async headers() {
    return [{ source: "/:path*", headers: SECURITY_HEADERS }];
  },
};

export default nextConfig;
