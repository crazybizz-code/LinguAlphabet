import { describe, it, expect } from "vitest";
import { buildRecommendationReason } from "./recommendation-reason";

function item(overrides: Record<string, unknown> = {}) {
  return {
    contentType: "podcast",
    cefrLevelMin: "B1",
    cefrLevelMax: "B2",
    topics: [],
    ...overrides,
  } as never;
}

describe("buildRecommendationReason", () => {
  it("names the learner's level when the item sits in their range", () => {
    expect(buildRecommendationReason(item(), { englishLevel: "B2", interests: [] })).toBe(
      "Listening practice matched to your level (B2).",
    );
  });

  it("calls a harder item a stretch rather than claiming it fixes a weakness", () => {
    // We have no per-skill weakness data until the mock engine ships —
    // "your weakest reading skill" would be a fabricated diagnosis.
    expect(
      buildRecommendationReason(item({ contentType: "article", cefrLevelMin: "C1", cefrLevelMax: "C2" }), {
        englishLevel: "B1",
        interests: [],
      }),
    ).toBe("Reading practice above B1 — a deliberate stretch.");
  });

  it("frames an easier item as fluency work", () => {
    expect(
      buildRecommendationReason(item({ cefrLevelMin: "A1", cefrLevelMax: "A2" }), {
        englishLevel: "C1",
        interests: [],
      }),
    ).toBe("Listening practice below C1 — builds speed and confidence.");
  });

  it("mentions a topic only when the learner actually said they were interested in it", () => {
    expect(
      buildRecommendationReason(item({ topics: ["Business", "Travel"] }), {
        englishLevel: "B2",
        interests: ["Travel"],
      }),
    ).toBe("Listening practice matched to your level (B2), on travel.");
  });

  it("stays silent about topics the learner never picked", () => {
    expect(
      buildRecommendationReason(item({ topics: ["Business"] }), { englishLevel: "B2", interests: ["Travel"] }),
    ).toBe("Listening practice matched to your level (B2).");
  });

  it("makes no level claim when the learner has no level yet", () => {
    expect(buildRecommendationReason(item(), { englishLevel: null, interests: [] })).toBe(
      "Listening practice picked for you by Tuto.",
    );
  });

  it("falls back to the topic when the level is unknown but an interest matches", () => {
    expect(
      buildRecommendationReason(item({ topics: ["Career"] }), { englishLevel: null, interests: ["Career"] }),
    ).toBe("Listening practice, on career.");
  });
});
