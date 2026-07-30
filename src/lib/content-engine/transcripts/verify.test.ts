import { describe, it, expect } from "vitest";
import { verifyTranscript } from "./verify";
import type { EpisodeMetadata, TranscriptCandidate } from "./types";

const WPM = 150;

/** Neutral filler that can't accidentally satisfy a title/description overlap check. */
function filler(count: number): string {
  return Array.from({ length: count }, (_, index) => `filler${index % 60}`).join(" ");
}

function makeCandidate(options: {
  fillerWords?: number;
  speakers?: string[];
  segmentCount?: number;
  intro?: string;
  outro?: string;
  /** Extra prose spliced into the body — used to satisfy title/description overlap. */
  body?: string;
} = {}): TranscriptCandidate {
  const {
    fillerWords = 1490,
    speakers = ["Host", "Guest"],
    segmentCount = 10,
    intro = "Welcome to the show.",
    outro = "Thanks for listening.",
    body = "",
  } = options;

  const text = [intro, body, filler(fillerWords), outro].filter(Boolean).join(" ");
  const segments = Array.from({ length: segmentCount }, (_, index) => ({
    speaker: speakers[index % speakers.length],
    text: "segment text",
    startMs: index * 1000,
    endMs: (index + 1) * 1000,
  }));

  return { sourceId: "manual", segments, text };
}

/** Duration that makes the given transcript land at `ratio` on the duration check. */
function durationForRatio(candidate: TranscriptCandidate, ratio: number): number {
  const wordCount = candidate.text.trim().split(/\s+/).filter(Boolean).length;
  return (wordCount / WPM / ratio) * 60;
}

function metadata(candidate: TranscriptCandidate, overrides: Partial<EpisodeMetadata> = {}): EpisodeMetadata {
  return {
    title: "Climate Adaptation in Coastal Cities",
    description: "A conversation about climate adaptation strategies used by coastal cities facing rising sea levels.",
    durationSeconds: durationForRatio(candidate, 1),
    audioUrl: "https://cdn.example.com/ep1.mp3",
    ...overrides,
  };
}

/** Body prose containing the title + description content words, so those checks pass by default. */
const MATCHING_BODY =
  "Today we discuss climate adaptation in coastal cities. Our conversation covers adaptation strategies " +
  "that coastal cities use while facing rising sea levels, and what those strategies mean in practice.";

