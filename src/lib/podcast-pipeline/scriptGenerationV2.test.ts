import { readFileSync } from "node:fs";
import path from "node:path";
import { vi, describe, it, expect, beforeEach } from "vitest";
import {
  generatePodcastScriptV2,
  validatePodcastScriptV2,
  buildPodcastScriptPromptV2,
  type ScriptGenerationOutput,
  type ScriptGenerationRequest,
} from "./scriptGenerationV2";
import { generateStructuredJson } from "@/ai/services/generate-structured-json";
import { generateEnrichment } from "@/lib/content-engine/ai-processing";
import type { EnrichmentResult } from "@/lib/content-engine/types";

// Same mocking pattern scriptGeneration.test.ts already uses -- no paid
// API/model calls anywhere in this file.
vi.mock("@/ai/services/generate-structured-json", () => ({
  generateStructuredJson: vi.fn(),
}));
vi.mock("@/lib/content-engine/ai-processing", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/content-engine/ai-processing")>();
  return { ...actual, generateEnrichment: vi.fn() };
});

const REQUEST_C2: ScriptGenerationRequest = {
  speaker0Name: "Sarah",
  speaker1Name: "Hannah",
  cefrLevel: "C2",
  usedTitles: [],
  usedTopicTags: [],
};
const REQUEST_C1: ScriptGenerationRequest = { ...REQUEST_C2, cefrLevel: "C1" };
const REQUEST_B2: ScriptGenerationRequest = { ...REQUEST_C2, cefrLevel: "B2" };

function countWordsV2(turns: ScriptGenerationOutput["turns"]): number {
  return turns.reduce((sum, t) => sum + t.text.replace(/\[[^\]]*\]/g, " ").split(/\s+/).filter(Boolean).length, 0);
}

/**
 * A structurally valid script at an EXACT target word count -- the same
 * fixed opening block (hook, development, both self-introductions,
 * LinguABC mention), an interruption pair, and a closing sign-off as
 * scriptGeneration.test.ts's own buildValidScriptOutput(), padded with
 * cue-rich filler turns to any requested length, then trimmed to the
 * exact word count by adding single plain words to the last turn one at a
 * time (never overshoots, since the loop stops the instant the target is
 * reached). Used to prove V2 accepts 900/965/1100/1200/1500-word scripts
 * identically -- the whole point of this task.
 */
function buildValidScriptAtWordCount(targetWords: number, cefrLevel: ScriptGenerationOutput["cefrLevel"] = "C2"): ScriptGenerationOutput {
  const fixedOpening: ScriptGenerationOutput["turns"] = [
    { speaker: 0, text: "[thoughtful] I once forgot my own name for ten seconds after waking up in a strange hotel room, and it genuinely rattled me for the rest of the morning." },
    { speaker: 1, text: "Wait, seriously? That sounds terrifying, not just strange." },
    { speaker: 0, text: "It really was. [break] Anyway, I'm Sarah." },
    { speaker: 1, text: "And I'm Hannah." },
    { speaker: 0, text: "This is LinguABC, and today we're talking about the strange ways memory can fail us even when nothing is actually wrong." },
  ];
  const closing: ScriptGenerationOutput["turns"] = [
    { speaker: 0, text: "...and honestly I think the whole point is that we—" },
    { speaker: 1, text: "—never actually finish that argument? Yeah, I've noticed." },
    { speaker: 0, text: "[reflective] Well, that gives us a lot to think about before next time." },
    { speaker: 1, text: "It really does. [warm] That has been LinguABC -- thanks for listening, and we will catch you in the next one." },
  ];
  const fillerTemplates = [
    "That is a genuinely interesting way to think about it, [curious] and honestly I had never considered it from that angle before. It also makes me wonder what else we take for granted.",
    "Right, and it is not just about memory either -- it is about how much we trust our own sense of a totally ordinary morning. [amused] People rarely question it until something breaks.",
    "I read somewhere that this happens more often to people who travel a lot, [thoughtful] which honestly makes a strange kind of sense once you think it through.",
    "Exactly, and that is the part that surprised me the most. [reflective] It is such a small moment, but it really stuck with me for weeks afterward.",
  ];

  const fixedWords = countWordsV2(fixedOpening) + countWordsV2(closing);
  const avgFillerLen = Math.max(1, Math.round(countWordsV2(fillerTemplates.map((text) => ({ speaker: 0 as const, text }))) / fillerTemplates.length));
  // floor (not ceil) so the rough construction UNDERSHOOTS the target --
  // the remaining deficit is always small enough for the flexIdx turn's
  // own word budget to absorb when trimming below.
  const fillerCount = Math.max(1, Math.floor(Math.max(0, targetWords - fixedWords) / avgFillerLen));
  const filler: ScriptGenerationOutput["turns"] = Array.from({ length: fillerCount }, (_, idx) => ({
    speaker: (idx % 2) as 0 | 1,
    text: fillerTemplates[idx % fillerTemplates.length],
  }));

  const turns = [...fixedOpening, ...filler, ...closing];
  // Adjust ONE flexible filler turn (the first one -- never the fixed
  // opening/interruption/closing turns) to hit the EXACT target, in either
  // direction: fillerCount above only gets close, never exact.
  const flexIdx = fixedOpening.length;
  const diff = targetWords - countWordsV2(turns);
  if (diff > 0) {
    turns[flexIdx] = { ...turns[flexIdx], text: `${turns[flexIdx].text} ${Array.from({ length: diff }, () => "genuinely").join(" ")}` };
  } else if (diff < 0) {
    const words = turns[flexIdx].text.replace(/\[[^\]]*\]/g, " ").split(/\s+/).filter(Boolean);
    const keep = Math.max(1, words.length + diff);
    turns[flexIdx] = { ...turns[flexIdx], text: words.slice(0, keep).join(" ") };
  }

  return { title: "Test Episode", topic: "Testing", topicTags: ["Testing"], cefrLevel, turns };
}

