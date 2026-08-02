import { describe, it, expect } from "vitest";
import { normalizeTranscript } from "./queries";

describe("normalizeTranscript", () => {
  it("returns an empty array for null/undefined/non-array", () => {
    expect(normalizeTranscript(null)).toEqual([]);
    expect(normalizeTranscript(undefined)).toEqual([]);
    expect(normalizeTranscript("string")).toEqual([]);
    expect(normalizeTranscript(42)).toEqual([]);
  });

  it("returns an empty array for an empty array", () => {
    expect(normalizeTranscript([])).toEqual([]);
  });

  it("normalizes snake_case start_ms/end_ms (VOA pipeline) to camelCase", () => {
    const raw = [{ speaker: "HOST", text: "Hello world.", start_ms: 1000, end_ms: 3000 }];
    const result = normalizeTranscript(raw);
    expect(result).toHaveLength(1);
    expect(result[0].startMs).toBe(1000);
    expect(result[0].endMs).toBe(3000);
    expect(result[0].speaker).toBe("HOST");
    expect(result[0].text).toBe("Hello world.");
  });

  it("passes through already-camelCase startMs/endMs (BBC seed) unchanged", () => {
    const raw = [{ speaker: "PRESENTER", text: "Good morning.", startMs: 500, endMs: 2500 }];
    const result = normalizeTranscript(raw);
    expect(result[0].startMs).toBe(500);
    expect(result[0].endMs).toBe(2500);
  });

  it("camelCase takes precedence over snake_case when both are present", () => {
    const raw = [{ speaker: "A", text: "x", startMs: 100, endMs: 200, start_ms: 999, end_ms: 999 }];
    const result = normalizeTranscript(raw);
    expect(result[0].startMs).toBe(100);
    expect(result[0].endMs).toBe(200);
  });

  it("defaults missing timestamps to 0", () => {
    const raw = [{ speaker: "A", text: "y" }];
    const result = normalizeTranscript(raw);
    expect(result[0].startMs).toBe(0);
    expect(result[0].endMs).toBe(0);
  });

  it("normalizes word-level snake_case timestamps in ASR segments", () => {
    const raw = [
      {
        speaker: "S1",
        text: "hi there",
        start_ms: 0,
        end_ms: 1000,
        words: [
          { word: "hi", start_ms: 0, end_ms: 400 },
          { word: "there", start_ms: 450, end_ms: 900 },
        ],
      },
    ];
    const result = normalizeTranscript(raw);
    expect(result[0].words).toHaveLength(2);
    expect(result[0].words![0]).toEqual({ word: "hi", startMs: 0, endMs: 400 });
    expect(result[0].words![1]).toEqual({ word: "there", startMs: 450, endMs: 900 });
  });

  it("normalizes word-level camelCase timestamps unchanged", () => {
    const raw = [
      {
        speaker: "S1",
        text: "hello",
        startMs: 0,
        endMs: 500,
        words: [{ word: "hello", startMs: 0, endMs: 500 }],
      },
    ];
    const result = normalizeTranscript(raw);
    expect(result[0].words![0]).toEqual({ word: "hello", startMs: 0, endMs: 500 });
  });

  it("omits words key when words array is absent", () => {
    const raw = [{ speaker: "A", text: "no words", startMs: 0, endMs: 1000 }];
    const result = normalizeTranscript(raw);
    expect(result[0].words).toBeUndefined();
  });

  it("omits words key when words array is empty", () => {
    const raw = [{ speaker: "A", text: "no words", startMs: 0, endMs: 1000, words: [] }];
    const result = normalizeTranscript(raw);
    expect(result[0].words).toBeUndefined();
  });

  it("handles multiple segments correctly", () => {
    const raw = [
      { speaker: "A", text: "first", start_ms: 0, end_ms: 1000 },
      { speaker: "B", text: "second", startMs: 1100, endMs: 2000 },
    ];
    const result = normalizeTranscript(raw);
    expect(result).toHaveLength(2);
    expect(result[0].startMs).toBe(0);
    expect(result[1].startMs).toBe(1100);
  });
});
