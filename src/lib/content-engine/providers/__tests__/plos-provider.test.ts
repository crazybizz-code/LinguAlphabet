import { describe, it, expect, vi, afterEach } from "vitest";
import { isCanonicalArticleId, isIngestableArticleDoc, mapPlosDocToRaw, plosArticleProvider } from "../plos-provider";

afterEach(() => vi.unstubAllGlobals());

/** The two ids that actually reached production and failed the quality gate. */
const REAL_SUBRESOURCE_IDS = ["10.1371/journal.pone.0003322/abstract", "10.1371/journal.pone.0003322/references"];
const REAL_ARTICLE_ID = "10.1371/journal.pone.0003322";

function articleDoc(overrides: Record<string, unknown> = {}) {
  return {
    id: REAL_ARTICLE_ID,
    title_display: "A Real Research Article",
    abstract: ["This is a genuine abstract with real content in it."],
    author_display: ["A Researcher"],
    publication_date: "2026-01-01",
    ...overrides,
  };
}

describe("isCanonicalArticleId", () => {
  it("accepts a canonical PLOS article DOI", () => {
    expect(isCanonicalArticleId(REAL_ARTICLE_ID)).toBe(true);
  });

  it.each(REAL_SUBRESOURCE_IDS)("rejects the section sub-document id %s", (id) => {
    expect(isCanonicalArticleId(id)).toBe(false);
  });

  it("rejects section suffixes PLOS was never explicitly blocklisted for", () => {
    // Shape check, not a suffix blocklist — a suffix added later is rejected too.
    expect(isCanonicalArticleId(`${REAL_ARTICLE_ID}/body`)).toBe(false);
    expect(isCanonicalArticleId(`${REAL_ARTICLE_ID}/title`)).toBe(false);
    expect(isCanonicalArticleId(`${REAL_ARTICLE_ID}/something-new-in-2027`)).toBe(false);
  });

  it("rejects empty or malformed ids", () => {
    expect(isCanonicalArticleId(undefined)).toBe(false);
    expect(isCanonicalArticleId("")).toBe(false);
    expect(isCanonicalArticleId("not-a-doi")).toBe(false);
    expect(isCanonicalArticleId("10.1371/")).toBe(false);
  });
});

describe("isIngestableArticleDoc", () => {
  it("accepts a complete research article", () => {
    expect(isIngestableArticleDoc(articleDoc())).toBe(true);
  });

  it("rejects the exact production failures — sub-resource id, null title, no abstract", () => {
    for (const id of REAL_SUBRESOURCE_IDS) {
      expect(isIngestableArticleDoc({ id, title_display: undefined, abstract: undefined })).toBe(false);
    }
  });

  it("rejects a canonical id that still has no title, instead of inventing 'Untitled'", () => {
    expect(isIngestableArticleDoc(articleDoc({ title_display: undefined }))).toBe(false);
    expect(isIngestableArticleDoc(articleDoc({ title_display: "   " }))).toBe(false);
  });

  it("rejects a canonical, titled record with no abstract — PLOS's abstract IS the body", () => {
    expect(isIngestableArticleDoc(articleDoc({ abstract: undefined }))).toBe(false);
    expect(isIngestableArticleDoc(articleDoc({ abstract: [] }))).toBe(false);
    expect(isIngestableArticleDoc(articleDoc({ abstract: ["   "] }))).toBe(false);
    expect(isIngestableArticleDoc(articleDoc({ abstract: ["<p> </p>"] }))).toBe(false);
  });
});

describe("mapPlosDocToRaw", () => {
  it("builds a resolvable DOI url for a canonical article", () => {
    expect(mapPlosDocToRaw(articleDoc()).url).toBe(`https://doi.org/${REAL_ARTICLE_ID}`);
  });

  it("takes externalId verbatim from the API — it is never constructed here", () => {
    expect(mapPlosDocToRaw(articleDoc()).externalId).toBe(REAL_ARTICLE_ID);
  });
});

describe("plosArticleProvider.fetchRawItems", () => {
  function stubSearch(docs: unknown[]) {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ response: { numFound: docs.length, docs } }),
    });
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  }

  it("filters section sub-documents out before they become RawContentItems", async () => {
    stubSearch([
      { id: REAL_SUBRESOURCE_IDS[0], title_display: null, abstract: undefined },
      articleDoc(),
      { id: REAL_SUBRESOURCE_IDS[1], title_display: null, abstract: undefined },
    ]);

    const items = await plosArticleProvider.fetchRawItems({ rows: 3 });

    expect(items).toHaveLength(1);
    expect(items[0].externalId).toBe(REAL_ARTICLE_ID);
  });

  it("returns nothing rather than 'Untitled' stubs when every doc is a sub-resource", async () => {
    stubSearch(REAL_SUBRESOURCE_IDS.map((id) => ({ id, title_display: null, abstract: undefined })));

    const items = await plosArticleProvider.fetchRawItems({ rows: 2 });
    expect(items).toEqual([]);
  });

  it("applies the server-side canonical-article filters", async () => {
    const fetchMock = stubSearch([articleDoc()]);
    await plosArticleProvider.fetchRawItems({ rows: 1 });

    const requested = String(fetchMock.mock.calls[0][0]);
    expect(requested).toContain("fq=doc_type%3Afull");
    expect(requested).toContain("Issue+Image");
  });

  it("requests article_type and doc_type so raw_payload stays diagnosable", async () => {
    const fetchMock = stubSearch([articleDoc()]);
    await plosArticleProvider.fetchRawItems({ rows: 1 });

    const requested = decodeURIComponent(String(fetchMock.mock.calls[0][0]));
    expect(requested).toContain("article_type");
    expect(requested).toContain("doc_type");
  });
});