function fakeEnrichment(overrides: Partial<EnrichmentResult> = {}): EnrichmentResult {
  return {
    cefrLevelMin: "C2",
    cefrLevelMax: "C2",
    topics: [],
    rawTopics: [],
    summary: "A concise summary of the episode.",
    vocabulary: [{ word: "episode", phonetic: "", pos: "noun", translation: "", definition: "One part of a series.", example: "This episode covers a new topic." }],
    quiz: [{ id: "q1", type: "mc", question: "What is this content?", options: ["An episode", "A book", "A film", "A song"], correct: 0, explanation: "Defined above.", grammarTopic: null, vocabularyWord: null }],
    takeaways: ["Key takeaway."],
    reflection: "Reflect on this episode.",
    keyExpressions: [],
    discussionQuestions: [],
    listeningNotes: ["Listen for pacing."],
    grammarNotes: [],
    readingDifficulty: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe("validatePodcastScriptV2 — word count is never a rejection criterion", () => {
  it("A: a 900-word valid script passes with zero issues", () => {
    const output = buildValidScriptAtWordCount(900);
    expect(countWordsV2(output.turns)).toBe(900);
    const result = validatePodcastScriptV2(output, REQUEST_C2);
    expect(result.issues).toEqual([]);
    expect(result.wordCount).toBe(900);
  });

  it("B: a 965-word valid script passes with zero issues", () => {
    const output = buildValidScriptAtWordCount(965);
    const result = validatePodcastScriptV2(output, REQUEST_C2);
    expect(result.issues).toEqual([]);
    expect(result.wordCount).toBe(965);
  });

  it("C: a 1100-word valid script passes with zero issues", () => {
    const output = buildValidScriptAtWordCount(1100);
    const result = validatePodcastScriptV2(output, REQUEST_C2);
    expect(result.issues).toEqual([]);
    expect(result.wordCount).toBe(1100);
  });

  it("D: a 1200-word valid script passes with zero issues", () => {
    const output = buildValidScriptAtWordCount(1200);
    const result = validatePodcastScriptV2(output, REQUEST_C2);
    expect(result.issues).toEqual([]);
    expect(result.wordCount).toBe(1200);
  });

  it("E: a 1500-word valid script passes with zero issues if otherwise valid", () => {
    const output = buildValidScriptAtWordCount(1500);
    const result = validatePodcastScriptV2(output, REQUEST_C2);
    expect(result.issues).toEqual([]);
    expect(result.wordCount).toBe(1500);
  });

  it("no issue message ever mentions word count, at any length from 500 to 3000 words", () => {
    for (const target of [500, 700, 900, 965, 1100, 1200, 1500, 2000, 3000]) {
      const output = buildValidScriptAtWordCount(target);
      const result = validatePodcastScriptV2(output, REQUEST_C2);
      expect(result.issues.some((issue) => /word count/i.test(issue.message))).toBe(false);
      expect(result.wordCount).toBe(target);
    }
  });
});

describe("generatePodcastScriptV2 — F/M: no word-count correction is ever triggered, even for a long script", () => {
  it("F: a valid script passes on the FIRST attempt -- no second/correction call is ever made", async () => {
    vi.mocked(generateStructuredJson).mockResolvedValueOnce(buildValidScriptAtWordCount(950));
    vi.mocked(generateEnrichment).mockResolvedValue(fakeEnrichment());

    const result = await generatePodcastScriptV2(REQUEST_C2);

    expect(result.attempts).toBe(1);
    expect(vi.mocked(generateStructuredJson)).toHaveBeenCalledTimes(1);
  });

  it("M: a valid 1500-word script is returned exactly as generated -- never shortened to satisfy an artificial word limit", async () => {
    const longScript = buildValidScriptAtWordCount(1500);
    vi.mocked(generateStructuredJson).mockResolvedValueOnce(longScript);
    vi.mocked(generateEnrichment).mockResolvedValue(fakeEnrichment());

    const result = await generatePodcastScriptV2(REQUEST_C2);

    expect(result.wordCount).toBe(1500);
    expect(result.output.turns).toEqual(longScript.turns);
    expect(result.attempts).toBe(1);
    // Exactly one model call -- no correction/second call of any kind was
    // ever made, so the script was never touched after generation.
    expect(vi.mocked(generateStructuredJson)).toHaveBeenCalledTimes(1);
    const onlyCall = vi.mocked(generateStructuredJson).mock.calls[0][0];
    expect(onlyCall.messages).toHaveLength(1); // single-message initial generation, not a revision conversation
  });

  it("a 1200-word script that fails ONLY for a real structural reason (missing interruption) is revised WITHOUT ever being shortened", async () => {
    const longNoInterruption = buildValidScriptAtWordCount(1200);
    // Remove the interruption pair (replace the dash-linked turns with
    // plain ones) -- the only broken thing about this otherwise-valid,
    // deliberately long script.
    const brokenTurns = longNoInterruption.turns.map((t) =>
      /—$/.test(t.text.trim()) || /^—/.test(t.text.trim()) ? { ...t, text: t.text.replace(/—/g, "") } : t,
    );
    const broken: ScriptGenerationOutput = { ...longNoInterruption, turns: brokenTurns };
    expect(validatePodcastScriptV2(broken, REQUEST_C2).issues.some((i) => /no genuine interruption found/i.test(i.message))).toBe(true);

    const fixed = buildValidScriptAtWordCount(1200); // the SAME length, interruption intact
    vi.mocked(generateStructuredJson).mockResolvedValueOnce(broken).mockResolvedValueOnce(fixed);
    vi.mocked(generateEnrichment).mockResolvedValue(fakeEnrichment());

    const result = await generatePodcastScriptV2(REQUEST_C2);

    expect(result.wordCount).toBe(1200); // unchanged by the revision
    const revisionPrompt = vi.mocked(generateStructuredJson).mock.calls[1][0].messages[2].content as string;
    expect(revisionPrompt).toMatch(/no word-count target of any kind/i);
    // No instruction TELLING the model to shorten anything -- the only
    // occurrence of "shorten" is this module's own reassurance that it
    // must NOT shorten, which is exactly what we want present.
    expect(revisionPrompt).toMatch(/do NOT shorten or lengthen/i);
    expect(revisionPrompt).not.toMatch(/cut approximately|reduce word count|target \d+ words/i);
  });
});

describe("generatePodcastScriptV2 — G: no word-count retry state exists in this module", () => {
  it("the V2 source file contains none of V1's word-count-correction identifiers", () => {
    const source = readFileSync(path.join(__dirname, "scriptGenerationV2.ts"), "utf8");
    const forbidden = [
      "runWordCountCorrection",
      "buildWordCountCorrectionMessage",
      "selectLargeCutTarget",
      "buildFinalBoundaryCorrectionInstruction",
      "classifyCorrectionCutMagnitude",
      "requiredReduction",
      "actualReduction",
      "overshoot",
      "previousAttemptWasNoOp",
      "previousAttemptWasInsufficient",
      "carriedNoOp",
      "carriedInsufficient",
      "cefrRecoveryPending",
      "WORD_COUNT_CORRECTION_MAX_ATTEMPTS",
      "NEAR_CEILING",
      "WORD_COUNT_TARGET_MIN",
      "WORD_COUNT_TARGET_MAX",
      "WORD_COUNT_HARD_MAX",
      "WORD_COUNT_HARD_MIN",
      "InsufficientProgressContext",
      "small/meaningful/large",
    ];
    for (const token of forbidden) {
      expect(source).not.toContain(token);
    }
  });

  it("the V2 generation prompt contains no hard word-count target language", () => {
    const prompt = buildPodcastScriptPromptV2(REQUEST_C2);
    expect(prompt).not.toMatch(/920[\s-]*(?:to|-)\s*965/i);
    expect(prompt).not.toMatch(/935[\s-]*(?:to|-)\s*950/i);
    expect(prompt).not.toMatch(/must be under \d+ words/i);
    expect(prompt).not.toMatch(/target \d+ words/i);
    expect(prompt).not.toMatch(/cut \d+/i);
    expect(prompt).not.toMatch(/reduce word count/i);
    expect(prompt).not.toMatch(/overshoot/i);
    expect(prompt).toMatch(/NO target word count/i);
  });
});

describe("generatePodcastScriptV2 — Phase 5: requested CEFR is a hard requirement, never weakened", () => {
  it("H: a C2 request with an authoritative B2 grade fails", async () => {
    vi.mocked(generateStructuredJson).mockResolvedValue(buildValidScriptAtWordCount(950, "C2"));
    vi.mocked(generateEnrichment).mockResolvedValue(fakeEnrichment({ cefrLevelMin: "B2", cefrLevelMax: "C1" }));

    let thrown: Error | undefined;
    try {
      await generatePodcastScriptV2(REQUEST_C2);
    } catch (error) {
      thrown = error as Error;
    }
    expect(thrown).toBeDefined();
    expect(thrown!.message).toMatch(/below the requested CEFR C2/);
  });

  it("a C2 request with an authoritative C1 grade also fails (C1 is still below C2)", async () => {
    vi.mocked(generateStructuredJson).mockResolvedValue(buildValidScriptAtWordCount(950, "C2"));
    vi.mocked(generateEnrichment).mockResolvedValue(fakeEnrichment({ cefrLevelMin: "C1", cefrLevelMax: "C1" }));

    let thrown: Error | undefined;
    try {
      await generatePodcastScriptV2(REQUEST_C2);
    } catch (error) {
      thrown = error as Error;
    }
    expect(thrown).toBeDefined();
    expect(thrown!.message).toMatch(/below the requested CEFR C2/);
  });

  it("a C2 request with an authoritative B1 grade fails via the approved-level check", async () => {
    vi.mocked(generateStructuredJson).mockResolvedValue(buildValidScriptAtWordCount(950, "C2"));
    vi.mocked(generateEnrichment).mockResolvedValue(fakeEnrichment({ cefrLevelMin: "B1", cefrLevelMax: "B2" }));

    let thrown: Error | undefined;
    try {
      await generatePodcastScriptV2(REQUEST_C2);
    } catch (error) {
      thrown = error as Error;
    }
    expect(thrown).toBeDefined();
    expect(thrown!.message).toMatch(/must grade as B2, C1, or C2/);
  });

  it("I: a C2 request with a genuine authoritative C2 grade passes", async () => {
    vi.mocked(generateStructuredJson).mockResolvedValueOnce(buildValidScriptAtWordCount(950, "C2"));
    vi.mocked(generateEnrichment).mockResolvedValue(fakeEnrichment({ cefrLevelMin: "C2", cefrLevelMax: "C2" }));

    const result = await generatePodcastScriptV2(REQUEST_C2);

    expect(result.enrichment.cefrLevelMin).toBe("C2");
  });

  it("a C1 request: B1/B2 fail, C1 and C2 both pass -- existing intended semantics", async () => {
    vi.mocked(generateStructuredJson).mockResolvedValue(buildValidScriptAtWordCount(950, "C1"));
    vi.mocked(generateEnrichment).mockResolvedValue(fakeEnrichment({ cefrLevelMin: "B2", cefrLevelMax: "C1" }));
    let thrown: Error | undefined;
    try {
      await generatePodcastScriptV2(REQUEST_C1);
    } catch (error) {
      thrown = error as Error;
    }
    expect(thrown).toBeDefined();
    expect(thrown!.message).toMatch(/below the requested CEFR C1/);

    vi.resetAllMocks();
    vi.mocked(generateStructuredJson).mockResolvedValueOnce(buildValidScriptAtWordCount(950, "C1"));
    vi.mocked(generateEnrichment).mockResolvedValue(fakeEnrichment({ cefrLevelMin: "C1", cefrLevelMax: "C1" }));
    const passC1 = await generatePodcastScriptV2(REQUEST_C1);
    expect(passC1.enrichment.cefrLevelMin).toBe("C1");

    vi.resetAllMocks();
    vi.mocked(generateStructuredJson).mockResolvedValueOnce(buildValidScriptAtWordCount(950, "C1"));
    vi.mocked(generateEnrichment).mockResolvedValue(fakeEnrichment({ cefrLevelMin: "C2", cefrLevelMax: "C2" }));
    const passC2 = await generatePodcastScriptV2(REQUEST_C1);
    expect(passC2.enrichment.cefrLevelMin).toBe("C2");
  });

  it("a B2 request: B2, C1, and C2 grades all pass -- existing intended semantics", async () => {
    for (const grade of ["B2", "C1", "C2"] as const) {
      vi.resetAllMocks();
      vi.mocked(generateStructuredJson).mockResolvedValueOnce(buildValidScriptAtWordCount(950, "B2"));
      vi.mocked(generateEnrichment).mockResolvedValue(fakeEnrichment({ cefrLevelMin: grade, cefrLevelMax: grade }));
      const result = await generatePodcastScriptV2(REQUEST_B2);
      expect(result.enrichment.cefrLevelMin).toBe(grade);
    }
  });
});

describe("generatePodcastScriptV2 — Phase 4/6: real structural validation is preserved and targeted", () => {
  it("J: a script missing the mandatory interruption pattern fails validation", () => {
    const output = buildValidScriptAtWordCount(950);
    const brokenTurns = output.turns.map((t) => ({ ...t, text: t.text.replace(/—/g, "") }));
    const broken: ScriptGenerationOutput = { ...output, turns: brokenTurns };

    const result = validatePodcastScriptV2(broken, REQUEST_C2);

    expect(result.issues.some((i) => /no genuine interruption found/i.test(i.message))).toBe(true);
  });

  it("J2: a LinguABC mention that only appears very late in the script fails the required-position check", () => {
    const output = buildValidScriptAtWordCount(950);
    const turns = output.turns.map((t) => (t.text.toLowerCase().includes("linguabc") ? { ...t, text: "This is our show, and today we're talking about memory." } : t));
    const lastIdx = turns.length - 1;
    turns[lastIdx] = { ...turns[lastIdx], text: `${turns[lastIdx].text} By the way, this has been LinguABC.` };
    const broken: ScriptGenerationOutput = { ...output, turns };

    const result = validatePodcastScriptV2(broken, REQUEST_C2);

    expect(result.issues.some((i) => /LinguABC/i.test(i.message))).toBe(true);
  });

  it("K: a script with no prosody cues anywhere fails validation", () => {
    const output = buildValidScriptAtWordCount(950);
    const turns = output.turns.map((t) => ({ ...t, text: t.text.replace(/\[[^\]]*\]\s*/g, "") }));
    const broken: ScriptGenerationOutput = { ...output, turns };

    const result = validatePodcastScriptV2(broken, REQUEST_C2);

    expect(result.issues.some((i) => /Prosody density/i.test(i.message))).toBe(true);
  });

  it("L: targeted revision for a PURE prosody failure sends prosody-specific guidance and nothing else", async () => {
    const output = buildValidScriptAtWordCount(950);
    const noProsody: ScriptGenerationOutput = { ...output, turns: output.turns.map((t) => ({ ...t, text: t.text.replace(/\[[^\]]*\]\s*/g, "") })) };
    expect(validatePodcastScriptV2(noProsody, REQUEST_C2).issues).toHaveLength(1); // prosody-only

    vi.mocked(generateStructuredJson).mockResolvedValueOnce(noProsody).mockResolvedValueOnce(buildValidScriptAtWordCount(950));
    vi.mocked(generateEnrichment).mockResolvedValue(fakeEnrichment());

    await generatePodcastScriptV2(REQUEST_C2);

    const revisionPrompt = vi.mocked(generateStructuredJson).mock.calls[1][0].messages[2].content as string;
    expect(revisionPrompt).toMatch(/Prosody density .*100 words is far below/i);
    expect(revisionPrompt).toMatch(/Add natural bracket prosody cues/i);
    // Nothing about any OTHER category leaked into a single-issue revision.
    expect(revisionPrompt).not.toMatch(/genuine interruption is still missing/i);
    expect(revisionPrompt).not.toMatch(/opening block is still wrong/i);
    expect(revisionPrompt).not.toMatch(/For the CEFR level specifically/i);
    expect(revisionPrompt).not.toMatch(/Markdown emphasis markers/i);
  });

  it("L2: targeted revision for a PURE CEFR mismatch uses the dedicated CEFR-only preamble, not the generic one", async () => {
    vi.mocked(generateStructuredJson)
      .mockResolvedValueOnce(buildValidScriptAtWordCount(950, "C2"))
      .mockResolvedValueOnce(buildValidScriptAtWordCount(950, "C2"));
    vi.mocked(generateEnrichment)
      .mockResolvedValueOnce(fakeEnrichment({ cefrLevelMin: "B2", cefrLevelMax: "C1" }))
      .mockResolvedValueOnce(fakeEnrichment({ cefrLevelMin: "C2", cefrLevelMax: "C2" }));

    await generatePodcastScriptV2(REQUEST_C2);

    const revisionPrompt = vi.mocked(generateStructuredJson).mock.calls[1][0].messages[2].content as string;
    // The dedicated CEFR-only preamble is used, never the generic one.
    expect(revisionPrompt).toMatch(/Your ONLY job this time is to raise its CEFR sophistication/i);
    expect(revisionPrompt).not.toMatch(/smallest possible targeted edits/i);
    // The generic "Raise vocabulary sophistication..." guidance paragraph
    // is suppressed for a PURE mismatch (it would otherwise directly
    // contradict the dedicated preamble's "preserve ... exactly as they
    // already are") -- it fires only when CEFR is combined with another
    // issue, which this scenario deliberately is not.
    expect(revisionPrompt).not.toMatch(/Raise vocabulary sophistication, use real conditional/i);
  });

  it("scriptGenerationV2.ts's only import FROM scriptGeneration.ts (V1) is the one line naming checkOpeningStructure/toScriptLines/shared request-response types -- never generateEpisodeScript or any word-count export", () => {
    const v2Source = readFileSync(path.join(__dirname, "scriptGenerationV2.ts"), "utf8");
    const v1ImportLine = v2Source.split("\n").find((line) => line.includes('from "./scriptGeneration"'));
    expect(v1ImportLine).toBeDefined();
    expect(v1ImportLine).toContain("checkOpeningStructure");
    expect(v1ImportLine).toContain("toScriptLines");
    expect(v1ImportLine).toContain("ScriptGenerationRequest");
    expect(v1ImportLine).toContain("ScriptGenerationOutput");
    expect(v1ImportLine).toContain("OpeningStructureCheck");
    expect(v1ImportLine).not.toContain("generateEpisodeScript");
    // Exactly one import statement reaches into V1 at all.
    expect(v2Source.split("\n").filter((line) => line.includes('from "./scriptGeneration"'))).toHaveLength(1);
  });
});
