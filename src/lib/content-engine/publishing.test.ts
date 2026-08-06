import { describe, it, expect } from "vitest";
import { runQualityGate } from "./publishing";
import { toArticleDraft } from "./adapters/article";
import type { ContentItemDraft, RawContentItem } from "./types";

const BODY = "Real article text. ".repeat(30); // ~570 chars

function articleDraft(overrides: Partial<ContentItemDraft> = {}): ContentItemDraft {
  return {
    id: "article-1",
    contentType: "article",
    title: "A title",
    description: "A description",
    cefrLevelMin: "B1",
    cefrLevelMax: "B2",
    topics: [],
    skills: ["Reading"],
    goalAlignment: [],
    tags: [],
    estimatedTimeMinutes: 5,
    thumbnailUrl: "",
    detailsTable: "article_details",
    detailsRow: { body: BODY },
    ...overrides,
  };
}

function rawItem(overrides: Partial<RawContentItem> = {}): RawContentItem {
  return { externalId: "x1", title: "A title", body: BODY, ...overrides };
}

describe("quality gate — article body", () => {
  it("passes a normal article", () => {
    expect(runQualityGate(articleDraft()).passed).toBe(true);
  });

  it("rejects an empty body with a reason naming the BODY, not the description", () => {
    const result = runQualityGate(articleDraft({ detailsRow: { body: "" } }));

    expect(result.passed).toBe(false);
    expect(result.reasons).toContain("Missing article body");
    // The old behaviour blamed the description for what is a missing body.
    expect(result.reasons).not.toContain("Missing description");
  });

  it("rejects a stub body too short to learn from", () => {
    const result = runQualityGate(articleDraft({ detailsRow: { body: "Too short." } }));

    expect(result.passed).toBe(false);
    expect(result.reasons.join(" ")).toMatch(/too short to learn from/i);
  });

  it("rejects a whitespace-only body", () => {
    expect(runQualityGate(articleDraft({ detailsRow: { body: "   \n\t  " } })).passed).toBe(false);
  });

  it("does NOT let a feed description smuggle a bodyless article past the gate", () => {
    // The exact regression the description fallback could have introduced:
    // good description, no body.
    const draft = articleDraft({ description: "A perfectly good feed summary.", detailsRow: { body: "" } });

    expect(runQualityGate(draft).passed).toBe(false);
    expect(runQualityGate(draft).reasons).toContain("Missing article body");
  });

  it("still enforces the universal checks", () => {
    expect(runQualityGate(articleDraft({ title: "  " })).reasons).toContain("Missing title");
    expect(runQualityGate(articleDraft({ estimatedTimeMinutes: 0 })).reasons).toContain("Missing or invalid estimated time");
  });

  it("does not apply the article body check to other content types", () => {
    // Podcasts now have checks of their own, so "passes the gate" is no
    // longer the way to prove the ARTICLE check didn't leak. What matters
    // is that the failures a podcast collects are podcast failures — an
    // episode is never asked for an article body.
    const podcast = articleDraft({ contentType: "podcast", detailsTable: "podcast_details", detailsRow: { audio_url: "https://x/a.mp3" } });
    const reasons = runQualityGate(podcast).reasons;
    expect(reasons).not.toContain("Missing article body");
    expect(reasons.some((reason) => reason.includes("Article body"))).toBe(false);
  });

  it("applies the podcast checks to a podcast draft", () => {
    const podcast = articleDraft({
      contentType: "podcast",
      detailsTable: "podcast_details",
      detailsRow: { audio_url: "https://av.voanews.com/a.mp3", duration_seconds: 600, transcript: [{ text: "hi" }] },
    });
    expect(runQualityGate(podcast).passed).toBe(true);
  });
});

describe("quality gate — CEFR level ordering", () => {
  it("passes a same-level range (cefrLevelMin === cefrLevelMax)", () => {
    expect(runQualityGate(articleDraft({ cefrLevelMin: "B1", cefrLevelMax: "B1" })).passed).toBe(true);
  });

  it("passes a valid ordered range (cefrLevelMin < cefrLevelMax)", () => {
    expect(runQualityGate(articleDraft({ cefrLevelMin: "A2", cefrLevelMax: "B2" })).passed).toBe(true);
  });

  it("rejects a reversed range (cefrLevelMin > cefrLevelMax) with a clear reason", () => {
    const result = runQualityGate(articleDraft({ cefrLevelMin: "B2", cefrLevelMax: "A1" }));
    expect(result.passed).toBe(false);
    expect(result.reasons.some((r) => r.includes("reversed"))).toBe(true);
  });

  it("rejects the widest possible reversed range (C2/A1)", () => {
    const result = runQualityGate(articleDraft({ cefrLevelMin: "C2", cefrLevelMax: "A1" }));
    expect(result.passed).toBe(false);
    expect(result.reasons.join(" ")).toMatch(/reversed/i);
  });
});

describe("article adapter — description source", () => {
  it("prefers the source's own summary over a mechanical body excerpt", () => {
    const draft = toArticleDraft(rawItem({ description: "The publisher's own summary." }));
    expect(draft.description).toBe("The publisher's own summary.");
  });

  it("falls back to excerpting the body when the source has no summary", () => {
    const draft = toArticleDraft(rawItem());
    expect(draft.description.startsWith("Real article text.")).toBe(true);
  });

  it("ignores a whitespace-only source summary rather than emitting a blank description", () => {
    const draft = toArticleDraft(rawItem({ description: "   " }));
    expect(draft.description.startsWith("Real article text.")).toBe(true);
  });

  it("gives an empty-bodied item a real description when the feed supplied one — the gate, not the description, is what rejects it", () => {
    const draft = toArticleDraft(rawItem({ body: "", description: "Feed summary here." }));
    expect(draft.description).toBe("Feed summary here.");

    const gate = runQualityGate({ ...draft, cefrLevelMin: "B1", cefrLevelMax: "B2", topics: [], estimatedTimeMinutes: 5 } as ContentItemDraft);
    expect(gate.passed).toBe(false);
    expect(gate.reasons).toContain("Missing article body");
  });

  it("truncates a long source summary", () => {
    const draft = toArticleDraft(rawItem({ description: "x".repeat(500) }));
    expect(draft.description.length).toBeLessThanOrEqual(201);
  });
});
