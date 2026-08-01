import { describe, it, expect } from "vitest";
import { buildLearnerMemoryBlock } from "./learner-memory-block";
import { LearnerProfileSchema } from "@/ai/learner";

function profile(overrides: Record<string, unknown> = {}) {
  return LearnerProfileSchema.parse({ id: "learner-1", ...overrides });
}

describe("buildLearnerMemoryBlock — IELTS facts", () => {
  it("leads with the band rather than the CEFR level", () => {
    const block = buildLearnerMemoryBlock(profile({ currentBand: 6, targetBand: 7.5, cefrLevel: "B2" }));
    expect(block?.split("\n")[0]).toContain("Current IELTS band: 6.0");
    expect(block).toContain("Target IELTS band: 7.5");
  });

  it("marks an unassessed band as self-reported", () => {
    // The model must not reason from a guessed number as though it were
    // measured — "your Band 6.0 reading" about a number nobody tested.
    const block = buildLearnerMemoryBlock(profile({ currentBand: 6, placementCompleted: false }));
    expect(block).toContain("self-reported, not yet assessed");
  });

  it("marks an assessed band as evidence", () => {
    const block = buildLearnerMemoryBlock(profile({ currentBand: 6, placementCompleted: true }));
    expect(block).toContain("from their placement assessment");
  });

  it("says outright when no band is known rather than omitting the line", () => {
    // Silence would let the model assume a default; an explicit "not known
    // yet" is what makes it ask or work from observation instead.
    const block = buildLearnerMemoryBlock(profile({ currentBand: null }));
    expect(block).toContain("Current IELTS band: not known yet");
  });

  it("labels CEFR as derived so it isn't mistaken for the goal", () => {
    const block = buildLearnerMemoryBlock(profile({ cefrLevel: "B2" }));
    expect(block).toContain("derived from their band");
    expect(block).toContain("not as their goal");
  });

  it("prefers a booked exam date over the coarse timeline", () => {
    const block = buildLearnerMemoryBlock(profile({ examDate: "2026-08-14", examTimeline: "Within 2 weeks" }));
    expect(block).toContain("Exam date: 2026-08-14");
    expect(block).not.toContain("Exam timeline");
  });

  it("falls back to the timeline when no date is booked", () => {
    const block = buildLearnerMemoryBlock(profile({ examDate: null, examTimeline: "Within 1 month" }));
    expect(block).toContain("Exam timeline: Within 1 month");
  });

  it("renders nothing at all without a profile", () => {
    expect(buildLearnerMemoryBlock(null)).toBeNull();
  });
});
