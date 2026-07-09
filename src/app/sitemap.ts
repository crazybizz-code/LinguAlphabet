import type { MetadataRoute } from "next";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

/**
 * Only the two real, content-bearing public pages — there's no landing
 * page yet ("/" just redirects to /login) and every other route requires
 * a session, so there's nothing else worth listing until a public landing
 * page exists.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: `${SITE_URL}/login`, changeFrequency: "monthly", priority: 1 },
    { url: `${SITE_URL}/signup`, changeFrequency: "monthly", priority: 0.9 },
  ];
}
