import { describe, it, expect } from "vitest";
import { toLearningSessionContent } from "./podcast";
import type { PodcastContent } from "@/types/content";

function makePodcast(overrides: Partial<PodcastContent> = {}): PodcastContent {
  return {
    id: "test-id",
    contentType: "podcast",
    title: "Test Podcast",
    description: "A test podcast.",
    cefrLevelMin: "B1",
    cefrLevelMax: "B2",
    topics: ["Technology"],
    skills: ["Listening"],
    goalAlignment: [],
    tags: [],
    estimatedTimeMinutes: 99, // stale/wrong persisted value — must NOT drive output
    thumbnailUrl: "",
    status: "published",
    featured: false,
    premium: false,
    publishedAt: "2025-01-01T00:00:00Z",
    audioUrl: "https://example.com/audio.mp3",
    durationSeconds: 219, // Brooklyn Bridge canary value
    transcript: [],
    summary: "A summary.",
    takeaways: [],
    vocabulary: [],
    quiz: [],
    reflection: "How did this change your thinking?",
    ...overrides,
  };
}

describe("podcast adapter: toLearningSessionContent", () => {
  it("derives estimatedMinutes from durationSeconds, ignoring the persisted estimatedTimeMinutes", () => {
    const podcast = makePodcast({ durationSeconds: 219, estimatedTimeMinutes: 2 });
    const result = toLearningSessionContent(podcast);
    expect(result.estimatedMinutes).toBe(4); // Math.round(219/60) = 4
  });

  it("219-second podcast (Brooklyn Bridge canary) becomes exactly 4 estimated minutes", () => {
    const result = toLearningSessionContent(makePodcast({ durationSeconds: 219 }));
    expect(result.estimatedMinutes).toBe(4);
  });

  it("rounds correctly for a 90-second podcast", () => {
    const result = toLearningSessionContent(makePodcast({ durationSeconds: 90 }));
    expect(result.estimatedMinutes).toBe(2); // Math.round(1.5) = 2
  });

  it("rounds down correctly for a 149-second podcast", () => {
    const result = toLearningSessionContent(makePodcast({ durationSeconds: 149 }));
    expect(result.estimatedMinutes).toBe(2); // Math.round(2.483) = 2
  });

  it("rounds up correctly for a 150-second podcast", () => {
    const result = toLearningSessionContent(makePodcast({ durationSeconds: 150 }));
    expect(result.estimatedMinutes).toBe(3); // Math.round(2.5) = 3
  });

  it("BBC-style content with accurate durationSeconds still adapts correctly", () => {
    // Simulates a BBC podcast whose persisted estimatedTimeMinutes was also
    // hand-set at 17 min and durationSeconds is 1020 (= 17 min exactly)
    const podcast = makePodcast({ durationSeconds: 1020, estimatedTimeMinutes: 17 });
    const result = toLearningSessionContent(podcast);
    expect(result.estimatedMinutes).toBe(17); // Math.round(1020/60) = 17
  });

  it("passes durationSeconds through to the session content", () => {
    const result = toLearningSessionContent(makePodcast({ durationSeconds: 219 }));
    expect(result.durationSeconds).toBe(219);
  });

  it("maps all required identity fields correctly", () => {
    const result = toLearningSessionContent(makePodcast());
    expect(result.contentId).toBe("test-id");
    expect(result.contentType).toBe("podcast");
    expect(result.title).toBe("Test Podcast");
    expect(result.cefrLevel).toBe("B1");
  });
});
