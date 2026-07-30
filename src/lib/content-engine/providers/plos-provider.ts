import type { ContentProvider, RawContentItem } from "../types";
import { resolveThumbnail } from "../thumbnails";

/**
 * PLOS Search API (api.plos.org/search) — a Solr-backed JSON API, not RSS.
 * No rss-parser, no customFields, no Readability, no HTML page fetch: this
 * provider only ever issues one JSON GET request per run and maps the
 * response directly onto RawContentItem.
 *
 * IMPORTANT, unverified from this sandbox (no network egress to
 * api.plos.org to confirm against a real response): the documented Search
 * API fields expose the article's ABSTRACT, not the full manuscript body
 * — there is no confirmed full-text field returned by this endpoint.
 * `body` below is the abstract, joined if the API returns it as multiple
 * paragraphs. Confirm real field names and body length against a live
 * response before trusting this source the way TechCrunch's assumed body
 * length was trusted without checking first.
 */

interface PlosDoc {
  id: string;
  title_display?: string;
  abstract?: string[];
  author_display?: string[];
  publication_date?: string;
}

interface PlosSearchResponse {
  response: {
    numFound: number;
    docs: PlosDoc[];
  };
}

function stripHtml(value: string): string {
  return value.replace(/<[^>]+>/g, "").trim();
}

export function mapPlosDocToRaw(doc: PlosDoc): RawContentItem {
  const externalId = doc.id;
  if (!externalId) {
    throw new Error("PLOS provider: doc has no id to use as an external id");
  }

  return {
    externalId,
    title: doc.title_display ? stripHtml(doc.title_display) : "Untitled",
    body: (doc.abstract ?? []).map(stripHtml).join("\n\n"),
    url: `https://doi.org/${externalId}`,
    publishedAt: doc.publication_date,
    author: doc.author_display?.join(", "),
    raw: doc,
  };
}

/**
 * PLOS journal codes appear inside the DOI itself
 * ("10.1371/journal.pone.0123456" -> "pone"), and each maps to its own
 * journals.plos.org site. Derived from the DOI rather than stored per
 * source, so every PLOS journal works without a config change.
 */
const PLOS_JOURNAL_SITES: Record<string, string> = {
  pone: "plosone",
  pbio: "plosbiology",
  pmed: "plosmedicine",
  pcbi: "ploscompbiol",
  pgen: "plosgenetics",
  ppat: "plospathogens",
  pntd: "plosntds",
  pstr: "plossustainabilitytransformation",
  pclm: "plosclimate",
  pwat: "ploswater",
  pdig: "plosdigitalhealth",
  pgph: "plosglobalpublichealth",
};

/**
 * PLOS's Search API returns no image field of any kind, which is why
 * every PLOS article rendered the branded fallback: this provider never
 * had a thumbnail to give. The article's own landing page does carry a
 * standard og:image, so the fix is to read that.
 *
 * UNVERIFIED FROM THIS SANDBOX — there is no network egress to
 * journals.plos.org here to confirm either the URL pattern or the
 * presence of og:image on a real page. This is written to degrade
 * safely rather than to be trusted blindly: a wrong URL, a missing
 * og:image, or a non-image response all resolve to `undefined` via
 * resolveThumbnail's HEAD validation, which stores an empty
 * thumbnail_url and renders the existing branded cover. The worst case
 * is therefore today's behaviour, never a broken image.
 */
export function plosArticleUrl(doi: string): string | undefined {
  const match = doi.match(/journal\.([a-z]+)\./i);
  const site = match ? PLOS_JOURNAL_SITES[match[1].toLowerCase()] : undefined;
  return site ? `https://journals.plos.org/${site}/article?id=${encodeURIComponent(doi)}` : undefined;
}

async function fetchPlosThumbnail(doi: string): Promise<string | undefined> {
  const articleUrl = plosArticleUrl(doi);
  if (!articleUrl) return undefined;
  try {
    const response = await fetch(articleUrl, { headers: { Accept: "text/html" } });
    if (!response.ok) return undefined;
    return await resolveThumbnail(await response.text(), articleUrl);
  } catch {
    // One article failing to yield an image must never fail the run.
    return undefined;
  }
}

export const plosArticleProvider: ContentProvider = {
  id: "plos",
  contentType: "article",
  async fetchRawItems(sourceConfig: Record<string, unknown>): Promise<RawContentItem[]> {
    const query = typeof sourceConfig.query === "string" && sourceConfig.query ? sourceConfig.query : "*:*";
    const rows = typeof sourceConfig.rows === "number" ? sourceConfig.rows : 20;

    const url = new URL("https://api.plos.org/search");
    url.searchParams.set("q", query);
    url.searchParams.set("fl", "id,title_display,abstract,author_display,publication_date");
    url.searchParams.set("rows", String(rows));
    url.searchParams.set("wt", "json");

    const response = await fetch(url.toString());
    if (!response.ok) {
      throw new Error(`PLOS provider: search request failed with status ${response.status}`);
    }

    const data = (await response.json()) as PlosSearchResponse;
    const items = data.response.docs.map(mapPlosDocToRaw);

    // Sequential, not parallel: one landing-page fetch per article, and
    // the run is already bounded by `rows`. Parallelising would hammer
    // journals.plos.org for no gain inside the route's time budget.
    for (const item of items) {
      item.thumbnailUrl = await fetchPlosThumbnail(item.externalId);
    }

    return items;
  },
};
