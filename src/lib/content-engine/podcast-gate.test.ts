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
      duration_seconds: 330,
      transcript: [{ speaker: "Host", text: "Welcome.", start_ms: 0, end_ms: 1000 }],
      vocabulary: [{ word: "reef", phonetic: "", pos: "noun", translation: "", definition: "A ridge of rock/coral near the surface.", example: "The reef was full of fish." }],
      quiz: [{ type: "mc", question: "What is a reef?", options: ["A ridge near the surface", "A type of fish", "A boat", "A storm"], correct: 0, explanation: "Defined above.", grammarTopic: null, vocabularyWord: null }],
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

  // Security-audit finding: vocabulary=[]/quiz=[] previously passed this
  // gate (only checked audio/duration/transcript) and got published,
  // breaking Flashcards/Quiz. This must be blocked HERE, before any write.
  it("rejects an empty vocabulary array", () => {
    const result = runQualityGate(podcastDraft({ vocabulary: [] }));
    expect(result.passed).toBe(false);
    expect(result.reasons).toContain("Missing vocabulary");
  });

  it("rejects a missing vocabulary field entirely", () => {
    const result = runQualityGate(podcastDraft({ vocabulary: undefined }));
    expect(result.passed).toBe(false);
    expect(result.reasons).toContain("Missing vocabulary");
  });

  it("rejects an empty quiz array", () => {
    const result = runQualityGate(podcastDraft({ quiz: [] }));
    expect(result.passed).toBe(false);
    expect(result.reasons).toContain("Missing quiz");
  });

  it("rejects a missing quiz field entirely", () => {
    const result = runQualityGate(podcastDraft({ quiz: undefined }));
    expect(result.passed).toBe(false);
    expect(result.reasons).toContain("Missing quiz");
  });

  // Product policy: the LinguABC podcast experience targets ~5-6 minute
  // episodes. LinguABC's own generator already hard-gates 300-360s before
  // reaching this point, so this closes the gap for externally-ingested
  // audio (e.g. a 12-minute NOAA/VOA-style episode), which previously had
  // no upper duration bound at all.
  it("rejects podcast content over the 360s catalog limit, regardless of source", () => {
    const result = runQualityGate(podcastDraft({ duration_seconds: 720 }));
    expect(result.passed).toBe(false);
    expect(result.reasons.some((r) => /360s catalog limit/.test(r))).toBe(true);
  });

  it("accepts duration exactly at the 360s boundary", () => {
    expect(runQualityGate(podcastDraft({ duration_seconds: 360 })).passed).toBe(true);
  });

  // LinguABC AI-generated podcast level policy: B2/C1/C2 only, never B1.
  it("rejects a LinguABC-attributed episode whose CEFR level is outside B2/C1/C2", () => {
    const draft = podcastDraft({ attribution: "LinguABC" });
    draft.cefrLevelMin = "B1";
    draft.cefrLevelMax = "B1";
    const result = runQualityGate(draft);
    expect(result.passed).toBe(false);
    expect(result.reasons.some((r) => /must be B2, C1, or C2/.test(r))).toBe(true);
  });

  it("accepts a LinguABC-attributed episode at B2, C1, or C2", () => {
    for (const level of ["B2", "C1", "C2"] as const) {
      const draft = podcastDraft({ attribution: "LinguABC" });
      draft.cefrLevelMin = level;
      draft.cefrLevelMax = level;
      expect(runQualityGate(draft).passed).toBe(true);
    }
  });

  it("does NOT apply the LinguABC CEFR restriction to non-LinguABC attribution (e.g. NOAA, B1 is expected there)", () => {
    const draft = podcastDraft({ attribution: "NOAA" });
    draft.cefrLevelMin = "B1";
    draft.cefrLevelMax = "B1";
    expect(runQualityGate(draft).passed).toBe(true);
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
