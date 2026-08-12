import { describe, it, expect } from "vitest";
import { stripProsodyTags, buildReaderTranscript } from "./transcript";

/**
 * Security-audit regression test (LOW finding #7), defense-in-depth
 * layer. scriptGeneration.ts's validateGeneratedScript() now rejects
 * unclosed brackets before a script reaches this function, but this
 * module is also used for hand-authored/precomputed episodes that never
 * go through that validator (EpisodeInput.precomputedAudio). This proves
 * the reader-facing transcript can never contain a literal bracket
 * character regardless of how malformed the input is.
 */
describe("stripProsodyTags", () => {
  it("strips well-formed bracket cues", () => {
    expect(stripProsodyTags("[emphasis] I really thought it would work.")).toBe("I really thought it would work.");
  });

  it("strips a stray unclosed opening bracket rather than leaving it in the output", () => {
    expect(stripProsodyTags("[emphasis this never closes and keeps going")).not.toMatch(/[[\]]/);
  });

  it("strips a stray unmatched closing bracket rather than leaving it in the output", () => {
    expect(stripProsodyTags("that was odd] don't you think")).not.toMatch(/[[\]]/);
  });

  it("never leaves any bracket character in the output, however malformed the input", () => {
    expect(stripProsodyTags("[[nested]] and ]] nonsense [[[")).not.toMatch(/[[\]]/);
  });

  it("buildReaderTranscript's output text never contains a bracket character", () => {
    const segments = buildReaderTranscript([
      ["Sarah", "[emphasis this never closes"],
      ["Hannah", "that's odd] right"],
    ]);
    for (const segment of segments) expect(segment.text).not.toMatch(/[[\]]/);
  });
});
