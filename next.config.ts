import type { NextConfig } from "next";
import { ALLOWED_IMAGE_HOSTS } from "./src/lib/content/allowedImageHosts";

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
    // Sourced from src/lib/content/allowedImageHosts.ts — the same list
    // ArticleCard/PodcastCard check at runtime before ever handing a URL to
    // <Image>. next/image THROWS on any host not listed here, crashing the
    // whole page (confirmed in production when the active content source
    // changed without this list being updated) — one shared list is what
    // keeps this file and the runtime check from drifting apart again.
    remotePatterns: ALLOWED_IMAGE_HOSTS.map((hostname) => ({ protocol: "https" as const, hostname })),
  },
  async headers() {
    return [{ source: "/:path*", headers: SECURITY_HEADERS }];
  },
};

export default nextConfig;
