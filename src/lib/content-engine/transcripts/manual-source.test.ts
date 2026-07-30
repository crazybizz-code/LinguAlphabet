import { describe, it, expect } from "vitest";
import { parseTranscript, flattenTranscript, manualTranscriptSource } from "./manual-source";

describe("parseTranscript", () => {
  it("parses the JSON export shape podcast_details.transcript already stores", () => {
    const raw = JSON.stringify([
      { speaker: "Host", text: "Welcome back.", startMs: 0, endMs: 1500 },
      { speaker: "Guest", text: "Glad to be here.", startMs: 1500, endMs: 3000 },
    ]);
    expect(parseTranscript(raw)).toEqual([
      { speaker: "Host", text: "Welcome back.", startMs: 0, endMs: 1500 },
      { speaker: "Guest", text: "Glad to be here.", startMs: 1500, endMs: 3000 },
    ]);
  });

  it("accepts a wrapper object with a segments array", () => {
    const raw = JSON.stringify({ segments: [{ speaker: "Host", text: "Hello." }] });
    expect(parseTranscript(raw)).toHaveLength(1);
  });

  it("defaults missing timestamps to 0 rather than rejecting the file", () => {
    const raw = JSON.stringify([{ speaker: "Host", text: "No timings here." }]);
    expect(parseTranscript(raw)[0]).toEqual({ speaker: "Host", text: "No timings here.", startMs: 0, endMs: 0 });
  });

  it('parses the plain-text "Speaker: line" shape a human pastes', () => {
    const raw = "Host: Welcome to the show.\nGuest: Thanks for having me.";
    expect(parseTranscript(raw)).toEqual([
      { speaker: "Host", text: "Welcome to the show.", startMs: 0, endMs: 0 },
      { speaker: "Guest", text: "Thanks for having me.", startMs: 0, endMs: 0 },
    ]);
  });

  it("folds unlabelled continuation lines into the current speaker's turn", () => {
    const raw = "Host: First part\nsecond part of the same turn.\nGuest: My reply.";
    const segments = parseTranscript(raw);
    expect(segments).toHaveLength(2);
    expect(segments[0].text).toBe("First part second part of the same turn.");
  });

  it("leaves a leading unlabelled line with an empty speaker so the verifier's hard gate can catch it", () => {
    const segments = parseTranscript("no speaker label on this line\nHost: but this one has one.");
    expect(segments[0].speaker).toBe("");
  });

  it("throws on an empty file rather than returning zero segments", () => {
    expect(() => parseTranscript("   ")).toThrow(/empty/i);
  });

  it("throws a specific error for malformed JSON instead of silently falling back to text parsing", () => {
    expect(() => parseTranscript('[{"speaker": "Host", broken')).toThrow(/could not be parsed/i);
  });

  it("throws when JSON parses but is not the expected segment shape", () => {
    expect(() => parseTranscript(JSON.stringify([{ who: "Host", said: "hi" }]))).toThrow(/must be an array/i);
  });
});

describe("flattenTranscript", () => {
  it("joins segment text into the plain text verification and enrichment consume", () => {
    expect(flattenTranscript([
      { speaker: "Host", text: "One.", startMs: 0, endMs: 0 },
      { speaker: "Guest", text: "Two.", startMs: 0, endMs: 0 },
    ])).toBe("One. Two.");
  });
});

describe("manualTranscriptSource", () => {
  it("tags its output with its own source id for the audit trail", async () => {
    const candidate = await manualTranscriptSource.loadTranscript("Host: Hello there.");
    expect(candidate.sourceId).toBe("manual");
    expect(candidate.text).toBe("Hello there.");
  });

  it("rejects non-string input with a clear message", async () => {
    await expect(manualTranscriptSource.loadTranscript(42)).rejects.toThrow(/expects the transcript file/i);
  });
});
