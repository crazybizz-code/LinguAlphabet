import { describe, it, expect } from "vitest";
import { computeTranscriptHash, normalizeTranscriptForHash } from "./hash";

const segment = (speaker: string, text: string) => ({ speaker, text, startMs: 0, endMs: 0 });

describe("normalizeTranscriptForHash", () => {
  it("drops speaker labels — the same episode transcribed by two people is one episode", () => {
    const a = [segment("Host", "The ocean is warming."), segment("Guest", "Faster than expected.")];
    const b = [segment("ANNA", "The ocean is warming."), segment("BEN", "Faster than expected.")];
    expect(normalizeTranscriptForHash(a)).toBe(normalizeTranscriptForHash(b));
  });

  it("ignores casing, punctuation and whitespace drift", () => {
    const a = [segment("A", "Don't  panic — it's fine.")];
    const b = [segment("A", "dont panic its fine")];
    expect(normalizeTranscriptForHash(a)).toBe(normalizeTranscriptForHash(b));
  });

  it("still distinguishes genuinely different words", () => {
    const a = [segment("A", "The ocean is warming.")];
    const b = [segment("A", "The ocean is cooling.")];
    expect(normalizeTranscriptForHash(a)).not.toBe(normalizeTranscriptForHash(b));
  });
});

describe("computeTranscriptHash", () => {
  it("gives the same hash to the same episode under different audio URLs", () => {
    // The whole point: podcastContentId() hashes the audio URL, so a CDN
    // change or a ?utm_source= suffix would otherwise publish twice.
    const episode = [segment("Host", "Welcome to the show."), segment("Host", "Today we discuss coral.")];
    expect(computeTranscriptHash(episode)).toBe(computeTranscriptHash([...episode]));
  });

  it("returns null for an empty transcript rather than a shared hash", () => {
    // A hash of nothing would collide every transcript-less episode with
    // every other, which is worse than not deduping at all.
    expect(computeTranscriptHash([])).toBeNull();
    expect(computeTranscriptHash([segment("A", "   ")])).toBeNull();
  });

  it("produces a stable sha256 hex digest", () => {
    const hash = computeTranscriptHash([segment("A", "hello world")]);
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });
});
