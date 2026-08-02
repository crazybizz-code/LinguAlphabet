import { describe, it, expect } from "vitest";
import { resolveDescription, toCardDescription, MIN_BODY_CHARS_FOR_GENERATED_DESCRIPTION } from "./description";

const LONG_BODY = MIN_BODY_CHARS_FOR_GENERATED_DESCRIPTION + 100;

describe("resolveDescription", () => {
  it("always prefers the publisher's own words", () => {
    const resolved = resolveDescription("VOA's own blurb.", "A generated summary.", LONG_BODY);
    expect(resolved).toEqual({ description: "VOA's own blurb.", provenance: "publisher" });
  });

  it("treats a whitespace-only publisher description as absent", () => {
    const resolved = resolveDescription("   \n  ", "The episode looks at the Brooklyn Bridge.", LONG_BODY);
    expect(resolved.provenance).toBe("generated");
  });

  it("writes one from the item's own content when the publisher published none", () => {
    const resolved = resolveDescription("", "The episode looks at the Brooklyn Bridge.", LONG_BODY);
    expect(resolved).toEqual({
      description: "The episode looks at the Brooklyn Bridge.",
      provenance: "generated",
    });
  });

  it("never labels a generated description as publisher copy", () => {
    const resolved = resolveDescription("", "Written by us.", LONG_BODY);
    expect(resolved.provenance).not.toBe("publisher");
  });

  it("refuses to generate from an item with no real body, so the gate still catches a failed extraction", () => {
    // The reason "Missing description" is a useful diagnostic at all: an
    // article whose body failed to extract produces an empty description.
    // If a description could be conjured for ANY item, that signal is gone.
    const resolved = resolveDescription("", "A summary of nothing.", 10);
    expect(resolved).toEqual({ description: "" });
  });

  it("returns nothing when enrichment produced no summary either", () => {
    expect(resolveDescription("", "   ", LONG_BODY)).toEqual({ description: "" });
  });
});

describe("toCardDescription", () => {
  it("leaves a short summary alone", () => {
    expect(toCardDescription("A short summary.")).toBe("A short summary.");
  });

  it("collapses whitespace so a multi-line summary reads as one line", () => {
    expect(toCardDescription("Line one.\n\n  Line two.")).toBe("Line one. Line two.");
  });

  it("keeps whole sentences rather than stopping mid-clause", () => {
    const summary = `${"First sentence is here. ".repeat(20)}`;
    const result = toCardDescription(summary, 100);

    expect(result.length).toBeLessThanOrEqual(100);
    expect(result.endsWith(".")).toBe(true);
    // A description cut mid-clause reads like a bug even when the text
    // behind it is fine.
    expect(result).toBe("First sentence is here. First sentence is here. First sentence is here. First sentence is here.");
  });

  it("marks the cut when even the first sentence is too long to keep whole", () => {
    const runOn = `${"word ".repeat(200)}end.`;
    const result = toCardDescription(runOn, 60);

    expect(result.length).toBeLessThanOrEqual(60);
    expect(result.endsWith("…")).toBe(true);
    // Cut on a word boundary, never mid-word.
    expect(result).not.toMatch(/wor…$/);
  });
});
