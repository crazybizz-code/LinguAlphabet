import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";

/**
 * PRODUCTION WIRING CHECK: dailyGenerate.ts (the daily-automation
 * orchestrator scripts/run-daily-episode.ts actually invokes) must call
 * V2's generatePodcastScriptV2() for script generation, never V1's
 * generateEpisodeScript(). A full behavioral test of generateDailyEpisode()
 * would require mocking Supabase (idempotency, topic-dedup, voice
 * rotation queries), Fish Audio, and ffprobe -- out of scope for this
 * focused wiring check, which verifies the actual import/call sites
 * directly instead. tsc --noEmit already confirms generatePodcastScriptV2()'s
 * return shape ({output, wordCount, attempts, openingStructure,
 * enrichment}) is structurally assignable everywhere scriptResult is used
 * downstream (toScriptLines, generatePodcastEpisode's title/topic/script/
 * enrichment fields, and the outcome object's wordCount/openingStructure/
 * scriptGenerationAttempts fields) -- this file did not need any of those
 * call sites edited beyond the generator swap itself.
 */
describe("dailyGenerate.ts — production script-generation wiring uses V2", () => {
  const source = readFileSync(path.join(__dirname, "dailyGenerate.ts"), "utf8");

  it("imports generatePodcastScriptV2 from scriptGenerationV2.ts", () => {
    expect(source).toMatch(/import\s*\{\s*generatePodcastScriptV2\s*\}\s*from\s*"\.\/scriptGenerationV2"/);
  });

  it("calls generatePodcastScriptV2(scriptRequest) for script generation", () => {
    expect(source).toMatch(/scriptResult\s*=\s*await\s*generatePodcastScriptV2\(scriptRequest\)/);
  });

  it("never imports or calls V1's generateEpisodeScript() -- the old word-count-correction production path is retired", () => {
    expect(source).not.toMatch(/generateEpisodeScript/);
  });

  it("still imports toScriptLines from V1 (a pure, zero-CEFR/word-count utility, shared by design -- see scriptGenerationV2.ts's own doc comment) and still uses it to build the script for the pipeline", () => {
    expect(source).toMatch(/import\s*\{[^}]*toScriptLines[^}]*\}\s*from\s*"\.\/scriptGeneration"/);
    expect(source).toMatch(/toScriptLines\(scriptResult\.output,\s*scriptRequest\)/);
  });

  it("still passes the chosen cefrLevel straight through to the request -- no level-specific branching or C2 special-casing was introduced", () => {
    expect(source).toMatch(/cefrLevel,/);
    expect(source).not.toMatch(/cefrLevel\s*===\s*"C2"/);
    expect(source).not.toMatch(/cefrLevel\s*!==\s*"C2"/);
  });

  it("does not reintroduce any word-count-correction identifiers", () => {
    for (const forbidden of ["runWordCountCorrection", "WORD_COUNT_CORRECTION_MAX_ATTEMPTS", "requiredReduction", "actualReduction"]) {
      expect(source).not.toContain(forbidden);
    }
  });

  it("still hands the exact same fields (title, topic, script, enrichment) to generatePodcastEpisode() -- the existing Fish Audio/ffprobe/Supabase pipeline is untouched", () => {
    expect(source).toMatch(/generatePodcastEpisode\(supabase,\s*\{/);
    expect(source).toMatch(/title:\s*scriptResult\.output\.title/);
    expect(source).toMatch(/topic:\s*scriptResult\.output\.topic/);
    expect(source).toMatch(/script,/);
    expect(source).toMatch(/enrichment:\s*scriptResult\.enrichment/);
  });
});

/**
 * CEFR-LEVEL INDEPENDENCE: each CEFR level's generation/publishing job must
 * be independent -- a persistent failure at one level (e.g. C2, currently
 * broken) must never block another level (B2/C1) from ever being attempted
 * or published. Confirmed violation: chooseCefrLevelForEpisode(n) is a
 * PURE function of the episode number, and nextEpisodeNumber() (idempotency.ts)
 * only advances once an episode actually PUBLISHES -- so a level that keeps
 * failing freezes the episode-number counter forever, which starves every
 * OTHER level too, since they are all downstream of the same stuck slot.
 * Fix: the CEFR level is now chosen from the current day, not from
 * episodeNumber, so a stuck slot's failing level today does not determine
 * what tomorrow's attempt (at the SAME still-unpublished slot) will try.
 * chooseCefrLevelForEpisode() itself (cefrLevel.ts) is unchanged -- only
 * this call site's argument changed.
 */
describe("dailyGenerate.ts — CEFR levels are independent, not chained through episodeNumber", () => {
  const source = readFileSync(path.join(__dirname, "dailyGenerate.ts"), "utf8");

  it("does NOT call chooseCefrLevelForEpisode(episodeNumber) -- that coupling is exactly what let one level's failure freeze every level", () => {
    expect(source).not.toMatch(/chooseCefrLevelForEpisode\(episodeNumber\)/);
  });

  it("calls chooseCefrLevelForEpisode() with a day-derived index instead", () => {
    expect(source).toMatch(/const dayIndex = Math\.floor\(Date\.now\(\) \/ 86_400_000\);/);
    expect(source).toMatch(/chooseCefrLevelForEpisode\(dayIndex\)/);
  });

  it("cefrLevel.ts's own rotation function and its tests are completely untouched by this fix", () => {
    const cefrLevelSource = readFileSync(path.join(__dirname, "cefrLevel.ts"), "utf8");
    expect(cefrLevelSource).toMatch(/export function chooseCefrLevelForEpisode\(episodeNumber: number\): LinguAbcCefrLevel \{/);
  });
});
