import { describe, it, expect } from "vitest";
import { runQualityGate } from "./publishing";
import type { ContentItemDraft } from "./types";

function podcastDraft(overrides: Partial<ContentItemDraft["detailsRow"]> = {}): ContentItemDraft {
  return {
    id: "podcast-abc",
    contentType: "podcast",
    title: "How Coral Reefs Recover",
    description: "A short look at reef recovery.",
    cefrLevelMin: "B1",
    cefrLevelMax: "B2",
    topics: ["Science"],
    skills: ["Listening"],
    goalAlignment: [],
    tags: [],
    estimatedTimeMinutes: 12,
    thumbnailUrl: "",
    detailsTable: "podcast_details",
    detailsRow: {
      audio_url: "https://av.voanews.com/ep.mp3",
      duration_seconds: 720,
      transcript: [{ speaker: "Host", text: "Welcome.", start_ms: 0, end_ms: 1000 }],
      ...overrides,
    },
  };
}

describe("quality gate — podcast", () => {
  it("passes a complete episode", () => {
    expect(runQualityGate(podcastDraft()).passed).toBe(true);
  });

  it("rejects an empty transcript", () => {
    // `transcript jsonb not null default '[]'` means absent and empty are
    // the same row state — a silent lesson with nothing to read.
    const result = runQualityGate(podcastDraft({ transcript: [] }));
    expect(result.passed).toBe(false);
    expect(result.reasons).toContain("Missing transcript");
  });

  it("rejects a missing transcript field entirely", () => {
    const result = runQualityGate(podcastDraft({ transcript: undefined }));
    expect(result.passed).toBe(false);
    expect(result.reasons).toContain("Missing transcript");
  });

  it("rejects zero and negative durations", () => {
    expect(runQualityGate(podcastDraft({ duration_seconds: 0 })).reasons).toContain("Missing or invalid audio duration");
    expect(runQualityGate(podcastDraft({ duration_seconds: -5 })).reasons).toContain("Missing or invalid audio duration");
  });

  it("rejects a non-numeric duration", () => {
    expect(runQualityGate(podcastDraft({ duration_seconds: "720" })).reasons).toContain("Missing or invalid audio duration");
  });

  it("rejects a missing audio URL", () => {
    expect(runQualityGate(podcastDraft({ audio_url: "" })).reasons).toContain("Missing audio URL");
  });

  it("rejects http audio", () => {
    const result = runQualityGate(podcastDraft({ audio_url: "http://av.voanews.com/ep.mp3" }));
    expect(result.passed).toBe(false);
    expect(result.reasons).toContain("Audio URL is not https or not on an approved host");
  });

  it("rejects audio from an unapproved host", () => {
    // Licence review happens per source; a host nobody reviewed arriving
    // here is itself the bug.
    const result = runQualityGate(podcastDraft({ audio_url: "https://cdn.example.com/ep.mp3" }));
    expect(result.passed).toBe(false);
  });

  it("reports every failure at once rather than stopping at the first", () => {
    const result = runQualityGate(podcastDraft({ audio_url: "", duration_seconds: 0, transcript: [] }));
    expect(result.reasons).toHaveLength(3);
  });

  it("still enforces the universal fields", () => {
    const draft = podcastDraft();
    draft.title = "";
    expect(runQualityGate(draft).reasons).toContain("Missing title");
  });
});

describe("quality gate — article regression", () => {
  it("is unchanged by the podcast check", () => {
    const article: ContentItemDraft = {
      id: "article-abc",
      contentType: "article",
      title: "Reefs",
      description: "About reefs.",
      cefrLevelMin: "B1",
      cefrLevelMax: "B2",
      topics: ["Science"],
      skills: ["Reading"],
      goalAlignment: [],
      tags: [],
      estimatedTimeMinutes: 5,
      thumbnailUrl: "",
      detailsTable: "article_details",
      detailsRow: { body: "x".repeat(900) },
    };
    expect(runQualityGate(article).passed).toBe(true);
    expect(runQualityGate({ ...article, detailsRow: { body: "" } }).reasons).toContain("Missing article body");
  });
});
