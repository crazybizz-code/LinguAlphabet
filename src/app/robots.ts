import type { MetadataRoute } from "next";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

/**
 * Every (app) route already redirects an unauthenticated visitor straight
 * to /login (each Server Component does its own `if (!user) redirect(...)`),
 * so there's nothing sensitive for a crawler to see by requesting them —
 * no need to hand-maintain a disallow list that goes stale as routes are
 * added. Onboarding routes are only reachable after signup and carry no
 * content worth indexing, but aren't a security concern either.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
