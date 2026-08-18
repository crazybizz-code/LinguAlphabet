import { vi, describe, it, expect, beforeEach } from "vitest";
import {
  validateGeneratedScript,
  buildRetryFeedback,
  buildPrompt,
  buildRevisionPreamble,
  generateEpisodeScript,
  checkOpeningStructure,
  type ScriptGenerationOutput,
  type ScriptGenerationRequest,
} from "./scriptGeneration";
import { generateStructuredJson } from "@/ai/services/generate-structured-json";
import { generateEnrichment } from "@/lib/content-engine/ai-processing";
import type { EnrichmentResult } from "@/lib/content-engine/types";

// Same mocking pattern src/lib/content-engine/pipeline.test.ts already uses
// for generateEnrichment -- preserve every other real export via
// importOriginal, replace only the one function under test's control.
vi.mock("@/ai/services/generate-structured-json", () => ({
  generateStructuredJson: vi.fn(),
}));
vi.mock("@/lib/content-engine/ai-processing", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/content-engine/ai-processing")>();
  return { ...actual, generateEnrichment: vi.fn() };
});

/**
 * Security-audit regression tests (LOW findings #7/#8) for the two new
 * validateGeneratedScript() checks: unclosed/unmatched prosody brackets,
 * and a bare cue word leaking as literal dialogue where a bracket was
 * forgotten. Deliberately test each check in isolation via
 * issues.some(...) rather than building a script that passes every other
 * rule too -- validateGeneratedScript returns every issue it finds, and
 * the only thing under test here is whether THIS check fires.
 */

const REQUEST: ScriptGenerationRequest = {
  speaker0Name: "Sarah",
  speaker1Name: "Hannah",
  cefrLevel: "B2",
  usedTitles: [],
  usedTopicTags: [],
};

function output(turns: ScriptGenerationOutput["turns"]): ScriptGenerationOutput {
  return { title: "Test Episode", topic: "Testing", topicTags: ["Testing"], cefrLevel: "B2", turns };
}

const bracketIssue = (issues: { message: string }[]) => issues.some((i) => /bracket/i.test(i.message));
const leakedCueIssue = (issues: { message: string }[]) => issues.some((i) => /forgotten-bracket/i.test(i.message));

describe("validateGeneratedScript — CEFR level targeting", () => {
  it("flags a mismatch between the requested level and the model's self-reported level", () => {
    const issues = validateGeneratedScript({ ...output([{ speaker: 0, text: "Fine." }]), cefrLevel: "C1" }, REQUEST);
    expect(issues.some((i) => /Requested CEFR level B2/.test(i.message))).toBe(true);
  });

  it("does not flag a matching level", () => {
    const issues = validateGeneratedScript(output([{ speaker: 0, text: "Fine." }]), REQUEST);
    expect(issues.some((i) => /Requested CEFR level/.test(i.message))).toBe(false);
  });

  it("is checked for C1 and C2 requests too, not just B2", () => {
    const c1Request = { ...REQUEST, cefrLevel: "C1" as const };
    const issues = validateGeneratedScript({ ...output([{ speaker: 0, text: "Fine." }]), cefrLevel: "C2" }, c1Request);
    expect(issues.some((i) => /Requested CEFR level C1/.test(i.message))).toBe(true);
  });
});

describe("validateGeneratedScript — unclosed/unmatched prosody brackets", () => {
  it("flags a turn with an unclosed opening bracket", () => {
    const issues = validateGeneratedScript(output([{ speaker: 0, text: "[emphasis this never closes and keeps going" }]), REQUEST);
    expect(bracketIssue(issues)).toBe(true);
  });

  it("flags a turn with a stray unmatched closing bracket", () => {
    const issues = validateGeneratedScript(output([{ speaker: 0, text: "that was odd] don't you think" }]), REQUEST);
    expect(bracketIssue(issues)).toBe(true);
  });

  it("does not flag well-formed, balanced bracket pairs", () => {
    const issues = validateGeneratedScript(
      output([{ speaker: 0, text: "[emphasis] I really thought it would work, [thoughtful] but it didn't." }]),
      REQUEST,
    );
    expect(bracketIssue(issues)).toBe(false);
  });

  it("does not flag plain dialogue with no brackets at all", () => {
    const issues = validateGeneratedScript(output([{ speaker: 0, text: "That's a completely normal sentence." }]), REQUEST);
    expect(bracketIssue(issues)).toBe(false);
  });
});

describe("validateGeneratedScript — bare cue word leaking as spoken dialogue", () => {
  it("flags a turn starting with a bare cue word followed by a comma", () => {
    const issues = validateGeneratedScript(output([{ speaker: 0, text: "Emphasis, I really think that's true." }]), REQUEST);
    expect(leakedCueIssue(issues)).toBe(true);
  });

  it("flags a bare 'break' opener followed by a period", () => {
    const issues = validateGeneratedScript(output([{ speaker: 1, text: "Break. Let's pick this up after." }]), REQUEST);
    expect(leakedCueIssue(issues)).toBe(true);
  });

  it("does not flag a properly bracketed cue at the start of a turn", () => {
    const issues = validateGeneratedScript(output([{ speaker: 0, text: "[break] Let's continue from where we left off." }]), REQUEST);
    expect(leakedCueIssue(issues)).toBe(false);
  });

  it("does not flag a cue word used naturally mid-sentence", () => {
    const issues = validateGeneratedScript(
      output([{ speaker: 0, text: "I think we should take a quick break before the next part." }]),
      REQUEST,
    );
    expect(leakedCueIssue(issues)).toBe(false);
  });

  it("does not flag ordinary dialogue that starts with an unrelated word", () => {
    const issues = validateGeneratedScript(output([{ speaker: 0, text: "Honestly, I never thought about it that way." }]), REQUEST);
    expect(leakedCueIssue(issues)).toBe(false);
  });
});

/**
 * Direct unit coverage for checkOpeningStructure() -- previously zero,
 * despite this being the exact function built to catch the Episode #004
 * defect (introductions/LinguABC mention landing at the very end instead
 * of the opening) and despite it being implicated again in the real
 * SCRIPT_GENERATION failure this fix addresses (Ben 98.7%, Hannah 96.8%,
 * LinguABC 96.8%, intro block only in the final 20%). Each check is
 * exercised in isolation, matching this file's own established pattern
 * (see the top-of-file doc comment) rather than requiring one fixture to
 * pass or fail every rule at once.
 */
