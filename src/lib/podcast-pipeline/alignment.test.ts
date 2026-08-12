import { describe, it, expect } from "vitest";
import { validateAlignmentQuality, type AlignedSegment, type AlignmentResult } from "./alignment";

/**
 * Security-audit regression test (MEDIUM finding #6). Extracted from
 * pipeline.ts's inline alignmentProblems block so this pure, I/O-free
 * validation is testable without mocking ffprobe/Fish
 * Audio/faster-whisper/Supabase. The new check: segment i must not START
 * before segment i-1 ENDS -- the pre-fix logic only rejected i starting
 * before i-1 STARTED, which let two adjacent segments genuinely overlap.
 */

function segment(speaker: string, startMs: number, endMs: number): AlignedSegment {
  return { speaker, text: "x", startMs, endMs };
}

function result(segments: AlignedSegment[], overrides: Partial<AlignmentResult> = {}): AlignmentResult {
  return { segments, coverage: 1, missingSegments: 0, durationMs: 10000, ...overrides };
}

describe("validateAlignmentQuality — overlap detection", () => {
  it("accepts back-to-back, non-overlapping segments", () => {
    const segments = [segment("A", 0, 1000), segment("B", 1000, 2000), segment("B", 2000, 3000)];
    expect(validateAlignmentQuality(result(segments), 3)).toEqual([]);
  });

  it("accepts segments with a gap between them", () => {
    const segments = [segment("A", 0, 1000), segment("B", 1500, 2000)];
    expect(validateAlignmentQuality(result(segments), 2)).toEqual([]);
  });

  it("rejects a segment that starts before the previous one ends (overlap)", () => {
    const segments = [segment("A", 0, 1000), segment("B", 800, 2000)];
    const problems = validateAlignmentQuality(result(segments), 2);
    expect(problems.some((p) => /overlaps segment/.test(p))).toBe(true);
  });

  it("still rejects the pre-existing out-of-order case (start before previous start)", () => {
    const segments = [segment("A", 1000, 2000), segment("B", 500, 1500)];
    const problems = validateAlignmentQuality(result(segments), 2);
    expect(problems.some((p) => /out of order/.test(p))).toBe(true);
  });

  it("still rejects startMs >= endMs within a single segment", () => {
    const segments = [segment("A", 1000, 1000)];
    const problems = validateAlignmentQuality(result(segments), 1);
    expect(problems.some((p) => /startMs >= endMs/.test(p))).toBe(true);
  });

  it("still rejects a segment-count mismatch and low coverage", () => {
    const problems = validateAlignmentQuality(result([segment("A", 0, 1000)], { coverage: 0.5 }), 2);
    expect(problems.some((p) => /segment count/.test(p))).toBe(true);
    expect(problems.some((p) => /token coverage/.test(p))).toBe(true);
  });
});