describe("verifyTranscript", () => {
  it("accepts a well-formed transcript that matches its episode metadata", () => {
    const candidate = makeCandidate({ body: MATCHING_BODY });
    const result = verifyTranscript(candidate, metadata(candidate));

    expect(result.verdict).toBe("accept");
    expect(result.rejectionReasons).toEqual([]);
    expect(result.confidence).toBeGreaterThan(0.8);
  });

  describe("duration consistency (hard gate)", () => {
    it("rejects a transcript far too short for the stated runtime, and says so specifically", () => {
      const candidate = makeCandidate({ fillerWords: 200, body: MATCHING_BODY });
      const result = verifyTranscript(candidate, metadata(candidate, { durationSeconds: 3600 }));

      expect(result.verdict).toBe("reject");
      expect(result.rejectionReasons.join(" ")).toMatch(/far too short/i);
      expect(result.rejectionReasons.join(" ")).toMatch(/partial paste or the wrong file/i);
    });

    it("rejects a transcript far too long for the stated runtime", () => {
      const candidate = makeCandidate({ fillerWords: 6000, body: MATCHING_BODY });
      const result = verifyTranscript(candidate, metadata(candidate, { durationSeconds: 600 }));

      expect(result.verdict).toBe("reject");
      expect(result.rejectionReasons.join(" ")).toMatch(/far too long/i);
    });

    it("overrides an otherwise-perfect transcript — a duration mismatch can't be averaged away", () => {
      const candidate = makeCandidate({ body: MATCHING_BODY });
      const result = verifyTranscript(candidate, metadata(candidate, { durationSeconds: 30 }));

      const passing = result.checks.filter((c) => c.status === "pass").map((c) => c.id);
      expect(passing).toContain("title_alignment");
      expect(passing).toContain("speaker_consistency");
      expect(result.verdict).toBe("reject");
    });

    it("skips the check entirely when no duration is supplied — missing metadata is not evidence of a bad transcript", () => {
      const candidate = makeCandidate({ body: MATCHING_BODY });
      const result = verifyTranscript(candidate, metadata(candidate, { durationSeconds: undefined }));

      expect(result.checks.find((c) => c.id === "duration_consistency")).toBeUndefined();
      expect(result.verdict).toBe("accept");
    });

    it("warns rather than failing in the grey band between clearly-fine and clearly-wrong", () => {
      const candidate = makeCandidate({ body: MATCHING_BODY });
      const result = verifyTranscript(candidate, metadata(candidate, { durationSeconds: durationForRatio(candidate, 1.6) }));

      expect(result.checks.find((c) => c.id === "duration_consistency")?.status).toBe("warn");
    });
  });

  describe("speaker consistency (hard gate)", () => {
    it("rejects segments with missing speaker labels", () => {
      const candidate = makeCandidate({ body: MATCHING_BODY });
      candidate.segments[3].speaker = "";
      const result = verifyTranscript(candidate, metadata(candidate));

      expect(result.verdict).toBe("reject");
      expect(result.rejectionReasons.join(" ")).toMatch(/no speaker label/i);
    });

    it("rejects an implausible number of distinct speakers as a parsing artifact", () => {
      const speakers = Array.from({ length: 12 }, (_, index) => `Speaker ${index}`);
      const candidate = makeCandidate({ speakers, segmentCount: 12, body: MATCHING_BODY });
      const result = verifyTranscript(candidate, metadata(candidate));

      expect(result.verdict).toBe("reject");
      expect(result.rejectionReasons.join(" ")).toMatch(/implausible for one episode/i);
    });

    it("rejects a transcript with no segments at all", () => {
      const candidate = makeCandidate({ body: MATCHING_BODY });
      candidate.segments = [];
      const result = verifyTranscript(candidate, metadata(candidate));

      expect(result.verdict).toBe("reject");
      expect(result.rejectionReasons.join(" ")).toMatch(/no segments/i);
    });

    it("warns on inconsistently-cased labels that would render as separate speakers", () => {
      const candidate = makeCandidate({ speakers: ["Host", "HOST"], segmentCount: 8, body: MATCHING_BODY });
      const result = verifyTranscript(candidate, metadata(candidate));

      expect(result.checks.find((c) => c.id === "speaker_consistency")?.status).toBe("warn");
    });
  });

  describe("truncation detection", () => {
    it("fails the intro check when the transcript starts mid-sentence", () => {
      const candidate = makeCandidate({ intro: "and then we continued talking about it.", body: MATCHING_BODY });
      const result = verifyTranscript(candidate, metadata(candidate));

      const intro = result.checks.find((c) => c.id === "intro_present");
      expect(intro?.status).toBe("fail");
      expect(intro?.detail).toMatch(/starts mid-sentence/i);
    });

    it("fails the outro check when the transcript is cut off without terminal punctuation", () => {
      const candidate = makeCandidate({ outro: "and the last thing I want to mention is", body: MATCHING_BODY });
      const result = verifyTranscript(candidate, metadata(candidate));

      const outro = result.checks.find((c) => c.id === "outro_present");
      expect(outro?.status).toBe("fail");
      expect(outro?.detail).toMatch(/cut off mid-sentence/i);
    });
  });

  describe("content alignment", () => {
    it("fails title alignment when the transcript is about a different episode", () => {
      const candidate = makeCandidate({ body: "We talk at length about sourdough baking techniques and oven temperature." });
      const result = verifyTranscript(candidate, metadata(candidate, { description: undefined }));

      const title = result.checks.find((c) => c.id === "title_alignment");
      expect(title?.status).toBe("fail");
      expect(title?.detail).toMatch(/does not appear to be about this episode/i);
    });

    it("skips title alignment when the title has too few content words to check", () => {
      const candidate = makeCandidate({ body: MATCHING_BODY });
      const result = verifyTranscript(candidate, metadata(candidate, { title: "Episode 12" }));

      expect(result.checks.find((c) => c.id === "title_alignment")).toBeUndefined();
    });

    it("skips description overlap when no show notes were supplied", () => {
      const candidate = makeCandidate({ body: MATCHING_BODY });
      const result = verifyTranscript(candidate, metadata(candidate, { description: undefined }));

      expect(result.checks.find((c) => c.id === "description_overlap")).toBeUndefined();
    });
  });

  it("reports every failing reason on rejection, never a bare 'low confidence'", () => {
    const candidate = makeCandidate({
      intro: "and so anyway",
      outro: "but then we",
      body: "We talk at length about sourdough baking techniques and oven temperature",
    });
    const result = verifyTranscript(candidate, metadata(candidate, { durationSeconds: undefined }));

    expect(result.verdict).toBe("reject");
    expect(result.rejectionReasons.length).toBeGreaterThan(1);
    expect(result.rejectionReasons.every((reason) => reason.trim().length > 0)).toBe(true);
  });

  it("never branches on where the transcript came from — an ASR source scores identically to a manual one", () => {
    const manual = makeCandidate({ body: MATCHING_BODY });
    const asr: TranscriptCandidate = { ...manual, sourceId: "whisper" };

    const manualResult = verifyTranscript(manual, metadata(manual));
    const asrResult = verifyTranscript(asr, metadata(asr));

    expect(asrResult.confidence).toBe(manualResult.confidence);
    expect(asrResult.verdict).toBe(manualResult.verdict);
  });
});
