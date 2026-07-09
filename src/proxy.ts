import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

// Next.js 16 renamed the "middleware" file convention to "proxy" — this
// is that file, not legacy Express-style middleware. Keep the export
// named `proxy` (not `middleware`) or Next.js won't pick it up.
export async function proxy(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static, _next/image (Next.js internals)
     * - favicon.ico, static image files
     * - robots.txt, sitemap.xml, manifest.webmanifest, opengraph-image,
     *   apple-icon (unauthenticated metadata routes — a session refresh
     *   on every crawler/link-preview-bot hit is pure wasted Supabase load)
     */
    "/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|manifest.webmanifest|opengraph-image|apple-icon|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
