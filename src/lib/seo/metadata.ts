import type { Metadata } from "next";

const BRAND = "LinguABC";

type RouteMetadataInput = {
  /** Page-specific segment, e.g. "Log In" — the root layout's title template appends " — LinguABC". */
  title: string;
  description: string;
  /** Path this metadata describes, e.g. "/login" — resolved against metadataBase for canonical/og:url. */
  path: string;
  /** Set false for auth-gated or low-value pages (onboarding, dashboard, password reset) that should never be indexed. Defaults to true. */
  index?: boolean;
};

/**
 * Composes per-route metadata (title, description, canonical, Open Graph,
 * Twitter Card, robots) so every route gets a unique, non-duplicate title
 * instead of silently inheriting the root layout's site-wide defaults.
 */
export function buildMetadata({ title, description, path, index = true }: RouteMetadataInput): Metadata {
  const socialTitle = `${title} — ${BRAND}`;

  return {
    title,
    description,
    alternates: { canonical: path },
    // A child segment's `openGraph`/`twitter` object replaces the root
    // layout's wholesale rather than merging field-by-field, so siteName/
    // locale/type/images/card must be restated here too or every non-root
    // route silently loses them (verified against the built HTML output).
    openGraph: {
      title: socialTitle,
      description,
      url: path,
      siteName: BRAND,
      locale: "en_US",
      type: "website",
      images: ["/opengraph-image"],
    },
    twitter: {
      card: "summary_large_image",
      title: socialTitle,
      description,
      images: ["/opengraph-image"],
    },
    ...(index ? {} : { robots: { index: false, follow: false } }),
  };
}
