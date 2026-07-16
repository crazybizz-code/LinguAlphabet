import type { ContentProvider, RawContentItem } from "../types";

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
    return data.response.docs.map(mapPlosDocToRaw);
  },
};