describe("checkOpeningStructure — direct unit coverage", () => {
  const REQUEST_BEN_HANNAH: ScriptGenerationRequest = {
    speaker0Name: "Ben",
    speaker1Name: "Hannah",
    cefrLevel: "B2",
    usedTitles: [],
    usedTopicTags: [],
  };

  function output(turns: ScriptGenerationOutput["turns"]): ScriptGenerationOutput {
    return { title: "Test Episode", topic: "Testing", topicTags: ["Testing"], cefrLevel: "B2", turns };
  }

  function fillerTurns(count: number, label: string): ScriptGenerationOutput["turns"] {
    const turns: ScriptGenerationOutput["turns"] = [];
    for (let i = 0; i < count; i++) {
      turns.push({ speaker: (i % 2) as 0 | 1, text: `This is ${label} filler turn number ${i} with enough words in it to matter for the percentage math in this test.` });
    }
    return turns;
  }

  function validOpeningTurns(): ScriptGenerationOutput["turns"] {
    return [
      { speaker: 0, text: "I once locked myself out of my own apartment wearing only socks, in the middle of January." },
      { speaker: 1, text: "Wait, that is awful. What did you even do?" },
      { speaker: 0, text: "It was a whole thing. Anyway, I'm Ben." },
      { speaker: 1, text: "And I'm Hannah." },
      { speaker: 0, text: "This is LinguABC, and today we are talking about small emergencies that teach you something." },
      ...fillerTurns(16, "body"),
    ];
  }

  it("passes a script with a real hook, early introductions, and an early LinguABC mention", () => {
    const result = checkOpeningStructure(output(validOpeningTurns()), REQUEST_BEN_HANNAH);
    expect(result.passed).toBe(true);
    expect(result.issues).toEqual([]);
  });

  it("flags a first turn that reads like a generic greeting instead of a real hook", () => {
    const turns = validOpeningTurns();
    turns[0] = { speaker: 0, text: "Hello everyone, welcome back to the show." };
    const result = checkOpeningStructure(output(turns), REQUEST_BEN_HANNAH);
    expect(result.hookPresent).toBe(false);
    expect(result.passed).toBe(false);
    expect(result.issues.some((i) => /generic greeting\/announcement instead of a real hook/i.test(i))).toBe(true);
  });

  it("flags missing introductions when neither speaker ever says \"I'm <name>\"", () => {
    const turns = validOpeningTurns();
    turns[2] = { speaker: 0, text: "It was a whole thing, honestly." };
    turns[3] = { speaker: 1, text: "Sounds like quite a morning." };
    const result = checkOpeningStructure(output(turns), REQUEST_BEN_HANNAH);
    expect(result.introductionBlockPresent).toBe(false);
    expect(result.passed).toBe(false);
    expect(result.issues.some((i) => /Missing one or both .*self-introductions entirely/i.test(i))).toBe(true);
  });

  it("flags Ben's introduction landing too late, close to the real 98.7% failure", () => {
    const turns: ScriptGenerationOutput["turns"] = [
      { speaker: 0, text: "I once locked myself out of my own apartment wearing only socks, in the middle of January." },
      ...fillerTurns(30, "topic"),
      { speaker: 0, text: "Anyway, before we go, I'm Ben." },
      { speaker: 1, text: "And I'm Hannah. This is LinguABC, thanks so much for listening today." },
    ];
    const result = checkOpeningStructure(output(turns), REQUEST_BEN_HANNAH);
    expect(result.firstIntroPositionValid).toBe(false);
    expect(result.passed).toBe(false);
    expect(result.issues.some((i) => /Ben's introduction occurs at [\d.]+% through the script -- must be within the first 25%/.test(i))).toBe(true);
  });

  it("flags Hannah's introduction landing too far from Ben's", () => {
    const turns: ScriptGenerationOutput["turns"] = [
      { speaker: 0, text: "I once locked myself out of my own apartment wearing only socks, in the middle of January." },
      { speaker: 1, text: "Wait, that is awful. What did you even do?" },
      { speaker: 0, text: "It was a whole thing. Anyway, I'm Ben." },
      ...fillerTurns(10, "topic"),
      { speaker: 1, text: "Oh, sorry, I never actually said -- I'm Hannah." },
      { speaker: 0, text: "This is LinguABC, let's get into it." },
      ...fillerTurns(10, "more"),
    ];
    const result = checkOpeningStructure(output(turns), REQUEST_BEN_HANNAH);
    expect(result.secondIntroPositionValid).toBe(false);
    expect(result.passed).toBe(false);
    expect(result.issues.some((i) => /Hannah's introduction occurs at [\d.]+% through the script or too far from Ben's/.test(i))).toBe(true);
  });

  it("flags a LinguABC mention landing too late even when both introductions are early", () => {
    const turns: ScriptGenerationOutput["turns"] = [
      { speaker: 0, text: "I once locked myself out of my own apartment wearing only socks, in the middle of January." },
      { speaker: 1, text: "Wait, that is awful. What did you even do?" },
      { speaker: 0, text: "It was a whole thing. Anyway, I'm Ben." },
      { speaker: 1, text: "And I'm Hannah, great to be here today." },
      ...fillerTurns(20, "topic"),
      { speaker: 0, text: "Well, that has been LinguABC for today, thanks so much for listening." },
    ];
    const result = checkOpeningStructure(output(turns), REQUEST_BEN_HANNAH);
    expect(result.linguabcPositionValid).toBe(false);
    expect(result.passed).toBe(false);
    expect(result.issues.some((i) => /LinguABC identity occurs at [\d.]+% through the script/.test(i))).toBe(true);
    // Both introductions were early -- this is an isolated LinguABC-only failure.
    expect(result.firstIntroPositionValid).toBe(true);
    expect(result.secondIntroPositionValid).toBe(true);
  });

  it("flags the introduction block found only in the final portion of the script -- the Episode #004 defect", () => {
    const turns: ScriptGenerationOutput["turns"] = [
      { speaker: 0, text: "I once locked myself out of my own apartment wearing only socks, in the middle of January." },
      ...fillerTurns(30, "topic"),
      { speaker: 0, text: "Anyway, before we go, I'm Ben." },
      { speaker: 1, text: "And I'm Hannah. This is LinguABC, thanks so much for listening today." },
    ];
    const result = checkOpeningStructure(output(turns), REQUEST_BEN_HANNAH);
    expect(result.introductionBlockNotAtEnding).toBe(false);
    expect(result.passed).toBe(false);
    expect(result.issues.some((i) => /Introduction block found only in the final \d+% of the script \(the sign-off\)/.test(i))).toBe(true);
  });
});

/**
 * Regression coverage for the bug this fix addresses: generateEpisodeScript()
 * used to retry every failed attempt with the IDENTICAL prompt, giving the
 * model no signal about what to fix. buildRetryFeedback() is the pure
 * function that turns a rejected attempt's issues into the corrective text
 * appended to the next attempt's prompt -- tested directly, the same way
 * validateGeneratedScript() is tested above, since it needs no LLM call.
 */
describe("buildRetryFeedback — corrective feedback for the next attempt", () => {
  it("lists every issue message from the previous attempt", () => {
    const feedback = buildRetryFeedback([{ message: "Turn count 4 looks implausible for a natural episode." }, { message: "No genuine interruption found." }]);
    expect(feedback).toContain("Turn count 4 looks implausible for a natural episode.");
    expect(feedback).toContain("No genuine interruption found.");
  });

  it("tells the model to rewrite and fix all listed issues", () => {
    const feedback = buildRetryFeedback([{ message: "Some issue." }]);
    expect(feedback).toMatch(/rewrite the script and fix all listed issues/i);
  });

  it("does not add word-count-specific guidance when there is no word-count issue", () => {
    const feedback = buildRetryFeedback([{ message: "No genuine interruption found." }]);
    expect(feedback).not.toMatch(/935-950/);
  });

  /**
   * Regression coverage for the real GitHub Actions failure this fix
   * addresses: a script landed at 833 words (well under the 920 floor) and
   * kept failing across all 6 attempts because the retry feedback only
   * ever restated an abstract "target ~935-950" -- never told the model
   * concretely how far off 833 actually was. buildWordCountGuidance() now
   * parses the real previous count out of validateGeneratedScript's own
   * message and computes a real add-this-many-words range against the
   * 935-950 sub-target (960-975 before the hard ceiling was recalibrated
   * from 990 to 965 -- see validateGeneratedScript's own doc comment).
   */
  describe("word-count guidance — concrete deficit computed from the real previous count", () => {
    it("computes an add-range of 102-117 words for a real 833-word failure", () => {
      const feedback = buildRetryFeedback([
        { message: "Word count 833 is outside the acceptable 920-965 range (calibrated to land inside the pipeline's 300-360s audio-duration gate with real margin, including at the slowest real Fish Audio rates observed)." },
      ]);
      expect(feedback).toContain("Word count 833 is outside the acceptable 920-965 range");
      expect(feedback).toContain("Previous draft: 833 words. Required: 920-965.");
      expect(feedback).toMatch(/add approximately 102-117 spoken words/i);
      expect(feedback).toMatch(/target 935-950 words total/i);
    });

    it("computes a different add-range for a different undershoot amount (856 words)", () => {
      const feedback = buildRetryFeedback([{ message: "Word count 856 is outside the acceptable 920-965 range." }]);
      expect(feedback).toContain("Previous draft: 856 words. Required: 920-965.");
      expect(feedback).toMatch(/add approximately 79-94 spoken words/i);
    });

    it("tells the model to cut words, not add, for an overshoot above 965", () => {
      const feedback = buildRetryFeedback([{ message: "Word count 1005 is outside the acceptable 920-965 range." }]);
      expect(feedback).toContain("Previous draft: 1005 words. Required: 920-965, hard maximum 965");
      // 1005 is only 40 words over the 965 ceiling -- a near miss (see the
      // dedicated "near-ceiling overshoot" describe block below), so it
      // gets the smaller, ceiling-anchored cut rather than the full
      // 935-950 treatment a large overshoot gets.
      expect(feedback).toMatch(/cut approximately 45-50 spoken words/i);
      expect(feedback).not.toMatch(/add approximately/i);
    });

    it("falls back to the abstract target when the previous count can't be parsed out of the message", () => {
      const feedback = buildRetryFeedback([{ message: "Word count is outside the acceptable range somehow." }]);
      expect(feedback).toMatch(/target approximately 935-950 spoken words/i);
    });
  });

  it("combines a word-count issue with other issues in the same feedback block", () => {
    const feedback = buildRetryFeedback([
      { message: "Word count 833 is outside the acceptable 920-965 range." },
      { message: "Only 3/20 turns have 2+ sentences -- looks like sentence-by-sentence alternation, not natural turns." },
    ]);
    expect(feedback).toContain("Word count 833 is outside the acceptable 920-965 range.");
    expect(feedback).toContain("Only 3/20 turns have 2+ sentences");
    expect(feedback).toMatch(/add approximately 102-117 spoken words/i);
  });

  it("gives concrete corrective guidance specifically for a CEFR-level failure", () => {
    const feedback = buildRetryFeedback([
      { message: "Authoritative enrichment graded this script as cefrLevelMin=B1, cefrLevelMax=B2 -- LinguABC AI-generated podcasts must grade as B2, C1, or C2." },
    ]);
    expect(feedback).toContain("Authoritative enrichment graded this script as cefrLevelMin=B1");
    expect(feedback).toMatch(/independently graded BELOW the required B2\+ standard/i);
    expect(feedback).toMatch(/raise vocabulary sophistication/i);
    expect(feedback).toMatch(/conditional\/subordinate-clause sentence structures/i);
    expect(feedback).toMatch(/do not just relabel the same simple script or change the self-reported level field/i);
  });

  it("does not add CEFR-specific guidance when there is no CEFR issue", () => {
    const feedback = buildRetryFeedback([{ message: "No genuine interruption found." }]);
    expect(feedback).not.toMatch(/raise vocabulary sophistication/i);
  });

  it("gives concrete corrective guidance specifically for a markdown-emphasis failure", () => {
    const feedback = buildRetryFeedback([
      { message: "Found markdown-style emphasis markers that would be read aloud literally (use [emphasis] instead): *just*, *so close*" },
    ]);
    expect(feedback).toContain("Found markdown-style emphasis markers");
    expect(feedback).toMatch(/remove all markdown emphasis markers/i);
    expect(feedback).toMatch(/\[emphasis\] bracket cue placed directly before the word or phrase/i);
  });

  it("does not add markdown-specific guidance when there is no markdown issue", () => {
    const feedback = buildRetryFeedback([{ message: "No genuine interruption found." }]);
    expect(feedback).not.toMatch(/remove all markdown emphasis markers/i);
  });

  it("combines a markdown-emphasis issue with word-count and CEFR issues in the same feedback block", () => {
    const feedback = buildRetryFeedback([
      { message: "Word count 833 is outside the acceptable 920-965 range." },
      { message: "Authoritative enrichment graded this script as cefrLevelMin=B1, cefrLevelMax=B2." },
      { message: "Found markdown-style emphasis markers that would be read aloud literally (use [emphasis] instead): *just*, *so close*" },
    ]);
    expect(feedback).toContain("Word count 833 is outside the acceptable 920-965 range.");
    expect(feedback).toContain("Authoritative enrichment graded this script as cefrLevelMin=B1");
    expect(feedback).toContain("Found markdown-style emphasis markers");
    expect(feedback).toContain("Previous draft: 833 words. Required: 920-965.");
    expect(feedback).toMatch(/add approximately 102-117 spoken words/i);
    expect(feedback).toMatch(/raise vocabulary sophistication/i);
    expect(feedback).toMatch(/remove all markdown emphasis markers/i);
  });

  /**
   * Regression coverage for the real GitHub Actions failure this fix
   * addresses: a script overshot to 1181 words (correctly computed a
   * 231-246 cut range by the existing word-count formula) but ALSO
   * failed prosody density (1.61/100, well under the ~2/100 hard floor)
   * and the interruption pattern -- and neither of those two failures got
   * any corrective push beyond the generic bullet list, so the model kept
   * fixing length alone across all 6 attempts. buildProsodyGuidance() and
   * buildInterruptionGuidance() close that gap; this section covers each
   * in isolation and combined, matching the exact real failure.
   */
  describe("prosody and interruption guidance — the constraint-convergence fix", () => {
    it("computes the exact 231-246 cut range for the real 1181-word overshoot", () => {
      const feedback = buildRetryFeedback([{ message: "Word count 1181 is outside the acceptable 920-965 range." }]);
      expect(feedback).toContain("Previous draft: 1181 words. Required: 920-965, hard maximum 965");
      expect(feedback).toMatch(/cut approximately 231-246 spoken words/i);
    });

    it("states the real measured density and the 4-6 target for a low-prosody failure", () => {
      const feedback = buildRetryFeedback([
        { message: "Prosody density 1.61/100 words is far below the ~4-6 target -- prosody rules were not followed." },
      ]);
      expect(feedback).toContain("Current prosody density: 1.61/100 words. Required: approximately 4-6/100 words.");
      expect(feedback).toMatch(/spread THROUGHOUT the entire dialogue/i);
      expect(feedback).toMatch(/not clustered in only a few turns/i);
    });

    it("does not add prosody-specific guidance when there is no prosody issue", () => {
      const feedback = buildRetryFeedback([{ message: "No genuine interruption found." }]);
      expect(feedback).not.toMatch(/Current prosody density/i);
    });

    it("adds mid-sentence placement guidance for the turn-initial-only prosody issue", () => {
      const feedback = buildRetryFeedback([{ message: "No prosody cues are placed mid-sentence -- every cue is turn-initial." }]);
      expect(feedback).toMatch(/cues must sit INSIDE a turn, mid-sentence/i);
    });

    it("gives the exact required two-turn dash pattern for a missing-interruption failure", () => {
      const feedback = buildRetryFeedback([
        {
          message:
            "No genuine interruption found -- need one turn ending with a dash immediately followed by the next turn starting with a dash (e.g. Speaker 0: '...we—' / Speaker 1: '—never finish that?').",
        },
      ]);
      expect(feedback).toMatch(/structurally REQUIRED/i);
      expect(feedback).toMatch(/one speaker's turn ends mid-sentence with an em dash/i);
      expect(feedback).toMatch(/does NOT satisfy this rule/i);
      expect(feedback).toContain('Speaker 0: "...and honestly I think the whole point is that we—"');
    });

    it("does not add interruption-specific guidance when there is no interruption issue", () => {
      const feedback = buildRetryFeedback([{ message: "Word count 833 is outside the acceptable 920-965 range." }]);
      expect(feedback).not.toMatch(/structurally REQUIRED/i);
    });

    it("combines word-count overshoot, low prosody density, and missing interruption in ONE coherent block, none dropped", () => {
      const feedback = buildRetryFeedback([
        { message: "Word count 1181 is outside the acceptable 920-965 range." },
        { message: "Prosody density 1.61/100 words is far below the ~4-6 target -- prosody rules were not followed." },
        {
          message:
            "No genuine interruption found -- need one turn ending with a dash immediately followed by the next turn starting with a dash (e.g. Speaker 0: '...we—' / Speaker 1: '—never finish that?').",
        },
      ]);
      // All three original issue bullets present.
      expect(feedback).toContain("Word count 1181 is outside the acceptable 920-965 range.");
      expect(feedback).toContain("Prosody density 1.61/100 words is far below the ~4-6 target");
      expect(feedback).toContain("No genuine interruption found");
      // All three corrective instructions present -- fixing one must not crowd out the others.
      expect(feedback).toMatch(/cut approximately 231-246 spoken words/i);
      expect(feedback).toContain("Current prosody density: 1.61/100 words. Required: approximately 4-6/100 words.");
      expect(feedback).toMatch(/structurally REQUIRED/i);
      // The explicit "fix all together" framing fires because 3 corrections are active at once.
      expect(feedback).toMatch(/must ALL be fixed together in the SAME rewrite/i);
    });

    it("does not add the combined-fix framing sentence when only one correction is active", () => {
      const feedback = buildRetryFeedback([{ message: "Word count 1181 is outside the acceptable 920-965 range." }]);
      expect(feedback).not.toMatch(/must ALL be fixed together/i);
    });
  });

  /**
   * Regression coverage for the real GitHub Actions failure this fix
   * addresses: buildRetryFeedback() had dedicated guidance for word
   * count, CEFR, markdown, prosody, and interruption, but NONE for any
   * checkOpeningStructure() failure -- despite that being the exact
   * function built to catch the Episode #004 defect. A real run failed
   * 6/6 attempts with introductions and the LinguABC mention at
   * 96.8-98.7% through the script, restated unchanged in the generic
   * bullet list every retry, never reinforced. buildOpeningStructureGuidance()
   * closes that gap, tested here the same way prosody/interruption are
   * tested above (through the exported buildRetryFeedback(), since the
   * builder itself is intentionally unexported, matching precedent).
   */
  describe("opening-structure guidance — the missing category this fix adds", () => {
    it("gives the concrete percentage and required order for a late Ben introduction", () => {
      const feedback = buildRetryFeedback([{ message: "Ben's introduction occurs at 98.7% through the script -- must be within the first 25%." }]);
      expect(feedback).toContain("Ben's introduction was at 98.7% through the script -- far too late");
      expect(feedback).toMatch(/REQUIRED order/i);
      expect(feedback).toMatch(/\(1\) the hook, \(2\) one brief reaction\/development beat, \(3\) Speaker 0 introduces himself/i);
    });

    it("gives the concrete percentage for a late Hannah introduction", () => {
      const feedback = buildRetryFeedback([
        { message: "Hannah's introduction occurs at 96.8% through the script or too far from Ben's -- both introductions must be in the same opening block." },
      ]);
      expect(feedback).toContain("Hannah's introduction was at 96.8% through the script (or too far from Ben's)");
    });

    it("gives the concrete percentage for a late LinguABC mention", () => {
      const feedback = buildRetryFeedback([
        { message: "LinguABC identity occurs at 96.8% through the script -- must occur in or immediately after the opening introduction block." },
      ]);
      expect(feedback).toContain("the LinguABC mention was at 96.8% through the script -- far too late");
    });

    it("explicitly says the sign-off cannot substitute for the opening when the block is found only at the ending", () => {
      const feedback = buildRetryFeedback([
        {
          message:
            "Introduction block found only in the final 20% of the script (the sign-off) -- it must be near the opening instead. This is exactly the Episode #004 defect.",
        },
      ]);
      expect(feedback).toContain("the introduction block was found ONLY in the final portion of the script, folded into the sign-off");
      expect(feedback).toMatch(/must NOT first appear in the closing sign-off/i);
      expect(feedback).toMatch(/that later mention does not satisfy this requirement/i);
    });

    it("does not add opening-structure guidance when there is no opening issue", () => {
      const feedback = buildRetryFeedback([{ message: "Word count 833 is outside the acceptable 920-965 range." }]);
      expect(feedback).not.toMatch(/The opening block is still wrong/i);
    });

    /**
     * The exact combined shape of the real failure this fix addresses:
     * word count 1055, prosody 1.23/100, introductions/LinguABC all near
     * the end, and no genuine interruption -- seven simultaneous issues,
     * all six MAX_ATTEMPTS retries. Every corrective category must appear
     * together, none crowding out another.
     */
    it("combines word count, prosody, missing interruption, and every opening-structure failure in ONE coherent block, none dropped", () => {
      const feedback = buildRetryFeedback([
        { message: "Word count 1055 is outside the acceptable 920-965 range (calibrated to land inside the pipeline's 300-360s audio-duration gate with real margin)." },
        { message: "Prosody density 1.23/100 words is far below the ~4-6 target -- prosody rules were not followed." },
        { message: "Ben's introduction occurs at 98.7% through the script -- must be within the first 25%." },
        { message: "Hannah's introduction occurs at 96.8% through the script or too far from Ben's -- both introductions must be in the same opening block." },
        { message: "LinguABC identity occurs at 96.8% through the script -- must occur in or immediately after the opening introduction block." },
        {
          message:
            "Introduction block found only in the final 20% of the script (the sign-off) -- it must be near the opening instead. This is exactly the Episode #004 defect.",
        },
        {
          message:
            "No genuine interruption found -- need one turn ending with a dash immediately followed by the next turn starting with a dash (e.g. Speaker 0: '...we—' / Speaker 1: '—never finish that?').",
        },
      ]);

      // Every original issue bullet present.
      expect(feedback).toContain("Word count 1055 is outside the acceptable 920-965 range");
      expect(feedback).toContain("Prosody density 1.23/100 words is far below the ~4-6 target");
      expect(feedback).toContain("Ben's introduction occurs at 98.7%");
      expect(feedback).toContain("Hannah's introduction occurs at 96.8%");
      expect(feedback).toContain("LinguABC identity occurs at 96.8%");
      expect(feedback).toContain("Introduction block found only in the final 20%");
      expect(feedback).toContain("No genuine interruption found");

      // Every corrective instruction present -- fixing one must not crowd out the others.
      // 1055 words overshoots the 935-950 sub-target, so the word-count
      // guidance is the "cut" branch, not the "add" branch.
      expect(feedback).toMatch(/cut approximately \d+-\d+ spoken words/i);
      expect(feedback).toContain("Current prosody density: 1.23/100 words. Required: approximately 4-6/100 words.");
      expect(feedback).toMatch(/structurally REQUIRED/i);
      expect(feedback).toContain("Ben's introduction was at 98.7% through the script -- far too late");
      expect(feedback).toContain("Hannah's introduction was at 96.8% through the script (or too far from Ben's)");
      expect(feedback).toContain("the LinguABC mention was at 96.8% through the script -- far too late");
      expect(feedback).toContain("the introduction block was found ONLY in the final portion of the script, folded into the sign-off");
      expect(feedback).toMatch(/REQUIRED order/i);

      // The explicit "fix all together" framing fires with this many corrections active.
      expect(feedback).toMatch(/must ALL be fixed together in the SAME rewrite/i);
    });
  });
});

/**
 * Regression coverage for the CEFR quality-gate mismatch this fix
 * addresses: a real daily-generation run targeted B2 but was independently
 * graded cefrLevelMin=B1/cefrLevelMax=B2 by generateEnrichment(), only
 * failing at the very end (publishing.ts's quality gate) after Fish
 * Audio synthesis, alignment, and audio upload had already run. The B2
 * prompt guidance was strengthened to draw an explicit line against B1 --
 * tested here the same way the rest of buildPrompt()'s content is
 * implicitly covered, by asserting the corrective language is actually
 * present in the generated prompt for a B2 request.
 */
describe("buildPrompt — B2 guidance explicitly distinguishes itself from B1", () => {
  const request: ScriptGenerationRequest = {
    speaker0Name: "Sarah",
    speaker1Name: "Hannah",
    cefrLevel: "B2",
    usedTitles: [],
    usedTopicTags: [],
  };

  it("tells the model this must clearly clear B1, not sit at its edge", () => {
    const prompt = buildPrompt(request);
    expect(prompt).toMatch(/must clearly clear B1, not sit at its edge/i);
  });

  it("warns that the script is independently graded and a too-simple draft will be rejected", () => {
    const prompt = buildPrompt(request);
    expect(prompt).toMatch(/independently graded/i);
    expect(prompt).toMatch(/safe and simple.{0,40}will fail the grade/i);
  });

  it("does not add the B2-specific anti-B1 language for a C1 request", () => {
    const c1Prompt = buildPrompt({ ...request, cefrLevel: "C1" });
    expect(c1Prompt).not.toMatch(/must clearly clear B1, not sit at its edge/i);
  });
});

/**
 * Regression coverage for the real GitHub Actions failure this fix
 * addresses: SCRIPT_GENERATION exhausted all 6 attempts because
 * validateGeneratedScript() kept rejecting markdown-style emphasis
 * markers (*just*, *so close*) that the base prompt already forbade, but
 * buildRetryFeedback() (before this fix) gave that rejection no stronger
 * a corrective push than the generic bullet list -- see
 * buildRetryFeedback's markdown branch above for the actual fix. This
 * covers the base prompt's own explicit rule, independent of the retry
 * path, the same way the B2/anti-B1 guidance above is covered.
 */
describe("buildPrompt — explicit audio-safe formatting rule against Markdown emphasis", () => {
  const request: ScriptGenerationRequest = {
    speaker0Name: "Sarah",
    speaker1Name: "Hannah",
    cefrLevel: "B2",
    usedTitles: [],
    usedTopicTags: [],
  };

  it("explicitly forbids Markdown emphasis markers such as *word* or **word**", () => {
    const prompt = buildPrompt(request);
    expect(prompt).toMatch(/NEVER use Markdown emphasis markers such as \*word\* or \*\*word\*\*/);
  });

  it("directs spoken emphasis to the [emphasis] bracket cue and explicitly rejects a closing/paired tag", () => {
    const prompt = buildPrompt(request);
    expect(prompt).toMatch(/\[emphasis\] bracket cue placed directly before the word or phrase/i);
    expect(prompt).toMatch(/never write \[\/emphasis\]/i);
  });

  it("forbids Markdown formatting generally, not just asterisk/underscore emphasis", () => {
    const prompt = buildPrompt(request);
    expect(prompt).toMatch(/do not use any markdown formatting/i);
  });
});

/**
 * Regression coverage for the real GitHub Actions failure this fix
 * addresses: SCRIPT_GENERATION exhausted all 6 attempts at 833 words, the
 * latest in a long-standing pattern of undershoot (832, 850-870, 856, now
 * 833) despite every other structural rule being satisfied. The base
 * prompt's LENGTH section previously read as an aspirational "target",
 * while every other hard rule (interruption, markdown, opening position)
 * was flagged MANDATORY, NON-NEGOTIABLE -- this asserts LENGTH now gets
 * the same treatment and an unambiguous single target.
 */
describe("buildPrompt — LENGTH section is an explicit hard floor, not a soft target", () => {
  const request: ScriptGenerationRequest = {
    speaker0Name: "Sarah",
    speaker1Name: "Hannah",
    cefrLevel: "B2",
    usedTitles: [],
    usedTopicTags: [],
  };

  it("states the 930-word hard floor explicitly, matching the other MANDATORY rules", () => {
    const prompt = buildPrompt(request);
    expect(prompt).toMatch(/MANDATORY, NON-NEGOTIABLE: your dialogue MUST contain at least 930 spoken words/i);
    expect(prompt).toMatch(/do not submit a draft under 930 words/i);
  });

  it("gives a single, unambiguous 935-950 target instead of the old 940-980 band", () => {
    const prompt = buildPrompt(request);
    expect(prompt).toMatch(/Target 935-950 words specifically/i);
    expect(prompt).not.toContain("940-980");
  });

  it("explicitly warns that satisfying every other rule does not excuse a short script", () => {
    const prompt = buildPrompt(request);
    expect(prompt).toMatch(/does NOT excuse a short script/i);
  });

  /**
   * Regression coverage for the real GitHub Actions failure this fix
   * addresses: a script (Ben+Hannah, linguabc-episode-006) passed the OLD
   * 920-990 word-count gate outright and still produced 365.4s of real
   * audio -- 5.4s past the pipeline's 360s hard limit. The base prompt
   * never stated an explicit upper word-count limit at all before this
   * fix, only an internal "target" range with no stated ceiling -- so
   * attempt 1 had no signal a ceiling even existed. This asserts the new,
   * explicit MANDATORY ceiling statement.
   */
  it("explicitly states the 965-word hard ceiling, not just an internal target", () => {
    const prompt = buildPrompt(request);
    expect(prompt).toMatch(/MANDATORY, NON-NEGOTIABLE: do NOT exceed 965 words under any circumstances/i);
    expect(prompt).toMatch(/going over the target range is exactly as invalid as falling short of it/i);
  });
});

/**
 * Regression coverage for the real GitHub Actions failure this fix
 * addresses: a script overshot to 1181 words while prosody density fell
 * to 1.61/100 (well under the ~2/100 hard floor validateGeneratedScript
 * actually enforces). The base prompt previously told the model prosody
 * density was "a target, not a mechanical rule" -- literally false given
 * the real hard-reject check -- which plausibly let the model treat it as
 * negotiable while padding length. This asserts the corrected framing and
 * the explicit added-length-needs-proportional-cues warning.
 */
describe("buildPrompt — PROSODY section is an explicit hard floor, matching real validation", () => {
  const request: ScriptGenerationRequest = {
    speaker0Name: "Sarah",
    speaker1Name: "Hannah",
    cefrLevel: "B2",
    usedTitles: [],
    usedTopicTags: [],
  };

  it("states prosody density as MANDATORY, NON-NEGOTIABLE, not a soft target", () => {
    const prompt = buildPrompt(request);
    expect(prompt).toMatch(/MANDATORY, NON-NEGOTIABLE: target 4-6 meaningful cues per 100 words/i);
    expect(prompt).not.toMatch(/this is a target, not a mechanical rule/i);
  });

  it("states the real ~2/100 hard-reject floor the validator actually enforces", () => {
    const prompt = buildPrompt(request);
    expect(prompt).toMatch(/below ~2 cues per 100 words WILL BE REJECTED outright/i);
  });

  it("warns that added length requires proportionally more cues, not the same handful spread thinner", () => {
    const prompt = buildPrompt(request);
    expect(prompt).toMatch(/a longer script needs MORE cues to hold the same density/i);
  });
});

/**
 * Regression coverage for the architectural fix addressing four straight
 * "prompt-only" iterations that each fixed one dimension while breaking
 * another (833 words -> 1181 words+prosody/interruption -> 1055
 * words+prosody/opening/interruption -> 1032 words+prosody). Root cause:
 * the retry loop never carried the previous draft forward, so every retry
 * was a blind full regeneration. buildRevisionPreamble() is the new
 * framing sent alongside the previous draft (as a real assistant turn)
 * instead of asking the model to reconstruct the whole episode from
 * nothing -- tested here in isolation, the same way buildPrompt()'s
 * content is tested elsewhere in this file.
 */
describe("buildRevisionPreamble — targeted-revision framing", () => {
  it("instructs the model to revise the previous draft, not start over", () => {
    const preamble = buildRevisionPreamble();
    expect(preamble).toMatch(/EXACT script you wrote last time/i);
    expect(preamble).toMatch(/Do NOT discard it and write a new script from scratch/i);
    expect(preamble).toMatch(/REVISE that exact draft/i);
  });

  it("explicitly preserves already-correct structure, including the opening block and interruption", () => {
    const preamble = buildRevisionPreamble();
    expect(preamble).toMatch(/leave every turn, line, joke, example, and structural element that was NOT flagged completely unchanged/i);
    expect(preamble).toMatch(/same opening block and interruption if they already passed/i);
  });

  it("still requires the full script to be returned, not a diff or a summary", () => {
    const preamble = buildRevisionPreamble();
    expect(preamble).toMatch(/return the FULL script \(every turn, not a diff/i);
  });
});

/**
 * Regression coverage for the exact real failure this architectural fix
 * addresses: 1032 words (an overshoot) combined with a 1.84/100 prosody
 * density (well under the ~2/100 hard floor), the fourth straight
 * "prompt-only" failure. Confirms buildRetryFeedback()'s existing,
 * unchanged word-count and prosody guidance still produce the exact
 * concrete numbers for these real values, and that opening/interruption/
 * CEFR/markdown guidance all still compose alongside them -- this content
 * is unchanged by the revision architecture, only WHERE it gets sent
 * (the new revision turn, not an ever-growing single prompt) changed.
 */
describe("buildRetryFeedback — the exact real 1032-word / 1.84-prosody failure", () => {
  it("computes the exact 82-97 cut range and 1.84 density guidance simultaneously", () => {
    const feedback = buildRetryFeedback([
      { message: "Word count 1032 is outside the acceptable 920-965 range (calibrated to land inside the pipeline's 300-360s audio-duration gate with real margin)." },
      { message: "Prosody density 1.84/100 words is far below the ~4-6 target -- prosody rules were not followed." },
    ]);
    expect(feedback).toContain("Previous draft: 1032 words. Required: 920-965, hard maximum 965");
    expect(feedback).toMatch(/cut approximately 82-97 spoken words/i);
    expect(feedback).toContain("Current prosody density: 1.84/100 words. Required: approximately 4-6/100 words.");
  });

  it("still composes with opening-structure, interruption, CEFR, and markdown guidance all at once", () => {
    const feedback = buildRetryFeedback([
      { message: "Word count 1032 is outside the acceptable 920-965 range." },
      { message: "Prosody density 1.84/100 words is far below the ~4-6 target -- prosody rules were not followed." },
      { message: "Ben's introduction occurs at 91.2% through the script -- must be within the first 25%." },
      {
        message:
          "No genuine interruption found -- need one turn ending with a dash immediately followed by the next turn starting with a dash (e.g. Speaker 0: '...we—' / Speaker 1: '—never finish that?').",
      },
      { message: "Authoritative enrichment graded this script as cefrLevelMin=B1, cefrLevelMax=B2." },
      { message: "Found markdown-style emphasis markers that would be read aloud literally (use [emphasis] instead): *just*" },
    ]);
    expect(feedback).toMatch(/cut approximately 82-97 spoken words/i);
    expect(feedback).toContain("Current prosody density: 1.84/100 words. Required: approximately 4-6/100 words.");
    expect(feedback).toContain("Ben's introduction was at 91.2% through the script -- far too late");
    expect(feedback).toMatch(/structurally REQUIRED/i);
    expect(feedback).toMatch(/independently graded BELOW the required B2\+ standard/i);
    expect(feedback).toMatch(/remove all markdown emphasis markers/i);
    expect(feedback).toMatch(/must ALL be fixed together in the SAME rewrite/i);
  });
});

/**
 * Regression coverage for the FIFTH straight real-run word-count failure
 * this fix addresses: a script converged on EVERY other constraint
 * (opening, prosody, interruption, CEFR, markdown all passed) via the
 * targeted-revision architecture, but still failed word count alone at
 * 1087 across all 6 revision attempts. The numeric cut range was already
 * correct ("cut approximately 137-152") -- the gap was framing: the old
 * text ("Target 960-975 words total") could still be read as a
 * generation target rather than an edit constraint on the specific draft
 * already in front of the model. The overshoot branch now explicitly
 * states this is a CUT operation (not a rewrite/expansion), that the
 * result must be shorter than the previous draft, restates the 990 hard
 * ceiling twice, asks for a final recount, and explicitly preserves the
 * already-passing structure -- undershoot guidance is deliberately
 * untouched (asserted below).
 */
describe("buildRetryFeedback — the exact real 1087-word overshoot (fifth iteration, word count only)", () => {
  it('gives the exact "cut approximately 137-152" range for the real 1087-word overshoot', () => {
    const feedback = buildRetryFeedback([
      { message: "Word count 1087 is outside the acceptable 920-965 range (calibrated to land inside the pipeline's 300-360s audio-duration gate with real margin)." },
    ]);
    expect(feedback).toContain("Previous draft: 1087 words.");
    expect(feedback).toMatch(/cut approximately 137-152 spoken words/i);
  });

  it("explicitly frames the correction as a CUT operation, not a rewrite or expansion", () => {
    const feedback = buildRetryFeedback([{ message: "Word count 1087 is outside the acceptable 920-965 range." }]);
    expect(feedback).toMatch(/Do NOT rewrite or expand the draft/i);
    expect(feedback).toMatch(/This is a CUT operation, not a generation target/i);
    expect(feedback).toMatch(/do not add replacement paragraphs or new content to compensate/i);
  });

  it("states the revised draft must be shorter than the previous draft", () => {
    const feedback = buildRetryFeedback([{ message: "Word count 1087 is outside the acceptable 920-965 range." }]);
    expect(feedback).toMatch(/MUST be SHORTER than the previous 1087-word draft/i);
  });

  it("states both the 935-950 target and the 965 hard maximum explicitly", () => {
    const feedback = buildRetryFeedback([{ message: "Word count 1087 is outside the acceptable 920-965 range." }]);
    expect(feedback).toMatch(/hard maximum 965/i);
    expect(feedback).toMatch(/Target 935-950 words total/i);
    expect(feedback).toMatch(/MUST NOT exceed 965/i);
  });

  it("asks for a final recount before returning the answer", () => {
    const feedback = buildRetryFeedback([{ message: "Word count 1087 is outside the acceptable 920-965 range." }]);
    expect(feedback).toMatch(/mentally recount the final spoken word total/i);
    expect(feedback).toMatch(/if it is still above 965, cut more/i);
  });

  it("explicitly preserves the already-passing opening block, interruption, prosody cues, and CEFR-level content", () => {
    const feedback = buildRetryFeedback([{ message: "Word count 1087 is outside the acceptable 920-965 range." }]);
    expect(feedback).toMatch(/Preserve the existing opening block, interruption, prosody cues, and CEFR-level content/i);
  });

  it("leaves undershoot guidance completely unchanged", () => {
    const feedback = buildRetryFeedback([{ message: "Word count 856 is outside the acceptable 920-965 range." }]);
    expect(feedback).toContain("Previous draft: 856 words. Required: 920-965.");
    expect(feedback).toMatch(/add approximately 79-94 spoken words/i);
    expect(feedback).not.toMatch(/CUT operation/i);
    expect(feedback).not.toMatch(/mentally recount/i);
  });

  it("still composes with opening-structure, interruption, CEFR, and markdown guidance when they co-occur with the overshoot", () => {
    const feedback = buildRetryFeedback([
      { message: "Word count 1087 is outside the acceptable 920-965 range." },
      { message: "LinguABC identity occurs at 88.4% through the script -- must occur in or immediately after the opening introduction block." },
      {
        message:
          "No genuine interruption found -- need one turn ending with a dash immediately followed by the next turn starting with a dash (e.g. Speaker 0: '...we—' / Speaker 1: '—never finish that?').",
      },
      { message: "Authoritative enrichment graded this script as cefrLevelMin=B1, cefrLevelMax=B2." },
      { message: "Found markdown-style emphasis markers that would be read aloud literally (use [emphasis] instead): *just*" },
    ]);
    expect(feedback).toMatch(/cut approximately 137-152 spoken words/i);
    expect(feedback).toMatch(/This is a CUT operation/i);
    expect(feedback).toContain("the LinguABC mention was at 88.4% through the script -- far too late");
    expect(feedback).toMatch(/structurally REQUIRED/i);
    expect(feedback).toMatch(/independently graded BELOW the required B2\+ standard/i);
    expect(feedback).toMatch(/remove all markdown emphasis markers/i);
    expect(feedback).toMatch(/must ALL be fixed together in the SAME rewrite/i);
  });
});

/**
 * Regression coverage for the near-ceiling overshoot fix: a real run
 * (SCRIPT_GENERATION failing after 6 attempts, final word count 1015 --
 * only 50 words past the 965 hard ceiling, every other check already
 * passing) was given the same "cut all the way to 935-950" instruction as
 * a large overshoot, demanding a 65-80-word cut when only ~55 words
 * needed removing. buildWordCountGuidance() now special-cases a previous
 * count within NEAR_CEILING_OVERSHOOT_LIMIT (60) words of the 965 ceiling:
 * it asks for a smaller cut anchored to 955-960 (safely under 965 with a
 * 5-10 word margin) instead of forcing the draft down to 935-950. Large
 * overshoots (67+ words past the ceiling -- 1032, 1087, 1181, all
 * asserted above) are unaffected and keep the original 935-950 treatment.
 */
describe("buildWordCountGuidance — near-ceiling overshoot (real 1015-word failure)", () => {
  it('gives a modest "cut approximately 40-45" range, not 65-80, for a 1000-word near-miss overshoot', () => {
    const feedback = buildRetryFeedback([{ message: "Word count 1000 is outside the acceptable 920-965 range." }]);
    expect(feedback).toContain("Previous draft: 1000 words. Required: 920-965, hard maximum 965");
    expect(feedback).toMatch(/but only by 35 word\(s\), so a full cut down to 935-950 is unnecessary/i);
    expect(feedback).toMatch(/cut approximately 40-45 spoken words/i);
    expect(feedback).toMatch(/Target 955-960 words total, safely under the 965 hard maximum/i);
    expect(feedback).not.toMatch(/Target 935-950 words total/i);
  });

  it('gives the exact "cut approximately 55-60" range for the real 1015-word near-miss overshoot', () => {
    const feedback = buildRetryFeedback([
      { message: "Word count 1015 is outside the acceptable 920-965 range (calibrated to land inside the pipeline's 300-360s audio-duration gate with real margin)." },
    ]);
    expect(feedback).toContain("Previous draft: 1015 words. Required: 920-965, hard maximum 965");
    expect(feedback).toMatch(/but only by 50 word\(s\), so a full cut down to 935-950 is unnecessary/i);
    expect(feedback).toMatch(/cut approximately 55-60 spoken words/i);
    expect(feedback).toMatch(/Target 955-960 words total/i);
    expect(feedback).not.toMatch(/Target 935-950 words total/i);
  });

  it("still uses the near-ceiling path at the boundary (1025 words, exactly 60 over)", () => {
    const feedback = buildRetryFeedback([{ message: "Word count 1025 is outside the acceptable 920-965 range." }]);
    expect(feedback).toContain("Previous draft: 1025 words. Required: 920-965, hard maximum 965");
    expect(feedback).toMatch(/but only by 60 word\(s\), so a full cut down to 935-950 is unnecessary/i);
    expect(feedback).toMatch(/cut approximately 65-70 spoken words/i);
    expect(feedback).toMatch(/Target 955-960 words total/i);
    expect(feedback).not.toMatch(/Target 935-950 words total/i);
  });

  it("switches back to the large-overshoot 935-950 path just beyond the boundary (1026 words, 61 over)", () => {
    const feedback = buildRetryFeedback([{ message: "Word count 1026 is outside the acceptable 920-965 range." }]);
    expect(feedback).toContain("Previous draft: 1026 words. Required: 920-965, hard maximum 965 -- this draft already exceeds it. Do NOT rewrite or expand the draft.");
    expect(feedback).not.toMatch(/so a full cut down to 935-950 is unnecessary/i);
    expect(feedback).toMatch(/cut approximately 76-91 spoken words/i);
    expect(feedback).toMatch(/Target 935-950 words total, and it MUST NOT exceed 965/i);
    expect(feedback).not.toMatch(/Target 955-960 words total/i);
  });

  it("leaves large-overshoot guidance (1032, 1087, 1181) on the existing 935-950 path, unaffected", () => {
    const feedback1032 = buildRetryFeedback([{ message: "Word count 1032 is outside the acceptable 920-965 range." }]);
    expect(feedback1032).toMatch(/cut approximately 82-97 spoken words/i);
    expect(feedback1032).toMatch(/Target 935-950 words total/i);

    const feedback1087 = buildRetryFeedback([{ message: "Word count 1087 is outside the acceptable 920-965 range." }]);
    expect(feedback1087).toMatch(/cut approximately 137-152 spoken words/i);
    expect(feedback1087).toMatch(/Target 935-950 words total/i);

    const feedback1181 = buildRetryFeedback([{ message: "Word count 1181 is outside the acceptable 920-965 range." }]);
    expect(feedback1181).toMatch(/cut approximately 231-246 spoken words/i);
    expect(feedback1181).toMatch(/Target 935-950 words total/i);
  });

  it("leaves undershoot guidance (856 words) completely unaffected by the near-ceiling path", () => {
    const feedback = buildRetryFeedback([{ message: "Word count 856 is outside the acceptable 920-965 range." }]);
    expect(feedback).toContain("Previous draft: 856 words. Required: 920-965.");
    expect(feedback).toMatch(/add approximately 79-94 spoken words/i);
    expect(feedback).not.toMatch(/CUT operation/i);
    expect(feedback).not.toMatch(/safely under the 965 hard maximum/i);
  });
});

/**
 * Regression coverage for the single-authoritative-CEFR-grading
 * architecture fix: a real GitHub Actions run passed a separate,
 * hand-written CEFR-only precheck, then failed publishing.ts's quality
 * gate because the REAL generateEnrichment() call (run later, after Fish
 * Audio synthesis/alignment) graded the identical text cefrLevelMin=B1.
 * generateEpisodeScript() now calls the real generateEnrichment() itself,
 * once per attempt, and only returns once IT grades B2/C1/C2 -- so there
 * is exactly one CEFR judgment, not two that could disagree.
 *
 * generateStructuredJson (the script-writing call) and generateEnrichment
 * (the grading call) are both mocked -- the same pattern
 * src/lib/content-engine/pipeline.test.ts already uses for
 * generateEnrichment, applied here for the sibling script-generation call
 * too, so this suite never makes a real LLM request.
 */
describe("generateEpisodeScript — single authoritative enrichment grading", () => {
  const REQUEST_B2: ScriptGenerationRequest = {
    speaker0Name: "Sarah",
    speaker1Name: "Hannah",
    cefrLevel: "B2",
    usedTitles: [],
    usedTopicTags: [],
  };

  const stripTags = (t: string) => t.replace(/\[[^\]]*\]/g, " ");
  const countWords = (turns: ScriptGenerationOutput["turns"]) =>
    turns.reduce((sum, t) => sum + stripTags(t.text).split(/\s+/).filter(Boolean).length, 0);

  /**
   * A script built to genuinely satisfy every structural rule in
   * validateGeneratedScript() (word count, turn count, multi-sentence
   * ratio, prosody density + mid-sentence placement, no markdown, no
   * unbalanced/leaked brackets, opening-block position, the interruption
   * pattern) -- verified directly below by asserting
   * validateGeneratedScript() returns zero issues for it. Word count is
   * padded to exactly 950 at runtime (never hand-counted) so this fixture
   * can't silently drift out of the 920-965 range as its text changes.
   */
  function buildValidScriptOutput(): ScriptGenerationOutput {
    const turns: ScriptGenerationOutput["turns"] = [
      { speaker: 0, text: "[thoughtful] I once forgot my own name for ten seconds after waking up in a strange hotel room, and it genuinely rattled me for the rest of the morning." },
      { speaker: 1, text: "Wait, seriously? That sounds terrifying, not just strange." },
      { speaker: 0, text: "It really was. [break] Anyway, I'm Sarah." },
      { speaker: 1, text: "And I'm Hannah." },
      { speaker: 0, text: "This is LinguABC, and today we're talking about the strange ways memory can fail us even when nothing is actually wrong." },
    ];

    const fillerTemplates = [
      "That is a genuinely interesting way to think about it, [curious] and honestly I had never considered it from that angle before. It also makes me wonder what else we take for granted.",
      "Right, and it is not just about memory either -- it is about how much we trust our own sense of a totally ordinary morning. [amused] People rarely question it until something breaks.",
      "I read somewhere that this happens more often to people who travel a lot, [thoughtful] which honestly makes a strange kind of sense once you think it through.",
      "Exactly, and that is the part that surprised me the most. [reflective] It is such a small moment, but it really stuck with me for weeks afterward.",
    ];
    for (let i = 0; i < 24; i++) {
      turns.push({ speaker: (i % 2) as 0 | 1, text: fillerTemplates[i % fillerTemplates.length] });
    }

    turns.push({ speaker: 0, text: "...and honestly I think the whole point is that we—" });
    turns.push({ speaker: 1, text: "—never actually finish that argument? Yeah, I've noticed." });
    turns.push({ speaker: 0, text: "[reflective] Well, that gives us a lot to think about before next time." });
    turns.push({ speaker: 1, text: "It really does. [warm] That has been LinguABC -- thanks for listening, and we will catch you in the next one." });

    while (countWords(turns) < 950) {
      const last = turns[turns.length - 1];
      turns[turns.length - 1] = { ...last, text: `${last.text} genuinely` };
    }

    return { title: "Test Episode", topic: "Testing", topicTags: ["Testing"], cefrLevel: "B2", turns };
  }

  it("fixture sanity check: the valid script passes every structural rule with zero issues", () => {
    const issues = validateGeneratedScript(buildValidScriptOutput(), REQUEST_B2);
    expect(issues).toEqual([]);
  });

  /**
   * A script sharing the EXACT SAME opening block and interruption pair
   * as buildValidScriptOutput() above, but padded with plain (no
   * prosody-cue) filler turns so word count overshoots 965 and prosody
   * density falls under the 2/100 hard floor -- modeling the real failure
   * this fix addresses (1032 words, 1.84/100 density) where everything
   * else about the draft was already correct.
   */
  function buildTooLongLowProsodyOutput(): ScriptGenerationOutput {
    const turns: ScriptGenerationOutput["turns"] = [
      { speaker: 0, text: "[thoughtful] I once forgot my own name for ten seconds after waking up in a strange hotel room, and it genuinely rattled me for the rest of the morning." },
      { speaker: 1, text: "Wait, seriously? That sounds terrifying, not just strange." },
      { speaker: 0, text: "It really was. [break] Anyway, I'm Sarah." },
      { speaker: 1, text: "And I'm Hannah." },
      { speaker: 0, text: "This is LinguABC, and today we're talking about the strange ways memory can fail us even when nothing is actually wrong." },
    ];
    for (let i = 0; i < 40; i++) {
      turns.push({
        speaker: (i % 2) as 0 | 1,
        text: `This is plain filler turn number ${i} with absolutely no prosody cue anywhere in it at all. It just keeps talking about the topic in an ordinary flat way.`,
      });
    }
    turns.push({ speaker: 0, text: "...and honestly I think the whole point is that we—" });
    turns.push({ speaker: 1, text: "—never actually finish that argument? Yeah, I've noticed." });
    turns.push({ speaker: 0, text: "[reflective] Well, that gives us a lot to think about before next time." });
    turns.push({ speaker: 1, text: "It really does. [warm] That has been LinguABC -- thanks for listening, and we will catch you in the next one." });
    return { title: "Test Episode", topic: "Testing", topicTags: ["Testing"], cefrLevel: "B2", turns };
  }

  it("fixture sanity check: the too-long/low-prosody script fails ONLY word count and prosody density", () => {
    const issues = validateGeneratedScript(buildTooLongLowProsodyOutput(), REQUEST_B2);
    expect(issues).toHaveLength(2);
    expect(issues.some((i) => /^Word count \d+ is outside the acceptable 920-965 range/.test(i.message))).toBe(true);
    expect(issues.some((i) => /^Prosody density [\d.]+\/100 words is far below/.test(i.message))).toBe(true);
  });

  function fakeEnrichment(overrides: Partial<EnrichmentResult> = {}): EnrichmentResult {
    return {
      cefrLevelMin: "B2",
      cefrLevelMax: "C1",
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
    vi.mocked(generateStructuredJson).mockResolvedValue(buildValidScriptOutput());
  });

  it("returns the real enrichment result on success once it grades B2+", async () => {
    vi.mocked(generateEnrichment).mockResolvedValue(fakeEnrichment({ cefrLevelMin: "B2", cefrLevelMax: "C1" }));

    const result = await generateEpisodeScript(REQUEST_B2);

    expect(result.enrichment.cefrLevelMin).toBe("B2");
    expect(result.enrichment.cefrLevelMax).toBe("C1");
    expect(result.attempts).toBe(1);
    expect(vi.mocked(generateEnrichment)).toHaveBeenCalledTimes(1);
  });

  it("treats a below-B2 enrichment grade as a retry-worthy failure, not a success", async () => {
    vi.mocked(generateEnrichment)
      .mockResolvedValueOnce(fakeEnrichment({ cefrLevelMin: "B1", cefrLevelMax: "B2" }))
      .mockResolvedValueOnce(fakeEnrichment({ cefrLevelMin: "B2", cefrLevelMax: "C1" }));

    const result = await generateEpisodeScript(REQUEST_B2);

    expect(result.attempts).toBe(2);
    expect(result.enrichment.cefrLevelMin).toBe("B2");
    expect(vi.mocked(generateEnrichment)).toHaveBeenCalledTimes(2);

    // Attempt 2 is a real 3-turn revision conversation, not a single
    // ever-growing prompt string: original instructions, the model's own
    // previous draft as an assistant turn, then the revision instruction.
    const secondCall = vi.mocked(generateStructuredJson).mock.calls[1][0];
    expect(secondCall.messages).toHaveLength(3);
    expect(secondCall.messages[0].role).toBe("user");
    expect(secondCall.messages[1].role).toBe("assistant");
    expect(secondCall.messages[2].role).toBe("user");

    // The revision turn must carry the genuine-improvement guidance, not
    // a metadata-relabeling instruction.
    const revisionPrompt = secondCall.messages[2].content as string;
    expect(revisionPrompt).toMatch(/Authoritative enrichment graded this script as cefrLevelMin=B1/i);
    expect(revisionPrompt).toMatch(/independently graded BELOW the required B2\+ standard/i);
    expect(revisionPrompt).toMatch(/do not just relabel the same simple script or change the self-reported level field/i);
  });

  it("throws after exhausting all attempts if enrichment keeps grading below B2", async () => {
    vi.mocked(generateEnrichment).mockResolvedValue(fakeEnrichment({ cefrLevelMin: "B1", cefrLevelMax: "B2" }));

    await expect(generateEpisodeScript(REQUEST_B2)).rejects.toThrow(/Script generation failed validation after 6 attempts/i);
    expect(vi.mocked(generateEnrichment)).toHaveBeenCalledTimes(6);
  });

  it("never calls generateEnrichment when structural validation already failed -- no wasted grading call", async () => {
    vi.mocked(generateStructuredJson).mockResolvedValue({
      title: "Test Episode",
      topic: "Testing",
      topicTags: ["Testing"],
      cefrLevel: "B2",
      turns: [{ speaker: 0, text: "Too short to pass any structural rule." }],
    });

    await expect(generateEpisodeScript(REQUEST_B2)).rejects.toThrow();
    expect(vi.mocked(generateEnrichment)).not.toHaveBeenCalled();
  });

  it("calls generateEnrichment exactly once per successful episode -- no duplicate grading call", async () => {
    vi.mocked(generateEnrichment).mockResolvedValue(fakeEnrichment());

    await generateEpisodeScript(REQUEST_B2);

    expect(vi.mocked(generateEnrichment)).toHaveBeenCalledTimes(1);
  });

  /**
   * Regression coverage for the targeted-revision architecture itself --
   * the real fix. Before this change, generateEpisodeScript() discarded
   * the previous attempt's `output` entirely; only the validation ISSUE
   * TEXT survived into the next attempt's single, ever-growing prompt
   * string. Confirms attempt 1 is completely unaffected (a single clean
   * user message), and that a word-count+prosody-only failure -- which
   * left the opening block and interruption pair untouched -- produces a
   * real 3-turn conversation on attempt 2: the unchanged base prompt, the
   * model's own EXACT previous draft as a genuine assistant turn, then a
   * revision instruction carrying the real failures.
   */
  describe("targeted revision — the architectural fix", () => {
    it("sends a single clean user message on attempt 1, unchanged by the revision architecture", async () => {
      vi.mocked(generateEnrichment).mockResolvedValue(fakeEnrichment());

      await generateEpisodeScript(REQUEST_B2);

      const firstCall = vi.mocked(generateStructuredJson).mock.calls[0][0];
      expect(firstCall.messages).toHaveLength(1);
      expect(firstCall.messages[0].role).toBe("user");
      expect(firstCall.messages[0].content).toBe(buildPrompt(REQUEST_B2));
    });

    it("routes a word-count+prosody-only failure through targeted revision, preserving the opening/interruption structure that already passed", async () => {
      const brokenOutput = buildTooLongLowProsodyOutput();
      const fixedOutput = buildValidScriptOutput();
      vi.mocked(generateStructuredJson).mockResolvedValueOnce(brokenOutput).mockResolvedValueOnce(fixedOutput);
      vi.mocked(generateEnrichment).mockResolvedValue(fakeEnrichment());

      const result = await generateEpisodeScript(REQUEST_B2);

      expect(result.attempts).toBe(2);
      expect(vi.mocked(generateStructuredJson)).toHaveBeenCalledTimes(2);

      const secondCall = vi.mocked(generateStructuredJson).mock.calls[1][0];
      expect(secondCall.messages).toHaveLength(3);
      // The base instructions are sent again unchanged, not re-derived.
      expect(secondCall.messages[0].role).toBe("user");
      expect(secondCall.messages[0].content).toBe(buildPrompt(REQUEST_B2));
      // The assistant turn is the EXACT previous (broken) draft -- not a
      // summary, not regenerated -- so the model can literally edit it.
      expect(secondCall.messages[1].role).toBe("assistant");
      expect(JSON.parse(secondCall.messages[1].content as string)).toEqual(brokenOutput);
      // The revision turn carries the real failures and the
      // preserve-what-already-worked framing.
      expect(secondCall.messages[2].role).toBe("user");
      const revisionPrompt = secondCall.messages[2].content as string;
      expect(revisionPrompt).toMatch(/REVISE that exact draft/i);
      expect(revisionPrompt).toMatch(/Word count \d+ is outside the acceptable 920-965 range/i);
      expect(revisionPrompt).toMatch(/Prosody density [\d.]+\/100 words is far below/i);
    });

    it("still fails honestly after exhausting all attempts if the same issue persists through every revision", async () => {
      vi.mocked(generateStructuredJson).mockResolvedValue(buildTooLongLowProsodyOutput());

      await expect(generateEpisodeScript(REQUEST_B2)).rejects.toThrow(/Script generation failed validation after 6 attempts/i);
      expect(vi.mocked(generateStructuredJson)).toHaveBeenCalledTimes(6);
      expect(vi.mocked(generateEnrichment)).not.toHaveBeenCalled();

      // Every retry (attempts 2-6) used the real 3-turn revision shape,
      // referencing the same persistently-broken draft each time -- never
      // silently falling back to a single-message blind regeneration.
      for (let i = 1; i < 6; i++) {
        const call = vi.mocked(generateStructuredJson).mock.calls[i][0];
        expect(call.messages).toHaveLength(3);
        expect(call.messages[1].role).toBe("assistant");
      }
    });
  });

  /**
   * Regression coverage for the observability gap this fix closes: the
   * final thrown error used to report ONLY the last attempt's issue text,
   * with no way to tell whether the JSON-parse failure it reports came
   * from an attempt that never had a successfully-parsed draft to revise
   * (the "attempt 1" / initial single-message shape -- which, per this
   * function's own doc comment, ANY attempt falls back to if no draft has
   * ever parsed yet, not just literally the first call) or from a later
   * revision attempt that broke after earlier drafts parsed fine (the
   * "attempts 2-6" / revision shape). Neither test changes lastIssues'
   * content or buildRetryFeedback()'s output -- only the thrown Error's
   * own message gains the attempt/shape tag.
   */
  describe("generateEpisodeScript — diagnostic tagging identifies which attempt/shape actually failed", () => {
    it("tags the final error as initial single-message generation when no draft EVER successfully parses (attempt 1's shape, all 6 attempts)", async () => {
      vi.useFakeTimers();
      try {
        vi.mocked(generateStructuredJson).mockRejectedValue(
          new Error(
            'The model did not return valid JSON for "linguabc_podcast_script" (finishReason: length, contentLength: 4102, parseError: Unexpected end of JSON input)',
          ),
        );

        const failure = generateEpisodeScript(REQUEST_B2).catch((error) => error as Error);
        await vi.runAllTimersAsync();
        const error = await failure;

        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toMatch(/attempt 6\/6, initial single-message generation/i);
        expect((error as Error).message).toMatch(/parseError: Unexpected end of JSON input/i);
        expect(vi.mocked(generateStructuredJson)).toHaveBeenCalledTimes(6);
        // Since no attempt ever successfully parsed, previousOutput was
        // never set -- every single call, including the 6th, used
        // attempt 1's single-message shape, never the 3-turn revision one.
        for (const call of vi.mocked(generateStructuredJson).mock.calls) {
          expect(call[0].messages).toHaveLength(1);
        }
      } finally {
        vi.useRealTimers();
      }
    });

    it("tags the final error as revision generation when earlier attempts parsed fine and only the 6th attempt (after revisions) failed to parse", async () => {
      const draft = buildTooLongLowProsodyOutput();
      vi.mocked(generateStructuredJson)
        .mockResolvedValueOnce(draft)
        .mockResolvedValueOnce(draft)
        .mockResolvedValueOnce(draft)
        .mockResolvedValueOnce(draft)
        .mockResolvedValueOnce(draft)
        .mockRejectedValueOnce(
          new Error(
            'The model did not return valid JSON for "linguabc_podcast_script" (finishReason: length, contentLength: 6001, parseError: Unexpected end of JSON input)',
          ),
        );

      await expect(generateEpisodeScript(REQUEST_B2)).rejects.toThrow(/attempt 6\/6, revision generation/i);
      expect(vi.mocked(generateStructuredJson)).toHaveBeenCalledTimes(6);

      // Attempts 2-6 all used the real 3-turn revision shape, since
      // attempt 1 successfully parsed (even though it failed validation).
      for (let i = 1; i < 6; i++) {
        expect(vi.mocked(generateStructuredJson).mock.calls[i][0].messages).toHaveLength(3);
      }
    });
  });
});
