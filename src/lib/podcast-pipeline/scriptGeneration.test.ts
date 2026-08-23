import { vi, describe, it, expect, beforeEach } from "vitest";
import {
  validateGeneratedScript,
  buildRetryFeedback,
  buildPrompt,
  buildRevisionPreamble,
  buildCefrOnlyRevisionPreamble,
  generateEpisodeScript,
  checkOpeningStructure,
  selectLargeCutTarget,
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
 * Regression coverage for the DETERMINISTIC LARGE-CUT TARGET SELECTION
 * fix: a real diagnostic run confirmed the large-cut classification and
 * cut-range arithmetic were already correct, and the model was explicitly,
 * repeatedly told to "find the SINGLE longest turn... that is a personal
 * example, story, extended explanation, or other non-essential aside" --
 * and reliably failed to do so (one real edit trimmed an unrelated turn's
 * trailing sentence instead; two genuinely eligible turns went untouched
 * across 12 consecutive attempts). selectLargeCutTarget() removes the
 * SEARCH from the model's job -- tested directly here, the same way
 * checkOpeningStructure() above is tested directly, since it needs no LLM
 * call and reuses checkOpeningStructure() (unmodified) for the opening-block
 * signals.
 */
describe("selectLargeCutTarget — direct unit coverage", () => {
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

  /** A real, structurally-valid opening block (hook, both self-intros,
   * LinguABC mention) matching checkOpeningStructure()'s own expectations,
   * so speaker0IntroPosition/speaker1IntroPosition/linguabcPosition are
   * all found and actually exercise the protection logic under test. */
  function openingBlock(): ScriptGenerationOutput["turns"] {
    return [
      { speaker: 0, text: "I once locked myself out of my own apartment wearing only socks, in the middle of January." }, // turn 0: the hook
      { speaker: 1, text: "Wait, that is awful. What did you even do?" }, // turn 1
      { speaker: 0, text: "It was a whole thing. Anyway, I'm Ben." }, // turn 2: speaker0 self-intro
      { speaker: 1, text: "And I'm Hannah." }, // turn 3: speaker1 self-intro
      { speaker: 0, text: "This is LinguABC, and today we are talking about small emergencies that teach you something." }, // turn 4: LinguABC mention
    ];
  }

  function interruptionPair(): ScriptGenerationOutput["turns"] {
    return [
      { speaker: 0, text: "...and honestly I think the whole point is that we—" },
      { speaker: 1, text: "—never actually finish that argument? Yeah, I've noticed." },
    ];
  }

  function closingTurn(): ScriptGenerationOutput["turns"] {
    return [{ speaker: 1, text: "It really does. That has been LinguABC -- thanks for listening, and we will catch you in the next one." }];
  }

  it("1. selects a real, correctly-eligible turn (not one of the protected ones) when exactly one non-trivial candidate exists", () => {
    const turns: ScriptGenerationOutput["turns"] = [
      ...openingBlock(),
      { speaker: 1, text: "Right, and it is not just about memory either -- it is about how much we trust our own sense of a totally ordinary morning." }, // eligible
      ...interruptionPair(),
      ...closingTurn(),
    ];
    const target = selectLargeCutTarget(output(turns), REQUEST_BEN_HANNAH);
    expect(target).not.toBeNull();
    expect(target!.turnIndex).toBe(5);
    expect(target!.speakerName).toBe("Hannah");
    expect(target!.text).toContain("Right, and it is not just about memory either");
  });

  it("2. the LONGEST eligible turn wins when multiple candidates exist -- a short eligible turn does not win over a longer one", () => {
    const turns: ScriptGenerationOutput["turns"] = [
      ...openingBlock(),
      { speaker: 1, text: "Sure, I guess." }, // eligible but short (3 words)
      {
        speaker: 0,
        text: "I read somewhere that this happens more often to people who travel a lot, which honestly makes a strange kind of sense once you think it through, especially after a long international flight.",
      }, // eligible and much longer
      { speaker: 1, text: "Huh, interesting." }, // eligible but short
      ...interruptionPair(),
      ...closingTurn(),
    ];
    const target = selectLargeCutTarget(output(turns), REQUEST_BEN_HANNAH);
    expect(target).not.toBeNull();
    expect(target!.turnIndex).toBe(6); // the long turn, not either short one
    expect(target!.speakerName).toBe("Ben");
  });

  it("3. never selects the hook (turn 0), even when it is the longest turn in the script", () => {
    const turns: ScriptGenerationOutput["turns"] = [
      {
        speaker: 0,
        text: "I once locked myself out of my own apartment wearing only socks, in the middle of January, and it took the building superintendent almost an hour to let me back in while I stood there freezing and increasingly embarrassed in front of my neighbors.",
      }, // turn 0: the hook -- by far the longest turn, but must never be selected
      ...openingBlock().slice(1),
      { speaker: 1, text: "Short reply." },
      ...interruptionPair(),
      ...closingTurn(),
    ];
    const target = selectLargeCutTarget(output(turns), REQUEST_BEN_HANNAH);
    expect(target).not.toBeNull();
    expect(target!.turnIndex).not.toBe(0);
  });

  it("4. never selects the LinguABC branding/intro turn, even when it is the longest eligible-looking turn", () => {
    const turns: ScriptGenerationOutput["turns"] = [
      { speaker: 0, text: "I once locked myself out of my own apartment wearing only socks, in the middle of January." },
      { speaker: 1, text: "Wait, that is awful. What did you even do?" },
      { speaker: 0, text: "It was a whole thing. Anyway, I'm Ben." },
      { speaker: 1, text: "And I'm Hannah." },
      {
        speaker: 0,
        text: "This is LinguABC, and today we are talking about small emergencies that teach you something, and honestly this could turn into a much longer conversation than either of us expected going in.",
      }, // turn 4: LinguABC mention -- deliberately made the longest turn
      { speaker: 1, text: "Short reply." },
      ...interruptionPair(),
      ...closingTurn(),
    ];
    const target = selectLargeCutTarget(output(turns), REQUEST_BEN_HANNAH);
    expect(target).not.toBeNull();
    expect(target!.turnIndex).not.toBe(4);
  });

  it("5. never selects either turn of the interruption pair, even when one of them is the longest eligible-looking turn", () => {
    const turns: ScriptGenerationOutput["turns"] = [
      ...openingBlock(),
      { speaker: 1, text: "Short reply." },
      {
        speaker: 0,
        text: "...and honestly I think the whole point is that we never really stop to consider how much of our daily routine depends on other people simply being reasonable, which is a much bigger thought than I meant to start with, but—",
      }, // long interruption-initiating turn
      { speaker: 1, text: "—never actually finish that argument? Yeah, I've noticed." },
      ...closingTurn(),
    ];
    const target = selectLargeCutTarget(output(turns), REQUEST_BEN_HANNAH);
    expect(target).not.toBeNull();
    expect(target!.turnIndex).not.toBe(6); // the long interruption-initiating turn
    expect(target!.turnIndex).not.toBe(7); // its interruption partner
  });

  it("6. never selects the final (closing/sign-off) turn, even when it is the longest eligible-looking turn", () => {
    const turns: ScriptGenerationOutput["turns"] = [
      ...openingBlock(),
      { speaker: 1, text: "Short reply." },
      ...interruptionPair(),
      {
        speaker: 1,
        text: "It really does. That has been LinguABC, and honestly this was one of the more interesting conversations we have had in a while, so thanks so much for listening and we will catch you again very soon.",
      }, // final turn -- deliberately made the longest turn
    ];
    const target = selectLargeCutTarget(output(turns), REQUEST_BEN_HANNAH);
    expect(target).not.toBeNull();
    expect(target!.turnIndex).not.toBe(turns.length - 1);
  });

  it("7. returns null (no candidate) when every turn in the script is protected -- preserves the fallback path rather than inventing an unsafe target", () => {
    // A minimal, degenerate script where EVERY turn is protected: turn 0 is
    // both the hook AND speaker0's self-intro; turn 1 is both speaker1's
    // self-intro AND the LinguABC mention; turns 2-3 are the interruption
    // pair; turn 4 is the closing turn (also the last index). Nothing left
    // over for a large cut -- exactly the case selectLargeCutTarget() must
    // return null for, rather than inventing an unsafe fallback target.
    const turns: ScriptGenerationOutput["turns"] = [
      { speaker: 0, text: "I'm Ben." },
      { speaker: 1, text: "And I'm Hannah. This is LinguABC." },
      ...interruptionPair(),
      ...closingTurn(),
    ];
    const target = selectLargeCutTarget(output(turns), REQUEST_BEN_HANNAH);
    expect(target).toBeNull();
  });

  it("ties between equally-long eligible turns resolve to the earliest turn index, deterministically", () => {
    const turns: ScriptGenerationOutput["turns"] = [
      ...openingBlock(),
      { speaker: 1, text: "This particular turn has exactly the same word count as the other one below it." },
      { speaker: 0, text: "This particular turn has exactly the same word count as the other one above it." },
      ...interruptionPair(),
      ...closingTurn(),
    ];
    const target = selectLargeCutTarget(output(turns), REQUEST_BEN_HANNAH);
    expect(target).not.toBeNull();
    expect(target!.turnIndex).toBe(5); // the earlier of the two ties
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

  it("gives concrete corrective guidance specifically for a CEFR-level failure COMBINED with another issue", () => {
    // A single, standalone CEFR issue is a PURE mismatch (Fix #7) and gets
    // the dedicated buildCefrOnlyRevisionPreamble() instead -- this generic
    // guidance is reserved for a CEFR issue combined with something else;
    // see the "Fix #7" describe block below for the pure-mismatch case.
    const feedback = buildRetryFeedback([
      { message: "Authoritative enrichment graded this script as cefrLevelMin=B1, cefrLevelMax=B2 -- LinguABC AI-generated podcasts must grade as B2, C1, or C2." },
      { message: "No genuine interruption found." },
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

  /**
   * Regression coverage for the real diagnostic finding this fix
   * implements: a script passed structural validation at 964 words (inside
   * 920-965), then failed ONLY the authoritative CEFR grading. The
   * (previously length-unaware) CEFR guidance told the model to "raise
   * vocabulary sophistication... use real conditional/subordinate-clause
   * sentence structures throughout... genuinely rewrite the language" with
   * no word-count constraint attached, and a real rewrite ballooned to
   * 1269 words -- undoing several attempts' worth of word-count-correction
   * progress. buildCefrGuidance() (called from buildRetryFeedback() via
   * its new optional previousWordCount parameter) now adds an explicit
   * word-count-preservation constraint whenever the previous draft was
   * already inside or close to 920-965 -- see isInOrNearWordCountRange().
   */
  describe("CEFR guidance word-count-preservation constraint (the 964 -> 1269 regression fix)", () => {
    const cefrIssue = { message: "Authoritative enrichment graded this script as cefrLevelMin=B1, cefrLevelMax=B2 -- LinguABC AI-generated podcasts must grade as B2, C1, or C2." };
    // FIX #7: buildCefrGuidance() is now suppressed by buildRetryFeedback()
    // whenever the issues array is a PURE CEFR mismatch (isPureCefrMismatch()
    // -- exactly one issue, the CEFR one) since that scenario now gets its
    // own dedicated buildCefrOnlyRevisionPreamble() instead, and stacking
    // both produced a real, reproduced contradiction (see that function's
    // doc comment). Every test in this block therefore pairs cefrIssue with
    // a second, unrelated issue -- the ONLY shape (CEFR combined with
    // something else) that still reaches buildCefrGuidance() in real
    // production usage; a dedicated block below covers the pure-mismatch
    // suppression itself and the combined-path preservation explicitly.
    const otherIssue = { message: "No genuine interruption found." };

    it("1. adds the word-count constraint when the previous draft is exactly at the real regression's word count (964, in range)", () => {
      const feedback = buildRetryFeedback([cefrIssue, otherIssue], 964);
      expect(feedback).toMatch(/word count \(964\) is already inside or close to the required 920-965 range/i);
      expect(feedback).toMatch(/must not be allowed to push it back out/i);
      expect(feedback).toMatch(/not by adding length/i);
      expect(feedback).toMatch(/do not add new content, new turns, new examples, or new explanations/i);
      expect(feedback).toMatch(/cut an equivalent number of words elsewhere in the same revision/i);
      expect(feedback).toMatch(/preserve the existing script's structure and meaning/i);
      expect(feedback).toMatch(/treat the 920-965 word count as a hard constraint/i);
    });

    it("1b. adds the constraint for a word count merely CLOSE to the range, not just exactly inside it (900, 20 under the 920 floor)", () => {
      const feedback = buildRetryFeedback([cefrIssue, otherIssue], 900);
      expect(feedback).toMatch(/word count \(900\) is already inside or close to the required 920-965 range/i);
    });

    it("1c. adds the constraint just inside the near-range margin above the ceiling (1005, 40 over 965)", () => {
      const feedback = buildRetryFeedback([cefrIssue, otherIssue], 1005);
      expect(feedback).toMatch(/word count \(1005\) is already inside or close to the required 920-965 range/i);
    });

    it("does NOT add the constraint when the previous draft is far from the range (1113, a fresh initial-attempt-sized overshoot)", () => {
      const feedback = buildRetryFeedback([cefrIssue, otherIssue], 1113);
      expect(feedback).not.toMatch(/already inside or close to the required 920-965 range/i);
      expect(feedback).not.toMatch(/must not be allowed to push it back out/i);
    });

    it("does NOT add the constraint when no previousWordCount is supplied at all", () => {
      const feedback = buildRetryFeedback([cefrIssue, otherIssue]);
      expect(feedback).not.toMatch(/already inside or close to the required 920-965 range/i);
    });

    it("2. the original CEFR guidance text is fully preserved even when the constraint fires (addition, not replacement)", () => {
      const feedback = buildRetryFeedback([cefrIssue, otherIssue], 964);
      expect(feedback).toMatch(/independently graded BELOW the required B2\+ standard/i);
      expect(feedback).toMatch(/raise vocabulary sophistication/i);
      expect(feedback).toMatch(/conditional\/subordinate-clause sentence structures/i);
      expect(feedback).toMatch(/do not just relabel the same simple script or change the self-reported level field/i);
    });

    it("2b. the original CEFR guidance text is byte-identical whether or not previousWordCount is passed (out-of-range case)", () => {
      const withoutCount = buildRetryFeedback([cefrIssue, otherIssue]);
      const withFarCount = buildRetryFeedback([cefrIssue, otherIssue], 1113);
      expect(withoutCount).toBe(withFarCount);
    });

    it("3. does not leak into or alter a co-occurring word-count issue's own guidance", () => {
      const feedback = buildRetryFeedback(
        [{ message: "Word count 1269 is outside the acceptable 920-965 range." }, cefrIssue],
        1269,
      );
      // 1269 is far outside the near-range margin, so the constraint must
      // not fire even though a previousWordCount was supplied -- the
      // ordinary large-overshoot word-count guidance is untouched.
      expect(feedback).toMatch(/cut approximately 319-334 spoken words/i);
      expect(feedback).not.toMatch(/already inside or close to the required 920-965 range/i);
    });

    it("4. is level-agnostic -- fires identically regardless of which CEFR level was requested (B2 vs C1 grading messages)", () => {
      const b2Issue = { message: "Authoritative enrichment graded this script as cefrLevelMin=A2, cefrLevelMax=B1 -- requested level was B2." };
      const c1Issue = { message: "Authoritative enrichment graded this script as cefrLevelMin=B1, cefrLevelMax=B2 -- requested level was C1." };
      const b2Feedback = buildRetryFeedback([b2Issue, otherIssue], 964);
      const c1Feedback = buildRetryFeedback([c1Issue, otherIssue], 964);
      expect(b2Feedback).toMatch(/word count \(964\) is already inside or close to the required 920-965 range/i);
      expect(c1Feedback).toMatch(/word count \(964\) is already inside or close to the required 920-965 range/i);
    });
  });

  /**
   * FIX #7: the actual gating change at buildRetryFeedback()'s call site --
   * verified directly here (not just indirectly through
   * buildCefrOnlyRevisionPreamble()'s own describe block above), since this
   * is the exact mechanism that removes the real, reproduced contradiction
   * (buildCefrGuidance()'s "discuss a genuinely complex or abstract angle"
   * sitting next to the dedicated preamble's "do NOT add any new... content
   * of any kind").
   */
  describe("Fix #7: buildCefrGuidance() is suppressed for a PURE CEFR mismatch, unchanged for a combined one", () => {
    const cefrIssue = { message: "Authoritative enrichment graded this script as cefrLevelMin=B1, cefrLevelMax=B2 -- LinguABC AI-generated podcasts must grade as B2, C1, or C2." };
    const otherIssue = { message: "No genuine interruption found." };

    it("a PURE CEFR mismatch (issues.length === 1) never receives buildCefrGuidance()'s text, regardless of previousWordCount", () => {
      const withCount = buildRetryFeedback([cefrIssue], 964);
      const withoutCount = buildRetryFeedback([cefrIssue]);
      for (const feedback of [withCount, withoutCount]) {
        expect(feedback).not.toMatch(/raise vocabulary sophistication/i);
        expect(feedback).not.toMatch(/discuss a genuinely complex or abstract angle/i);
        expect(feedback).not.toMatch(/already inside or close to the required 920-965 range/i);
      }
    });

    it("a CEFR mismatch COMBINED with any other issue still receives buildCefrGuidance()'s text, completely unchanged", () => {
      const feedback = buildRetryFeedback([cefrIssue, otherIssue], 964);
      expect(feedback).toMatch(/raise vocabulary sophistication/i);
      expect(feedback).toMatch(/discuss a genuinely complex or abstract angle/i);
      expect(feedback).toMatch(/already inside or close to the required 920-965 range/i);
    });

    // The real end-to-end integration case (generateEpisodeScript()'s
    // actual preamble selection agreeing with this gating in one real
    // message) is covered in the "generateEpisodeScript — single
    // authoritative enrichment grading" describe block below, where
    // REQUEST_B2/buildValidScriptOutput()/fakeEnrichment() are in scope --
    // see "treats a below-B2 enrichment grade as a retry-worthy failure...".
  });

  /**
   * 3. Proves the new previousWordCount parameter is scoped ONLY to CEFR
   * guidance -- every other issue category's guidance (prosody,
   * interruption, opening structure, markdown, plain word-count-only) is
   * byte-identical whether or not a previousWordCount is supplied, and
   * never mentions the new CEFR word-count-preservation wording.
   */
  describe("other retry categories are unaffected by the new previousWordCount parameter", () => {
    it("prosody-only guidance is unchanged by passing previousWordCount", () => {
      const issue = { message: "Prosody density 1.61/100 words is far below the ~4-6 target -- prosody rules were not followed." };
      expect(buildRetryFeedback([issue])).toBe(buildRetryFeedback([issue], 964));
    });

    it("interruption-only guidance is unchanged by passing previousWordCount", () => {
      const issue = { message: "No genuine interruption found." };
      expect(buildRetryFeedback([issue])).toBe(buildRetryFeedback([issue], 940));
    });

    it("opening-structure-only guidance is unchanged by passing previousWordCount", () => {
      const issue = { message: "Ben's introduction occurs at 98.7% through the script -- must be within the first 25%." };
      expect(buildRetryFeedback([issue])).toBe(buildRetryFeedback([issue], 950));
    });

    it("markdown-only guidance is unchanged by passing previousWordCount", () => {
      const issue = { message: "Found markdown-style emphasis markers that would be read aloud literally (use [emphasis] instead): *just*" };
      expect(buildRetryFeedback([issue])).toBe(buildRetryFeedback([issue], 945));
    });

    it("word-count-only guidance (no CEFR issue) is unchanged by passing previousWordCount", () => {
      const issue = { message: "Word count 1005 is outside the acceptable 920-965 range." };
      expect(buildRetryFeedback([issue])).toBe(buildRetryFeedback([issue], 1005));
    });

    it("none of these categories' feedback ever contains the CEFR word-count-preservation wording", () => {
      const issues = [
        { message: "Prosody density 1.61/100 words is far below the ~4-6 target -- prosody rules were not followed." },
        { message: "No genuine interruption found." },
        { message: "Ben's introduction occurs at 98.7% through the script -- must be within the first 25%." },
        { message: "Found markdown-style emphasis markers that would be read aloud literally (use [emphasis] instead): *just*" },
        { message: "Word count 1005 is outside the acceptable 920-965 range." },
      ];
      for (const issue of issues) {
        const feedback = buildRetryFeedback([issue], 940);
        expect(feedback).not.toMatch(/already inside or close to the required 920-965 range/i);
      }
    });
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
 * FIX #12 (INITIAL-PROMPT SCOPE-VS-LENGTH RECALIBRATION): a read-only audit
 * confirmed the 920-965 word gate, the 300-360s duration gate, and the real
 * Fish Audio rate calibration are ALL correct and internally consistent --
 * the actual root cause of real initial drafts repeatedly landing at
 * 1150-1230 words was the initial prompt itself asking for too much
 * qualitative richness (a full multi-part opening, a mandatory interruption,
 * a six-stage prosody arc, and up to seven "conversational feature"
 * categories including two ambiguously-worded "at least one" requirements)
 * to realistically fit inside its own stated 935-950 word target. This fix
 * touches ONLY buildPrompt()'s LENGTH, CONVERSATIONAL FEATURES, PROSODY, and
 * ENDING guidance text -- never the 920-965/300-360s constants, the Fish
 * Audio rate calibration, any correction mechanism (Fix #4-#11), CEFR
 * grading, audio generation, or publishing.
 */
describe("buildPrompt — Fix #12: LENGTH is the dominant constraint, CONVERSATIONAL FEATURES is optional texture", () => {
  const request: ScriptGenerationRequest = {
    speaker0Name: "Sarah",
    speaker1Name: "Hannah",
    cefrLevel: "B2",
    usedTitles: [],
    usedTopicTags: [],
  };

  it("A: explicitly states that the 935-950 target outranks every optional element, and names it upfront", () => {
    const prompt = buildPrompt(request);
    expect(prompt).toMatch(/LENGTH: READ THIS FIRST -- IT OUTRANKS EVERY OTHER SECTION/i);
    expect(prompt).toMatch(/THE 935-950 TARGET OUTRANKS EVERY OPTIONAL ELEMENT IN THIS PROMPT/i);
    expect(prompt).toMatch(/CONVERSATIONAL FEATURES below is a menu of OPTIONAL texture, not a checklist to complete in full/i);
    expect(prompt).toMatch(/If including everything in that section would push you past 950 words, include fewer of them/i);
  });

  it("B: cites the real observed 1150-1230 word overshoot as the concrete failure mode to avoid", () => {
    const prompt = buildPrompt(request);
    expect(prompt).toMatch(/repeatedly landed at 1150-1230 words/i);
  });

  it("C: still protects the word-count FLOOR explicitly -- trimming optional content must not cause an undershoot", () => {
    const prompt = buildPrompt(request);
    expect(prompt).toMatch(/do not cut so much optional texture that you drop under 930/i);
    expect(prompt).toMatch(/both edges of 920-965 are hard requirements, not just the ceiling/i);
  });

  it("D: marks CONVERSATIONAL FEATURES as optional texture and caps it at two or three, never all of them", () => {
    const prompt = buildPrompt(request);
    expect(prompt).toMatch(/CONVERSATIONAL FEATURES \(OPTIONAL TEXTURE -- SEE LENGTH ABOVE\)/i);
    expect(prompt).toMatch(/Naturally work in TWO OR THREE of the following.*never all of them/i);
    // The two most expensive, ambiguously-mandatory-sounding items from the
    // old wording (personal example/story, callback) are now explicitly
    // named as the first to cut when near the ceiling.
    expect(prompt).toMatch(/a personal example\/story and a callback cost the most words, so if you are already near 950 words, drop one of those two first/i);
  });

  it("E: every genuinely non-negotiable structural requirement is still present and still marked MANDATORY/NON-NEGOTIABLE", () => {
    const prompt = buildPrompt(request);
    // Hook + opening block position.
    expect(prompt).toMatch(/Start with an original, specific hook/i);
    expect(prompt).toMatch(/MANDATORY, NON-NEGOTIABLE: this entire introduction block .* MUST occur within the FIRST FEW TURNS/i);
    // Both self-introductions, by exact name.
    expect(prompt).toContain(`"Sarah: I'm Sarah."`);
    expect(prompt).toContain(`"Hannah: And I'm Hannah."`);
    // LinguABC mention (part of the same opening-block MANDATORY rule).
    expect(prompt).toMatch(/a natural, brief mention that this is LinguABC/i);
    // Interruption pair.
    expect(prompt).toMatch(/MANDATORY, NON-NEGOTIABLE: at least one genuine interruption MUST appear somewhere in the script/i);
    // Closing / sign-off.
    expect(prompt).toMatch(/Then close with a short, natural LinguABC sign-off/i);
    // Prosody cues (mechanical density + no-markdown-emphasis rules).
    expect(prompt).toMatch(/MANDATORY, NON-NEGOTIABLE: target 4-6 meaningful cues per 100 words/i);
    expect(prompt).toMatch(/MANDATORY, NON-NEGOTIABLE: NEVER wrap a word in asterisks or underscores for emphasis/i);
    // Requested CEFR level.
    expect(prompt).toMatch(/This episode MUST be written at genuine CEFR B2 English/i);
    // Natural conversational (turn-length) structure is untouched.
    expect(prompt).toMatch(/CRITICAL TURN-STRUCTURE RULE/i);
    expect(prompt).toMatch(/NEVER alternate speaker after every single sentence like a ping-pong pattern/i);
  });

  it("F: no longer contains the old instructions that actively encouraged elaboration past the word target", () => {
    const prompt = buildPrompt(request);
    // The old floor-protection sentence doubled as a license to keep adding
    // content past "structural completion" -- directly in tension with the
    // 965 ceiling. It is gone; floor protection is now handled by test C's
    // assertions instead, without an open-ended "extend it" instruction.
    expect(prompt).not.toMatch(/extend the conversation with more genuine content/i);
    expect(prompt).not.toMatch(/rather than stopping once the structural beats are covered/i);
    // The old CONVERSATIONAL FEATURES wording made self-correction and the
    // callback sound individually mandatory ("at least one ... and at least
    // ONE callback"), on top of five other unbounded items -- replaced by
    // the explicit two-or-three cap in test D.
    expect(prompt).not.toMatch(/and at least ONE callback near the end to something specific mentioned earlier/i);
    // The old six-stage prosody arc implied needing enough turns/duration to
    // authentically pass through all six named energies.
    expect(prompt).not.toMatch(/calm -> curious -> amused -> energetic -> reflective -> quiet/i);
    expect(prompt).toMatch(/two or three genuine shifts are enough/i);
  });

  it("G: does not remove or weaken any CEFR requirement -- CEFR_LEVEL_GUIDANCE content is untouched for every level", () => {
    const b2Prompt = buildPrompt(request);
    expect(b2Prompt).toMatch(/this must clearly clear B1, not sit at its edge/i);
    expect(b2Prompt).toMatch(/This script is independently graded against that exact bar after generation/i);

    const c1Prompt = buildPrompt({ ...request, cefrLevel: "C1" });
    expect(c1Prompt).toMatch(/More sophisticated vocabulary and less-common idiomatic expressions used naturally/i);

    const c2Prompt = buildPrompt({ ...request, cefrLevel: "C2" });
    expect(c2Prompt).toMatch(/Near-native fluency: precise, idiomatic, occasionally playful with language/i);
    expect(c2Prompt).toMatch(/This is the hardest tier LinguABC produces -- do not pull punches to make it easier/i);
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
 * Regression coverage for the word-count CONVERGENCE fix (distinct from
 * the cut-SIZE fix above): a real diagnostic run captured every full draft
 * across a real 6-attempt failure and diffed them turn-by-turn. Every cut,
 * large and small alike, was a cosmetic word/phrase trim (an article, an
 * adverb, a short qualifying phrase) -- zero turns or sentences were ever
 * deleted, even when 100-300+ words still needed removing, and the single
 * longest turn in the script (a ~110-word personal anecdote) survived
 * completely untouched through all 15 real drafts. The requested cut
 * RANGE was already correct (see the tests above); the problem was the
 * METHOD instruction ("trim sentences and phrases within turns, don't
 * just delete whole turns") never permitting a cut large enough to close
 * a 100+ word gap. buildCutMethodGuidance() now requires substantially
 * shortening or removing ONE non-essential turn whenever the needed cut
 * is large (past NEAR_CEILING_OVERSHOOT_LIMIT, the same boundary already
 * used above) -- a near-ceiling cut is untouched, still phrase-trim-only.
 */
describe("buildCutMethodGuidance / large-overage compression (the convergence fix)", () => {
  it("a large overshoot (1026 words, just past the boundary) requires cutting one whole non-essential turn", () => {
    const feedback = buildRetryFeedback([{ message: "Word count 1026 is outside the acceptable 920-965 range." }]);
    expect(feedback).toMatch(/TOO LARGE to reach through word- and phrase-level trims alone/i);
    expect(feedback).toMatch(/find the SINGLE longest turn in the script/i);
    expect(feedback).toMatch(/personal example, story, extended explanation, or other non-essential aside/i);
    expect(feedback).toMatch(/remove at least half of it, or cut it entirely/i);
    // The turns explicitly protected from this cut.
    expect(feedback).toMatch(/never the hook, the self-introductions, the LinguABC mention, or the interruption pair/i);
  });

  it("does NOT require a whole-turn cut for a near-ceiling overshoot (1025 words, at the boundary)", () => {
    const feedback = buildRetryFeedback([{ message: "Word count 1025 is outside the acceptable 920-965 range." }]);
    expect(feedback).not.toMatch(/TOO LARGE to reach through word- and phrase-level trims alone/i);
    expect(feedback).not.toMatch(/find the SINGLE longest turn/i);
    expect(feedback).toMatch(/Trim sentences and phrases within turns, don't just delete whole turns/i);
  });

  it("does NOT require a whole-turn cut for any near-ceiling value (1000, 1015 words)", () => {
    expect(buildRetryFeedback([{ message: "Word count 1000 is outside the acceptable 920-965 range." }])).not.toMatch(/find the SINGLE longest turn/i);
    expect(buildRetryFeedback([{ message: "Word count 1015 is outside the acceptable 920-965 range." }])).not.toMatch(/find the SINGLE longest turn/i);
  });

  it("requires the whole-turn cut for every confirmed real large overshoot (1032, 1087, 1181)", () => {
    expect(buildRetryFeedback([{ message: "Word count 1032 is outside the acceptable 920-965 range." }])).toMatch(/find the SINGLE longest turn/i);
    expect(buildRetryFeedback([{ message: "Word count 1087 is outside the acceptable 920-965 range." }])).toMatch(/find the SINGLE longest turn/i);
    expect(buildRetryFeedback([{ message: "Word count 1181 is outside the acceptable 920-965 range." }])).toMatch(/find the SINGLE longest turn/i);
  });

  it("still requires the whole-turn cut for the real 964 -> 1269 CEFR-regression overshoot (304 over)", () => {
    const feedback = buildRetryFeedback([{ message: "Word count 1269 is outside the acceptable 920-965 range." }]);
    expect(feedback).toMatch(/find the SINGLE longest turn/i);
    expect(feedback).toMatch(/cut approximately 319-334 spoken words/i);
  });

  it("undershoot guidance (adding words) is completely unaffected -- it never mentions cutting a turn", () => {
    const feedback = buildRetryFeedback([{ message: "Word count 856 is outside the acceptable 920-965 range." }]);
    expect(feedback).not.toMatch(/find the SINGLE longest turn/i);
    expect(feedback).not.toMatch(/TOO LARGE to reach through word- and phrase-level trims alone/i);
  });
});

/**
 * buildRevisionPreamble()'s own "leave every turn, line, joke, example...
 * completely unchanged" framing directly contradicts the whole-turn cut
 * buildCutMethodGuidance() now requires for a large overshoot -- both are
 * sent in the SAME message on a normal (non-dedicated-correction-pass)
 * revision attempt. This is the preamble-level half of the convergence
 * fix: an explicit, narrowly-gated exception is appended only when the
 * previous attempt's issues include a large word-count overshoot.
 */
describe("buildRevisionPreamble — largeCutNeeded exception (the convergence fix)", () => {
  it("defaults to false: identical output to calling with no argument at all (byte-for-byte)", () => {
    expect(buildRevisionPreamble()).toBe(buildRevisionPreamble(false));
  });

  it("with no argument, never mentions the large-cut exception (existing behavior fully preserved)", () => {
    const preamble = buildRevisionPreamble();
    expect(preamble).not.toMatch(/EXCEPTION for this revision/i);
    expect(preamble).toMatch(/leave every turn, line, joke, example, and structural element that was NOT flagged completely unchanged/i);
  });

  it("when largeCutNeeded is true, appends an exception permitting the one whole-turn cut, without removing the original framing", () => {
    const preamble = buildRevisionPreamble(true);
    // Original framing still present in full.
    expect(preamble).toMatch(/EXACT script you wrote last time/i);
    expect(preamble).toMatch(/leave every turn, line, joke, example, and structural element that was NOT flagged completely unchanged/i);
    // New exception appended.
    expect(preamble).toMatch(/EXCEPTION for this revision/i);
    expect(preamble).toMatch(/substantially shortening or removing it is REQUIRED here/i);
    expect(preamble).toMatch(/not a violation of "smallest possible targeted edits/i);
    // Everything else unflagged still protected, including opening/interruption.
    expect(preamble).toMatch(/every other unflagged turn, line, and structural element/i);
    expect(preamble).toMatch(/including the opening block and interruption if they already passed/i);
  });

  it("largeCutNeeded=true output starts with the exact same base text as the default call", () => {
    const base = buildRevisionPreamble();
    const withException = buildRevisionPreamble(true);
    expect(withException.startsWith(base)).toBe(true);
  });
});

/**
 * Regression coverage for the CEFR-REGRESSION fix (distinct from the
 * word-count-compression fix above, which must NOT be touched by this
 * one): a real diagnostic run captured the exact message sent for a PURE
 * CEFR mismatch (a 960-word draft that passed every structural check but
 * failed authoritative CEFR grading) and found a direct, live
 * contradiction inside it -- buildRevisionPreamble()'s own "leave every
 * turn, line, joke, example... completely unchanged... same wording
 * wherever it already worked" sitting immediately next to
 * buildCefrGuidance()'s "Genuinely rewrite the language." The real
 * revision that resulted grew to 994 words with no new content anywhere --
 * every turn rewritten with more Latinate/nominalized phrasing for the
 * SAME ideas ("asking for forgiveness" -> "an appeal for forbearance").
 *
 * buildCefrOnlyRevisionPreamble() is a SEPARATE preamble used INSTEAD of
 * buildRevisionPreamble() only for a pure CEFR mismatch (see
 * isPureCefrMismatch(), tested indirectly below through
 * generateEpisodeScript() since it is not exported, matching this file's
 * existing convention for isLargeWordCountCutNeeded()).
 */
describe("buildCefrOnlyRevisionPreamble — dedicated CEFR-mismatch revision framing (the 960 -> 994 regression fix)", () => {
  it("does NOT contain the minimal-edit preamble's wording-protection language", () => {
    const preamble = buildCefrOnlyRevisionPreamble();
    expect(preamble).not.toMatch(/same wording wherever it already worked/i);
    expect(preamble).not.toMatch(/leave every turn, line, joke, example, and structural element that was NOT flagged completely unchanged/i);
    expect(preamble).not.toMatch(/smallest possible targeted edits/i);
  });

  it("explicitly protects content but explicitly UNPROTECTS wording", () => {
    const preamble = buildCefrOnlyRevisionPreamble();
    expect(preamble).toMatch(/Preserve the facts, topic, meaning, structure, speaker personalities, and existing examples/i);
    expect(preamble).toMatch(/wording is NOT protected here/i);
    expect(preamble).toMatch(/you are REQUIRED to rewrite existing sentences/i);
  });

  it("contains the 920-965 hard word-count constraint, framed as a simultaneous requirement", () => {
    const preamble = buildCefrOnlyRevisionPreamble();
    expect(preamble).toMatch(/MUST remain inside the existing 920-965 word range/i);
    expect(preamble).toMatch(/shorten a different existing sentence elsewhere in this SAME revision by approximately N words/i);
    // Compensation is word-level tightening only, never content removal --
    // and the 920 floor is protected as explicitly as the 965 ceiling.
    expect(preamble).toMatch(/never by cutting a fact, an example, or a turn to pay the difference/i);
    expect(preamble).toMatch(/both the 920 floor and the 965 ceiling are equally hard limits/i);
    expect(preamble).toMatch(/must satisfy BOTH the CEFR requirement and the 920-965 word count simultaneously/i);
  });

  it("tells the model not to add content of any kind, and not to reframe the discussion toward a more complex angle", () => {
    const preamble = buildCefrOnlyRevisionPreamble();
    expect(preamble).toMatch(/do NOT add any new facts, examples, explanations, turns, or content/i);
    // Fix #7: the contamination this removes (buildCefrGuidance()'s "discuss
    // a genuinely complex or abstract angle... instead of a simple personal
    // anecdote") directly contradicted this -- see buildRetryFeedback()'s
    // gating change and the "pure CEFR mismatch never receives..." test below.
    expect(preamble).toMatch(/do NOT reframe the discussion toward a "more complex" or "more abstract" angle/i);
  });

  it("frames the task as substitution/compression, not expansion, and names nominalization and periphrastic expansion by name as the failure modes to avoid (Fix #7)", () => {
    const preamble = buildCefrOnlyRevisionPreamble();
    expect(preamble).toMatch(/Treat this as SUBSTITUTION and COMPRESSION, not expansion/i);
    expect(preamble).toMatch(/Raise the register ONLY through: more precise or specific word choice/i);
    expect(preamble).toMatch(/nominalization -- turning a verb or adjective into an abstract noun for its own sake/i);
    expect(preamble).toMatch(/periphrastic expansion -- using more words to express the same idea/i);
    // The exact real-world failure examples this fix was written from.
    expect(preamble).toMatch(/"I know exactly what you mean" -> "I comprehend precisely what you signify"/i);
    expect(preamble).toMatch(/"I get that" -> "I apprehend that distinction"/i);
    expect(preamble).toMatch(/Strongly prefer substitutions that are the SAME LENGTH or SHORTER than what they replace/i);
    expect(preamble).toMatch(/mentally recount the final spoken word total \(excluding bracket prosody cues\) and confirm it is between 920 and 965/i);
  });

  it("prioritizes substitution-only (no expansion anywhere) once the previous draft is already close to the 965 ceiling, explicitly overriding the general compensation allowance", () => {
    const nearCeiling = buildCefrOnlyRevisionPreamble(952);
    expect(nearCeiling).toMatch(/This draft is already at 952 words, close to the 965 ceiling -- this OVERRIDES the compensation allowance above: do NOT expand ANYWHERE in this revision/i);

    const farFromCeiling = buildCefrOnlyRevisionPreamble(925);
    expect(farFromCeiling).not.toMatch(/close to the 965 ceiling/i);

    const noWordCountGiven = buildCefrOnlyRevisionPreamble();
    expect(noWordCountGiven).not.toMatch(/close to the 965 ceiling/i);
  });

  it("protects required branding and structural elements even though wording is otherwise unprotected", () => {
    const preamble = buildCefrOnlyRevisionPreamble();
    expect(preamble).toMatch(/Do not merge, shorten, or remove the required LinguABC branding, the self-introductions, the opening hook, or the interruption pair merely to save words/i);
  });

  it("still requires the full script to be returned, not a diff or summary", () => {
    const preamble = buildCefrOnlyRevisionPreamble();
    expect(preamble).toMatch(/return the FULL script \(every turn, not a diff/i);
  });

  it("the existing non-CEFR revision preamble (buildRevisionPreamble) remains byte-identical to before this fix", () => {
    // Unchanged calls, unchanged output -- this fix added a NEW function,
    // it did not modify buildRevisionPreamble() itself.
    expect(buildRevisionPreamble()).toMatch(/same wording wherever it already worked/i);
    expect(buildRevisionPreamble()).toMatch(/leave every turn, line, joke, example, and structural element that was NOT flagged completely unchanged/i);
    expect(buildRevisionPreamble()).not.toMatch(/wording is NOT protected here/i);
    expect(buildRevisionPreamble()).not.toMatch(/SUBSTITUTION and COMPRESSION/i);
    expect(buildRevisionPreamble(true)).not.toMatch(/wording is NOT protected here/i);
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
    // a metadata-relabeling instruction. The issue itself is still listed
    // (via buildRetryFeedback()'s bullet list, unaffected by Fix #7).
    const revisionPrompt = secondCall.messages[2].content as string;
    expect(revisionPrompt).toMatch(/Authoritative enrichment graded this script as cefrLevelMin=B1/i);

    // CEFR-REGRESSION fix: a PURE CEFR mismatch (this is the only issue --
    // buildValidScriptOutput() passes every structural check) must use the
    // dedicated buildCefrOnlyRevisionPreamble(), NOT buildRevisionPreamble().
    expect(revisionPrompt).toMatch(/wording is NOT protected here/i);
    expect(revisionPrompt).toMatch(/Treat this as SUBSTITUTION and COMPRESSION, not expansion/i);
    expect(revisionPrompt).not.toMatch(/same wording wherever it already worked/i);
    expect(revisionPrompt).not.toMatch(/smallest possible targeted edits/i);

    // FIX #7: buildCefrGuidance()'s generic text (meant for a CEFR mismatch
    // COMBINED with other issues) must NOT also appear here -- stacking it
    // with the dedicated preamble is the real, reproduced contradiction this
    // fix removes ("discuss a genuinely complex or abstract angle... instead
    // of a simple personal anecdote" directly contradicts the dedicated
    // preamble's "do NOT add any new... content of any kind").
    expect(revisionPrompt).not.toMatch(/independently graded BELOW the required B2\+ standard/i);
    expect(revisionPrompt).not.toMatch(/raise vocabulary sophistication/i);
    expect(revisionPrompt).not.toMatch(/discuss a genuinely complex or abstract angle/i);
    expect(revisionPrompt).not.toMatch(/do not just relabel the same simple script or change the self-reported level field/i);

    // FIX #7: buildValidScriptOutput() lands at >=950 words (>940, the
    // near-ceiling threshold) -- close to the real reproduced 952-word
    // case -- so the real revision prompt must carry the "no expansion
    // anywhere" ceiling note, not the plain (far-from-ceiling) preamble.
    const realPreviousWordCount = countWords(buildValidScriptOutput().turns);
    expect(realPreviousWordCount).toBeGreaterThan(940);
    expect(revisionPrompt).toMatch(new RegExp(`This draft is already at ${realPreviousWordCount} words, close to the 965 ceiling`, "i"));
  });

  it("a PURE CEFR mismatch at a different requested level (C1) also gets the dedicated CEFR-only preamble -- level-agnostic", async () => {
    // cefrLevel overridden to match the requested level, so the model's
    // self-report agrees with the request -- the ONLY failure is the
    // authoritative grading below, not a self-report structural mismatch.
    const draftAtC1 = { ...buildValidScriptOutput(), cefrLevel: "C1" as const };
    vi.mocked(generateStructuredJson).mockResolvedValueOnce(draftAtC1).mockResolvedValueOnce(draftAtC1);
    vi.mocked(generateEnrichment)
      .mockResolvedValueOnce(fakeEnrichment({ cefrLevelMin: "B1", cefrLevelMax: "B2" }))
      .mockResolvedValueOnce(fakeEnrichment({ cefrLevelMin: "C1", cefrLevelMax: "C2" }));

    await generateEpisodeScript({ ...REQUEST_B2, cefrLevel: "C1" });

    const revisionPrompt = vi.mocked(generateStructuredJson).mock.calls[1][0].messages[2].content as string;
    expect(revisionPrompt).toMatch(/wording is NOT protected here/i);
    expect(revisionPrompt).not.toMatch(/same wording wherever it already worked/i);
  });

  it("a PURE CEFR mismatch at C2 also gets the dedicated CEFR-only preamble -- level-agnostic", async () => {
    const draftAtC2 = { ...buildValidScriptOutput(), cefrLevel: "C2" as const };
    vi.mocked(generateStructuredJson).mockResolvedValueOnce(draftAtC2).mockResolvedValueOnce(draftAtC2);
    vi.mocked(generateEnrichment)
      .mockResolvedValueOnce(fakeEnrichment({ cefrLevelMin: "B1", cefrLevelMax: "B2" }))
      .mockResolvedValueOnce(fakeEnrichment({ cefrLevelMin: "C2", cefrLevelMax: "C2" }));

    await generateEpisodeScript({ ...REQUEST_B2, cefrLevel: "C2" });

    const revisionPrompt = vi.mocked(generateStructuredJson).mock.calls[1][0].messages[2].content as string;
    expect(revisionPrompt).toMatch(/wording is NOT protected here/i);
    expect(revisionPrompt).not.toMatch(/same wording wherever it already worked/i);
  });

  /**
   * Regression coverage for requirement 4/5 of the CEFR-regression fix:
   * isPureCefrMismatch() must be false the moment ANY other issue
   * co-occurs, so a CEFR self-report mismatch combined with a word-count
   * issue (both come from validateGeneratedScript() together, unlike the
   * authoritative-grading failure which is always alone) must keep using
   * the EXISTING buildRevisionPreamble()/large-cut machinery, never the
   * new pure-CEFR preamble.
   */
  it("a CEFR self-report mismatch COMBINED with a word-count issue does NOT enter the pure-CEFR branch", async () => {
    const combinedFailure: ScriptGenerationOutput = { ...buildValidScriptOutput(), cefrLevel: "C1" }; // wrong self-report vs REQUEST_B2's "B2", AND still needs to fail word count too
    // Force a word-count failure alongside the self-report mismatch by
    // truncating well below the 920 floor.
    const tooShort: ScriptGenerationOutput = { ...combinedFailure, turns: combinedFailure.turns.slice(0, 5) };
    const issues = validateGeneratedScript(tooShort, REQUEST_B2);
    expect(issues.some((i) => /word count/i.test(i.message))).toBe(true);
    expect(issues.some((i) => /Requested CEFR level B2 but the model self-reported C1/i.test(i.message))).toBe(true);

    vi.mocked(generateStructuredJson).mockResolvedValueOnce(tooShort).mockResolvedValueOnce(buildValidScriptOutput());
    vi.mocked(generateEnrichment).mockResolvedValue(fakeEnrichment());

    await generateEpisodeScript(REQUEST_B2);

    const revisionPrompt = vi.mocked(generateStructuredJson).mock.calls[1][0].messages[2].content as string;
    // The EXISTING minimal-edit preamble (or its large-cut exception) is
    // used here, not the new pure-CEFR preamble -- because more than one
    // issue is present.
    expect(revisionPrompt).toMatch(/same wording wherever it already worked|EXCEPTION for this revision/i);
    expect(revisionPrompt).not.toMatch(/wording is NOT protected here/i);
    expect(revisionPrompt).not.toMatch(/Treat this as SUBSTITUTION and COMPRESSION, not expansion/i);
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

    /**
     * Regression coverage for the word-count CONVERGENCE fix's
     * preamble-level half: buildTooLongLowProsodyOutput() is a LARGE
     * overshoot (well over 300 words past the 965 ceiling -- far past
     * NEAR_CEILING_OVERSHOOT_LIMIT) combined with a co-occurring prosody
     * issue, so it fails validation with MORE than word count alone and
     * routes through the normal outer revision path directly (never the
     * dedicated correction pass, which only triggers for a word-count-ONLY
     * failure) -- exactly the shape of the real attempt-1 failure this fix
     * was diagnosed from. The revision message must carry BOTH the
     * whole-turn cut instruction AND buildRevisionPreamble()'s large-cut
     * exception, or the preamble's own "leave every example unchanged"
     * framing would keep contradicting it.
     */
    it("a large overshoot combined with another issue gets BOTH the whole-turn-cut guidance AND the preamble's large-cut exception", async () => {
      const brokenOutput = buildTooLongLowProsodyOutput();
      expect(countWords(brokenOutput.turns)).toBeGreaterThan(965 + 60); // sanity: confirms this fixture is a LARGE overshoot, not near-ceiling
      vi.mocked(generateStructuredJson).mockResolvedValueOnce(brokenOutput).mockResolvedValueOnce(buildValidScriptOutput());
      vi.mocked(generateEnrichment).mockResolvedValue(fakeEnrichment());

      await generateEpisodeScript(REQUEST_B2);

      const revisionPrompt = vi.mocked(generateStructuredJson).mock.calls[1][0].messages[2].content as string;
      // The preamble's large-cut exception (before "PREVIOUS ATTEMPT REJECTED").
      expect(revisionPrompt).toMatch(/EXCEPTION for this revision/i);
      expect(revisionPrompt).toMatch(/substantially shortening or removing it is REQUIRED here/i);
      // The word-count guidance's whole-turn-cut instruction (after it).
      expect(revisionPrompt).toMatch(/find the SINGLE longest turn in the script/i);
      // Original preamble framing is still present, not replaced.
      expect(revisionPrompt).toMatch(/leave every turn, line, joke, example, and structural element that was NOT flagged completely unchanged/i);
    });

    it("a near-ceiling overshoot combined with another issue does NOT get the large-cut exception (regression safety)", async () => {
      // Same fixture family as buildTooLongLowProsodyOutput, but with far
      // fewer filler turns so the overshoot stays within
      // NEAR_CEILING_OVERSHOOT_LIMIT of the 965 ceiling while still also
      // failing prosody density.
      const turns: ScriptGenerationOutput["turns"] = [
        { speaker: 0, text: "[thoughtful] I once forgot my own name for ten seconds after waking up in a strange hotel room, and it genuinely rattled me for the rest of the morning." },
        { speaker: 1, text: "Wait, seriously? That sounds terrifying, not just strange." },
        { speaker: 0, text: "It really was. [break] Anyway, I'm Sarah." },
        { speaker: 1, text: "And I'm Hannah." },
        { speaker: 0, text: "This is LinguABC, and today we're talking about the strange ways memory can fail us even when nothing is actually wrong." },
      ];
      for (let i = 0; i < 30; i++) {
        turns.push({
          speaker: (i % 2) as 0 | 1,
          text: `This is plain filler turn number ${i} with absolutely no prosody cue anywhere in it at all. It just keeps talking about the topic in an ordinary flat way.`,
        });
      }
      turns.push({ speaker: 0, text: "...and honestly I think the whole point is that we—" });
      turns.push({ speaker: 1, text: "—never actually finish that argument? Yeah, I've noticed." });
      turns.push({ speaker: 0, text: "[reflective] Well, that gives us a lot to think about before next time." });
      turns.push({ speaker: 1, text: "It really does. [warm] That has been LinguABC -- thanks for listening, and we will catch you in the next one." });
      const nearCeilingBroken: ScriptGenerationOutput = { title: "Test Episode", topic: "Testing", topicTags: ["Testing"], cefrLevel: "B2", turns };

      const wordCount = countWords(turns);
      expect(wordCount).toBeGreaterThan(965); // still an overshoot...
      expect(wordCount - 965).toBeLessThanOrEqual(60); // ...but within the near-ceiling boundary

      vi.mocked(generateStructuredJson).mockResolvedValueOnce(nearCeilingBroken).mockResolvedValueOnce(buildValidScriptOutput());
      vi.mocked(generateEnrichment).mockResolvedValue(fakeEnrichment());

      await generateEpisodeScript(REQUEST_B2);

      const revisionPrompt = vi.mocked(generateStructuredJson).mock.calls[1][0].messages[2].content as string;
      expect(revisionPrompt).not.toMatch(/EXCEPTION for this revision/i);
      expect(revisionPrompt).not.toMatch(/find the SINGLE longest turn in the script/i);
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

  /**
   * Regression coverage for the dedicated word-count correction pass: a
   * real run overshot to 1180 words with EVERY other check already
   * passing, and the same multi-constraint revision prompt ("lightly
   * edit... nothing else changes" alongside "cut 230+ words" alongside
   * preserving four other categories "exactly as they already are")
   * failed to converge across all 6 attempts. These fixtures use 1201 and
   * 999 words rather than the exact real 1180/1015 -- the precise count
   * is incidental; what matters is landing on the correct side of the
   * large-vs-near-ceiling boundary (965 + NEAR_CEILING_OVERSHOOT_LIMIT),
   * verified directly below rather than assumed.
   */
  describe("generateEpisodeScript — dedicated word-count correction pass", () => {
    /** Cue-rich filler (same templates as buildValidScriptOutput's own,
     * each carrying its own prosody cue) so a large word-count overshoot
     * fixture can be built WITHOUT diluting prosody density the way
     * plain padding would -- keeping this fixture genuinely
     * "word-count-issue-only", never accidentally also failing prosody. */
    function buildCueRichOvershootOutput(targetMinWords: number): ScriptGenerationOutput {
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
      let i = 0;
      while (countWords(turns) < targetMinWords) {
        turns.push({ speaker: (i % 2) as 0 | 1, text: fillerTemplates[i % fillerTemplates.length] });
        i++;
      }
      turns.push({ speaker: 0, text: "...and honestly I think the whole point is that we—" });
      turns.push({ speaker: 1, text: "—never actually finish that argument? Yeah, I've noticed." });
      turns.push({ speaker: 0, text: "[reflective] Well, that gives us a lot to think about before next time." });
      turns.push({ speaker: 1, text: "It really does. [warm] That has been LinguABC -- thanks for listening, and we will catch you in the next one." });
      return { title: "Test Episode", topic: "Testing", topicTags: ["Testing"], cefrLevel: "B2", turns };
    }

    /** Same fixed opening/interruption/closing as above, but plain
     * (no-cue) filler, sized to land IN the 920-965 word range while
     * still failing prosody density -- models "correction fixed the word
     * count but the corrected draft has its own separate issue". */
    function buildInRangeLowProsodyOutput(): ScriptGenerationOutput {
      const turns: ScriptGenerationOutput["turns"] = [
        { speaker: 0, text: "[thoughtful] I once forgot my own name for ten seconds after waking up in a strange hotel room, and it genuinely rattled me for the rest of the morning." },
        { speaker: 1, text: "Wait, seriously? That sounds terrifying, not just strange." },
        { speaker: 0, text: "It really was. [break] Anyway, I'm Sarah." },
        { speaker: 1, text: "And I'm Hannah." },
        { speaker: 0, text: "This is LinguABC, and today we're talking about the strange ways memory can fail us even when nothing is actually wrong." },
      ];
      let i = 0;
      while (countWords(turns) < 880) {
        turns.push({
          speaker: (i % 2) as 0 | 1,
          text: `This is plain filler turn number ${i} with absolutely no prosody cue anywhere in it at all. It just keeps talking about the topic in an ordinary flat way.`,
        });
        i++;
      }
      turns.push({ speaker: 0, text: "...and honestly I think the whole point is that we—" });
      turns.push({ speaker: 1, text: "—never actually finish that argument? Yeah, I've noticed." });
      turns.push({ speaker: 0, text: "[reflective] Well, that gives us a lot to think about before next time." });
      turns.push({ speaker: 1, text: "It really does. [warm] That has been LinguABC -- thanks for listening, and we will catch you in the next one." });
      return { title: "Test Episode", topic: "Testing", topicTags: ["Testing"], cefrLevel: "B2", turns };
    }

    const LARGE_OVERSHOOT = buildCueRichOvershootOutput(1150); // lands at 1201 words -- 240 over the 965 ceiling, well past NEAR_CEILING_OVERSHOOT_LIMIT (60)
    const NEAR_CEILING_OVERSHOOT = buildCueRichOvershootOutput(940); // lands at 999 words -- 38 over the 965 ceiling, within NEAR_CEILING_OVERSHOOT_LIMIT (60), in the "meaningful" (11-60) band
    const SMALL_OVERSHOOT = buildCueRichOvershootOutput(900); // lands at 967 words -- 2 over the 965 ceiling, in the "small" (1-10) band -- matches the real confirmed no-ops (966->966, 969->969) in magnitude

    /** Adjusts a fixture's word count to an EXACT target by adding/removing
     * single plain-word tokens from one real filler turn (never a
     * protected opening/interruption/closing turn) -- for exercising the
     * final-boundary band's exact 1-10-over targets precisely, rather than
     * whatever count a filler-template cycle happens to land on. Defaults
     * to turn index 5 (the first filler turn, and every fixture's
     * consistently-selected target -- see selectLargeCutTarget()'s tests);
     * an explicit idx lets meaningful-band tests adjust a DIFFERENT turn so
     * turn 5 -- and therefore WHICH turn gets selected -- stays untouched. */
    function withExactWordCount(base: ScriptGenerationOutput, targetCount: number, idx: number = 5): ScriptGenerationOutput {
      const turns = base.turns.map((t) => ({ ...t }));
      let diff = targetCount - countWords(turns);
      while (diff > 0) {
        turns[idx] = { ...turns[idx], text: `${turns[idx].text} extra` };
        diff -= 1;
      }
      while (diff < 0) {
        const words = turns[idx].text.split(/\s+/).filter(Boolean);
        if (words.length === 0) break; // safety -- turn exhausted, avoid an infinite loop (popping "" forever is falsy and never advances diff)
        const popped = words.pop();
        turns[idx] = { ...turns[idx], text: words.join(" ") };
        // A bracket-only token (e.g. "[curious]") is stripped entirely by
        // countWords() -- it was never counted as a word, so popping it
        // must not count toward the removal budget either, or the final
        // total silently drifts by however many cue tokens got consumed.
        if (popped && !/^\[.*\]$/.test(popped)) diff += 1;
      }
      return { ...base, turns };
    }

    /** Adjusts a fixture's total word count to an EXACT overshoot (965 +
     * targetOvershoot) WITHOUT ever letting any turn other than turn 5 grow
     * to 32+ words -- so selectLargeCutTarget() keeps selecting the same
     * turn 5 ("Sarah", 32 words) regardless of the fixture's total
     * overshoot, for meaningful-band tests that need a precise 11/17/30/60
     * deficit. Shrinks the last filler turn (turns.length - 5, just before
     * the interruption pair) word-by-word for a negative diff -- always
     * safe, since it only makes that turn shorter, never a rival to turn
     * 5's length. For a positive diff (needed for the 60-over case, since
     * NEAR_CEILING_OVERSHOOT starts at 999 = 34 over), inserts new short
     * filler turns (capped at 5 words each, well under turn 5's 32) instead
     * of growing one turn without bound, which would eventually outgrow and
     * replace turn 5 as the selected target. */
    function withExactOvershootPreservingTarget(base: ScriptGenerationOutput, targetOvershoot: number): ScriptGenerationOutput {
      const targetCount = 965 + targetOvershoot;
      const turns = base.turns.map((t) => ({ ...t }));
      let diff = targetCount - countWords(turns);
      const lastFillerIdx = () => turns.length - 5;
      while (diff < 0) {
        const idx = lastFillerIdx();
        const words = turns[idx].text.split(/\s+/).filter(Boolean);
        if (words.length === 0) break; // safety -- avoid an infinite loop if the turn is ever exhausted (a bare split() on "" yields [""], not [], which would never trip a naive length check)
        const popped = words.pop();
        turns[idx] = { ...turns[idx], text: words.join(" ") };
        if (popped && !/^\[.*\]$/.test(popped)) diff += 1; // see withExactWordCount()'s comment: a bracket-only token isn't a counted word
      }
      let i = 0;
      while (diff > 0) {
        const addNow = Math.min(diff, 5);
        turns.splice(lastFillerIdx() + 1, 0, { speaker: (i % 2) as 0 | 1, text: Array.from({ length: addNow }, () => "extra").join(" ") });
        diff -= addNow;
        i += 1;
      }
      return { ...base, turns };
    }

    it("fixture sanity check: both overshoot fixtures fail ONLY word count, on the intended side of the near-ceiling boundary", () => {
      const largeIssues = validateGeneratedScript(LARGE_OVERSHOOT, REQUEST_B2);
      expect(largeIssues).toHaveLength(1);
      expect(largeIssues[0].message).toMatch(/^Word count 1201 is outside/);

      const nearIssues = validateGeneratedScript(NEAR_CEILING_OVERSHOOT, REQUEST_B2);
      expect(nearIssues).toHaveLength(1);
      expect(nearIssues[0].message).toMatch(/^Word count 999 is outside/);
    });

    it("fixture sanity check: the in-range low-prosody script fails ONLY prosody density", () => {
      const issues = validateGeneratedScript(buildInRangeLowProsodyOutput(), REQUEST_B2);
      expect(issues).toHaveLength(1);
      expect(issues[0].message).toMatch(/^Prosody density [\d.]+\/100 words is far below/);
    });

    it("A: a large overshoot (1201 words) is corrected via a dedicated, separate call, and the corrected ~950-word draft is accepted", async () => {
      vi.mocked(generateStructuredJson).mockResolvedValueOnce(LARGE_OVERSHOOT).mockResolvedValueOnce(buildValidScriptOutput());
      vi.mocked(generateEnrichment).mockResolvedValue(fakeEnrichment());

      const result = await generateEpisodeScript(REQUEST_B2);

      expect(result.wordCount).toBe(950);
      expect(result.attempts).toBe(1); // the correction pass does not consume an outer MAX_ATTEMPTS slot
      expect(vi.mocked(generateStructuredJson)).toHaveBeenCalledTimes(2);

      const correctionCall = vi.mocked(generateStructuredJson).mock.calls[1][0];
      expect(correctionCall.schemaName).toBe("linguabc_podcast_script_word_count_correction");
      expect(correctionCall.messages).toHaveLength(1);
      const correctionPrompt = correctionCall.messages[0].content as string;
      expect(correctionPrompt).toMatch(/DEDICATED WORD-COUNT CORRECTION/i);
      expect(correctionPrompt).toContain("Current spoken word count: 1201");
      expect(correctionPrompt).toContain("Target for this correction: 935-950 words");
      expect(correctionPrompt).toMatch(/Cut approximately 251-266 spoken words/i);
      expect(correctionPrompt).toContain("CUT ONLY");
      // Narrow and separate: never the full multi-category revision prompt.
      expect(correctionPrompt).not.toContain("PREVIOUS ATTEMPT REJECTED");
      expect(correctionPrompt).not.toMatch(/prosody density/i);
      // DETERMINISTIC LARGE-CUT TARGET SELECTION fix: a cut this large
      // (251-266 words) must name a specific, deterministically-selected
      // turn instead of asking the model to search for one -- see
      // selectLargeCutTarget()'s doc comment for the real diagnostic
      // evidence this addresses. LARGE_OVERSHOOT's longest eligible turn
      // is turn #5 (Sarah, 32 words, the first filler turn).
      expect(correctionPrompt).toMatch(/cut target has ALREADY BEEN IDENTIFIED for you -- you do not need to search the script/i);
      expect(correctionPrompt).toMatch(/Turn #5 \(Sarah, 32 words\) is the designated cut target/i);
      expect(correctionPrompt).toMatch(/Substantially shorten this turn -- remove at least half of it/i);
      expect(correctionPrompt).not.toMatch(/find the SINGLE longest turn in the script/i);
    });

    /**
     * Regression coverage for a real defect found during this fix's own
     * doubt-driven-development adversarial review: buildDeterministicLargeCutInstruction()
     * originally sliced the target turn's text at a fixed character length
     * (140) with no awareness of bracket prosody cues -- a cut point that
     * happened to land inside an unclosed "[...]" pair would show the model
     * a visibly malformed preview (e.g. "...[emph") in its own prompt. The
     * fix (truncatePreview()) backs the cut point up to just before the
     * unclosed bracket instead. This turn is built so the naive 140-char
     * cut would land inside a bracket cue placed right around that offset.
     */
    it("a large-cut target's preview text never truncates mid-bracket-cue, even when the naive character cut point lands inside one", async () => {
      // Padding built from real, space-separated words (not one giant
      // token) so this turn's WORD count -- the actual metric
      // selectLargeCutTarget() compares -- genuinely stays the largest in
      // the script, while still pushing the bracket cue's "[" past char
      // ~128 so the naive slice(0, 140) cut point lands inside it.
      const prefix = "Rome story begins here and ";
      let padding = "";
      while (prefix.length + padding.length < 128) {
        padding += (padding.length > 0 ? " " : "") + "pad";
      }
      const straddlingText = `${prefix}${padding} [thoughtful] then continues on for quite a while after the cue with plenty more real content following it. And here is quite a lot more genuine dialogue content padded out further so this turn's real spoken word count clearly exceeds every other candidate turn in the script, making it unambiguously the longest eligible turn available, well beyond any of the short filler turns elsewhere.`;

      const bracketOpenIndex = straddlingText.indexOf("[");
      expect(bracketOpenIndex).toBeLessThan(140); // sanity: "[" is inside the naive cut window
      expect(straddlingText.indexOf("]")).toBeGreaterThanOrEqual(140); // sanity: "]" is not

      const base = buildCueRichOvershootOutput(1150);
      const straddlingTurn: ScriptGenerationOutput["turns"][number] = { speaker: 1, text: straddlingText };
      const withStraddlingTurn: ScriptGenerationOutput = { ...base, turns: [...base.turns.slice(0, 5), straddlingTurn, ...base.turns.slice(5)] };

      const target = selectLargeCutTarget(withStraddlingTurn, REQUEST_B2);
      expect(target?.turnIndex).toBe(5); // sanity: this is genuinely the selected turn

      vi.mocked(generateStructuredJson).mockResolvedValueOnce(withStraddlingTurn).mockResolvedValueOnce(buildValidScriptOutput());
      vi.mocked(generateEnrichment).mockResolvedValue(fakeEnrichment());

      await generateEpisodeScript(REQUEST_B2);

      const correctionPrompt = vi.mocked(generateStructuredJson).mock.calls[1][0].messages[0].content as string;
      expect(correctionPrompt).not.toMatch(/\[thought(?!ful\])/); // never an unclosed "[thought" fragment
      // The preview was backed up to end cleanly before the bracket instead.
      const expectedPreview = `${straddlingText.slice(0, bracketOpenIndex).trimEnd()}...`;
      expect(correctionPrompt).toContain(expectedPreview);
    });

    it("B: a near-ceiling overshoot (999 words) is corrected via the SAME dedicated pass, but targets 955-960 -- the existing near-ceiling behavior", async () => {
      vi.mocked(generateStructuredJson).mockResolvedValueOnce(NEAR_CEILING_OVERSHOOT).mockResolvedValueOnce(buildValidScriptOutput());
      vi.mocked(generateEnrichment).mockResolvedValue(fakeEnrichment());

      const result = await generateEpisodeScript(REQUEST_B2);

      expect(result.attempts).toBe(1);
      const correctionCall = vi.mocked(generateStructuredJson).mock.calls[1][0];
      expect(correctionCall.schemaName).toBe("linguabc_podcast_script_word_count_correction");
      const correctionPrompt = correctionCall.messages[0].content as string;
      expect(correctionPrompt).toContain("Current spoken word count: 999");
      expect(correctionPrompt).toContain("Target for this correction: 955-960 words");
      expect(correctionPrompt).toMatch(/Cut approximately 39-44 spoken words/i);
      // Same near-ceiling target the pre-existing normal-revision path used
      // for a near-miss -- NOT the large-overshoot 935-950 sub-target.
      expect(correctionPrompt).not.toContain("Target for this correction: 935-950 words");
      // Word-count CONVERGENCE fix regression safety: a cut like this one
      // does NOT require the whole-turn removal instruction -- that stays
      // reserved for much larger overages.
      expect(correctionPrompt).not.toMatch(/TOO LARGE to reach through word- and phrase-level trims alone/i);
      expect(correctionPrompt).not.toMatch(/find the SINGLE longest turn in the script/i);
      // NEAR-CEILING RELIABILITY fix: 999 words is 34 over the 965 ceiling
      // -- inside the "meaningful" (11-60) band, not "small" (1-10) -- so
      // it gets Fix #6's deterministic compression-target guidance, not
      // the ultra-precise "small"/final-boundary wording.
      expect(correctionPrompt).toMatch(/The script needs approximately 44 word\(s\) removed at most to reach a safe margin below the 965-word hard maximum \(it is currently 34 word\(s\) past that maximum\)/i);
      expect(correctionPrompt).toMatch(/Turn #5 \(Sarah, 32 words\) is a good compression candidate/i);
      expect(correctionPrompt).not.toMatch(/You need to remove exactly enough words to get at or below 965/i);
    });

    it("C: the corrected script returned to the caller preserves the full schema shape", async () => {
      const corrected = buildValidScriptOutput();
      vi.mocked(generateStructuredJson).mockResolvedValueOnce(LARGE_OVERSHOOT).mockResolvedValueOnce(corrected);
      vi.mocked(generateEnrichment).mockResolvedValue(fakeEnrichment());

      const result = await generateEpisodeScript(REQUEST_B2);

      expect(result.output).toEqual(corrected);
      expect(result.output).toHaveProperty("title");
      expect(result.output).toHaveProperty("topic");
      expect(result.output).toHaveProperty("topicTags");
      expect(result.output).toHaveProperty("cefrLevel");
      expect(Array.isArray(result.output.turns)).toBe(true);
    });

    it("D: if the correction pass exhausts its 2 bounded attempts without reaching the valid range, Fix #9's generalized continuation keeps using the SAME correction mechanism instead of falling back to the generic revision", async () => {
      // Before Fix #9, this exact scenario (a plain overshoot from a FRESH
      // INITIAL draft -- no CEFR, no other issue involved anywhere) fell
      // back to the generic revision mechanism once the correction pass
      // exhausted its budget -- that was the pre-Fix-#9 behavior this test
      // used to assert. A real GitHub Actions failure (word-count
      // trajectory 1226->1245->...->996, exhausting all 6 outer attempts)
      // showed that fallback is a real regression regardless of origin, so
      // Fix #9 removed the CEFR-origin gate from cefrRecoveryPending
      // entirely -- see generateEpisodeScript()'s own doc comment. This
      // test's expectation is updated accordingly.
      vi.mocked(generateStructuredJson)
        .mockResolvedValueOnce(LARGE_OVERSHOOT) // outer attempt 1 (initial)
        .mockResolvedValueOnce(LARGE_OVERSHOOT) // correction sub-attempt 1 -- still overshoot
        .mockResolvedValueOnce(LARGE_OVERSHOOT) // correction sub-attempt 2 -- still overshoot, bound exhausted
        .mockResolvedValueOnce(buildValidScriptOutput()); // outer attempt 2 -- Fix #9 continuation (ANOTHER correction call), resolves
      vi.mocked(generateEnrichment).mockResolvedValue(fakeEnrichment());

      const result = await generateEpisodeScript(REQUEST_B2);

      expect(result.wordCount).toBe(950);
      expect(result.attempts).toBe(2); // only 2 OUTER attempts consumed -- the correction sub-attempts don't count against MAX_ATTEMPTS
      expect(vi.mocked(generateStructuredJson)).toHaveBeenCalledTimes(4);

      // Exactly 2 correction sub-attempts were made in the FIRST correction pass.
      expect(vi.mocked(generateStructuredJson).mock.calls[1][0].schemaName).toBe("linguabc_podcast_script_word_count_correction");
      expect(vi.mocked(generateStructuredJson).mock.calls[2][0].schemaName).toBe("linguabc_podcast_script_word_count_correction");

      // The 4th call is Fix #9's continuation -- ANOTHER correction call,
      // single-message shape, never the generic multi-category revision --
      // even though this overshoot never involved CEFR at all.
      const continuationCall = vi.mocked(generateStructuredJson).mock.calls[3][0];
      expect(continuationCall.schemaName).toBe("linguabc_podcast_script_word_count_correction");
      expect(continuationCall.messages).toHaveLength(1);
      const continuationPrompt = continuationCall.messages[0].content as string;
      expect(continuationPrompt).toContain("DEDICATED WORD-COUNT CORRECTION pass");
    });

    it("E: if the correction pass fixes word count but the corrected draft fails a DIFFERENT check, existing full validation catches it and normal revision takes over", async () => {
      const lowProsodyButInRange = buildInRangeLowProsodyOutput();
      vi.mocked(generateStructuredJson)
        .mockResolvedValueOnce(LARGE_OVERSHOOT) // outer attempt 1 (initial) -- word-count-only overshoot
        .mockResolvedValueOnce(lowProsodyButInRange) // correction sub-attempt 1 -- word count now fine, but prosody now fails
        .mockResolvedValueOnce(buildValidScriptOutput()); // outer attempt 2 (normal revision) -- succeeds
      vi.mocked(generateEnrichment).mockResolvedValue(fakeEnrichment());

      const result = await generateEpisodeScript(REQUEST_B2);

      expect(result.wordCount).toBe(950);
      expect(result.attempts).toBe(2);
      expect(vi.mocked(generateStructuredJson)).toHaveBeenCalledTimes(3);

      // Only ONE correction sub-attempt ran -- the loop stops early once
      // the word-count issue itself is resolved, even though another
      // issue (prosody) remains for the normal mechanism to pick up.
      expect(vi.mocked(generateStructuredJson).mock.calls[1][0].schemaName).toBe("linguabc_podcast_script_word_count_correction");

      const fallbackCall = vi.mocked(generateStructuredJson).mock.calls[2][0];
      expect(fallbackCall.messages).toHaveLength(3);
      const fallbackPrompt = fallbackCall.messages[2].content as string;
      expect(fallbackPrompt).toContain("PREVIOUS ATTEMPT REJECTED");
      expect(fallbackPrompt).toMatch(/Current prosody density: [\d.]+\/100 words/i);
      // The issue that triggered this fallback is prosody, not word count.
      expect(fallbackPrompt).not.toMatch(/This is a CUT operation/i);
    });

    it("F: the final failure's word-count trajectory shows per-attempt counts and phases, and never the generated script text", async () => {
      // Every call -- outer AND correction -- returns the identical
      // never-converging large-overshoot draft, so correction triggers
      // and exhausts on every one of the 6 outer attempts.
      vi.mocked(generateStructuredJson).mockResolvedValue(LARGE_OVERSHOOT);

      let thrown: Error | undefined;
      try {
        await generateEpisodeScript(REQUEST_B2);
      } catch (error) {
        thrown = error as Error;
      }

      expect(thrown).toBeDefined();
      const message = thrown!.message;
      expect(message).toContain("Word-count trajectory:");

      // FIX #9: outer attempt 1 contributes 1 initial entry + 2 correction
      // entries (its inline correction pass). Since the draft never
      // converges, cefrRecoveryPending seeds after outer attempt 1 and
      // stays seeded (origin-independent, recomputed fresh every
      // iteration) -- so outer attempts 2-6 each go STRAIGHT into
      // runWordCountCorrection() (2 correction entries each), never a
      // separate "revision" entry. Total: 1 + 2 + 5*2 = 13 trajectory
      // lines (down from 18 before this fix, which used to spend a
      // "revision" entry re-entering the loop on every one of outer
      // attempts 2-6).
      const trajectoryLines = message.match(/attempt \d+ \[(initial|revision|word-count correction)\]: 1201 words -- word count/g) ?? [];
      expect(trajectoryLines).toHaveLength(13);
      expect(message).toMatch(/attempt 1 \[initial\]: 1201 words -- word count/);
      expect(message).toMatch(/attempt 2 \[word-count correction\]: 1201 words -- word count/);
      expect(message).toMatch(/attempt 3 \[word-count correction\]: 1201 words -- word count/);
      // Attempt 4 begins outer attempt 2's continuation -- still a
      // correction entry, never "revision", since Fix #9 skips the generic
      // revision path entirely once cefrRecoveryPending is seeded.
      expect(message).toMatch(/attempt 4 \[word-count correction\]: 1201 words -- word count/);
      expect(message).not.toMatch(/\[revision\]/);

      // Never the actual generated dialogue or raw JSON, anywhere in the error.
      expect(message).not.toContain("hotel room");
      expect(message).not.toContain("LinguABC, and today we're talking");
      expect(message).not.toContain('"turns":[');
      expect(message).not.toContain('{"speaker"');
    });

    /**
     * Regression coverage for the DIMINISHING-RETURN case named in this
     * fix's own scope: the real diagnostic run's trajectory (e.g.
     * 1094 -> 1084 -> 1062 -> 1029 -> 1021 -> ...) showed cuts shrinking to
     * single digits well before the gap closed, as if each successive
     * correction call reverted to a cosmetic trim regardless of how large
     * the remaining gap still was. Updated for the DETERMINISTIC LARGE-CUT
     * TARGET SELECTION fix: this now proves the designated-target
     * instruction does NOT fade or get "used up" after one call -- it is
     * recomputed independently on EVERY correction sub-attempt whose
     * previous draft is still a large overshoot, from that attempt's own
     * actual input script, never carried over as state.
     */
    it("G: the deterministic cut-target instruction persists across BOTH correction sub-attempts when the cut only shrinks a little each time (the diminishing-return case)", async () => {
      // A second large-overshoot fixture, smaller than LARGE_OVERSHOOT
      // (1201) but still far past the near-ceiling boundary -- models a
      // correction sub-attempt that only trimmed a small amount instead of
      // closing the gap, the exact diminishing-return pattern observed.
      // Its filler turns cycle through the SAME templates starting at the
      // SAME turn index 5, so it independently selects the SAME target.
      const stillLargeOvershoot = buildCueRichOvershootOutput(1050);
      expect(countWords(stillLargeOvershoot.turns)).toBeGreaterThan(965 + 60); // sanity: still a LARGE overshoot, not near-ceiling

      vi.mocked(generateStructuredJson)
        .mockResolvedValueOnce(LARGE_OVERSHOOT) // outer attempt 1 (initial) -- 1201 words
        .mockResolvedValueOnce(stillLargeOvershoot) // correction sub-attempt 1 -- cut some, but still a large overshoot
        .mockResolvedValueOnce(LARGE_OVERSHOOT) // correction sub-attempt 2 -- bound exhausted, still overshooting
        .mockResolvedValueOnce(buildValidScriptOutput()); // outer attempt 2 (normal revision) -- succeeds
      vi.mocked(generateEnrichment).mockResolvedValue(fakeEnrichment());

      await generateEpisodeScript(REQUEST_B2);

      const correctionSubAttempt1Prompt = vi.mocked(generateStructuredJson).mock.calls[1][0].messages[0].content as string;
      const correctionSubAttempt2Prompt = vi.mocked(generateStructuredJson).mock.calls[2][0].messages[0].content as string;

      // The designated-target instruction must appear on BOTH sub-attempts,
      // independently recomputed from each one's own actual input script --
      // not just the first call, and not something that wears off after
      // one retry. Sub-attempt 1's input is LARGE_OVERSHOOT (target: turn
      // #5); sub-attempt 2's input is stillLargeOvershoot, a DIFFERENT
      // script object that happens to select the same turn index/content.
      expect(correctionSubAttempt1Prompt).toMatch(/cut target has ALREADY BEEN IDENTIFIED for you/i);
      expect(correctionSubAttempt1Prompt).toMatch(/Turn #5 \(Sarah, 32 words\) is the designated cut target/i);
      expect(correctionSubAttempt2Prompt).toMatch(/cut target has ALREADY BEEN IDENTIFIED for you/i);
      expect(correctionSubAttempt2Prompt).toMatch(/Turn #5 \(Sarah, 32 words\) is the designated cut target/i);
    });

    /**
     * Regression coverage for the NEAR-CEILING RELIABILITY fix: a real
     * diagnostic run captured two genuine byte-identical no-ops
     * (966->966, 969->969) under the OLD generic near-ceiling correction
     * text ("trim sentences and phrases... a cut this small does not
     * require [whole turns]"). This fix splits the previously-undifferentiated
     * near-ceiling band into "small" (1-10 over, exact-target instruction)
     * and "meaningful" (11-60 over, redundant-phrase/repeated-explanation
     * instruction -- see test B above, already updated), and adds explicit
     * no-op escalation between correction sub-attempts. The large-overage
     * mechanism (test A, test G) is untouched throughout.
     */
    it("H: a small overshoot (967 words, 2 over) gets the FINAL-BOUNDARY exact-word-deficit instruction, not vague 'trim a little' language", async () => {
      vi.mocked(generateStructuredJson).mockResolvedValueOnce(SMALL_OVERSHOOT).mockResolvedValueOnce(buildValidScriptOutput());
      vi.mocked(generateEnrichment).mockResolvedValue(fakeEnrichment());

      await generateEpisodeScript(REQUEST_B2);

      const correctionPrompt = vi.mocked(generateStructuredJson).mock.calls[1][0].messages[0].content as string;
      // FINAL-BOUNDARY CONVERGENCE FIX (Fix #5): the exact deficit, a hard
      // <=965 requirement, and an explicit ban on any edit that could add
      // or hold length steady -- replacing the older, vaguer "make a
      // deliberate edit" phrasing.
      expect(correctionPrompt).toMatch(/You are exactly 2 word\(s\) over the 965-word hard maximum/i);
      expect(correctionPrompt).toMatch(/This is the FINAL boundary correction -- the goal is one small, surgical edit, not a rewrite/i);
      expect(correctionPrompt).toMatch(/Remove at least 2 word\(s\) from the EXISTING dialogue below/i);
      expect(correctionPrompt).toMatch(/Do NOT add, expand, or rephrase any content in a way that could increase the total length/i);
      // The shared "Cut approximately X-Y" line must agree with the exact
      // deficit above -- no internal contradiction between a wide generic
      // range and the final-boundary instruction's exact number.
      expect(correctionPrompt).toContain("Cut approximately 2-4 spoken words");
      expect(correctionPrompt).toContain("Target for this correction: 963-965 words");
      expect(correctionPrompt).not.toMatch(/This is more than a single-word trim/i);
      expect(correctionPrompt).not.toMatch(/find the SINGLE longest turn in the script/i);
    });

    it("966 words (1 over) gets an exact 1-word-reduction final-boundary target", async () => {
      const oneOver = withExactWordCount(SMALL_OVERSHOOT, 966);
      expect(validateGeneratedScript(oneOver, REQUEST_B2)).toHaveLength(1); // sanity: still word-count-only

      vi.mocked(generateStructuredJson).mockResolvedValueOnce(oneOver).mockResolvedValueOnce(buildValidScriptOutput());
      vi.mocked(generateEnrichment).mockResolvedValue(fakeEnrichment());

      await generateEpisodeScript(REQUEST_B2);

      const correctionPrompt = vi.mocked(generateStructuredJson).mock.calls[1][0].messages[0].content as string;
      expect(correctionPrompt).toMatch(/You are exactly 1 word\(s\) over the 965-word hard maximum/i);
      expect(correctionPrompt).toMatch(/Remove at least 1 word\(s\) from the EXISTING dialogue below/i);
      expect(correctionPrompt).toContain("Cut approximately 1-3 spoken words");
    });

    it("975 words (10 over -- the top of the small/final-boundary band) gets an exact 10-word-reduction target", async () => {
      const tenOver = withExactWordCount(SMALL_OVERSHOOT, 975);
      expect(validateGeneratedScript(tenOver, REQUEST_B2)).toHaveLength(1); // sanity: still word-count-only

      vi.mocked(generateStructuredJson).mockResolvedValueOnce(tenOver).mockResolvedValueOnce(buildValidScriptOutput());
      vi.mocked(generateEnrichment).mockResolvedValue(fakeEnrichment());

      await generateEpisodeScript(REQUEST_B2);

      const correctionPrompt = vi.mocked(generateStructuredJson).mock.calls[1][0].messages[0].content as string;
      expect(correctionPrompt).toMatch(/You are exactly 10 word\(s\) over the 965-word hard maximum/i);
      expect(correctionPrompt).toMatch(/Remove at least 10 word\(s\) from the EXISTING dialogue below/i);
      expect(correctionPrompt).toContain("Cut approximately 10-12 spoken words");
    });

    it("I: a byte-identical no-op correction in the final-boundary band triggers the STRONGER final-boundary escalation on the NEXT sub-attempt, never on the first, and never the generic meaningful/large warning", async () => {
      vi.mocked(generateStructuredJson)
        .mockResolvedValueOnce(SMALL_OVERSHOOT) // outer attempt 1 (initial) -- 967 words
        .mockResolvedValueOnce(SMALL_OVERSHOOT) // correction sub-attempt 1 -- byte-identical no-op
        .mockResolvedValueOnce(buildValidScriptOutput()); // correction sub-attempt 2 -- succeeds
      vi.mocked(generateEnrichment).mockResolvedValue(fakeEnrichment());

      await generateEpisodeScript(REQUEST_B2);

      const subAttempt1Prompt = vi.mocked(generateStructuredJson).mock.calls[1][0].messages[0].content as string;
      const subAttempt2Prompt = vi.mocked(generateStructuredJson).mock.calls[2][0].messages[0].content as string;

      // The FIRST correction call never carries the warning -- there is
      // nothing prior within this correction pass to compare against.
      expect(subAttempt1Prompt).not.toMatch(/MADE NO PROGRESS/i);
      // The SECOND, following a real detected no-op, MUST carry the
      // final-boundary-SPECIFIC escalation, not the generic one (that
      // generic text is reserved for "meaningful"/"large" -- see the
      // "increased word count" and "generic warning never appears" tests
      // below).
      expect(subAttempt2Prompt).toMatch(/YOUR PREVIOUS ATTEMPT AT THIS FINAL BOUNDARY MADE NO PROGRESS/i);
      expect(subAttempt2Prompt).toMatch(/it returned the same word count, a HIGHER word count, or a script identical to the one you were given/i);
      expect(subAttempt2Prompt).not.toMatch(/YOUR PREVIOUS ATTEMPT FAILED TO MAKE A MEANINGFUL CHANGE/i);
    });

    it("I2: same word count but reworded (NOT byte-identical) still counts as a no-op for final-boundary escalation purposes", async () => {
      const rewordedSameCount: ScriptGenerationOutput = {
        ...SMALL_OVERSHOOT,
        turns: SMALL_OVERSHOOT.turns.map((t, i) => (i === 0 ? { ...t, text: t.text.replace("genuinely", "truly") } : t)),
      };
      expect(countWords(rewordedSameCount.turns)).toBe(countWords(SMALL_OVERSHOOT.turns)); // sanity: identical word count
      expect(rewordedSameCount.turns[0].text).not.toBe(SMALL_OVERSHOOT.turns[0].text); // sanity: NOT byte-identical

      vi.mocked(generateStructuredJson)
        .mockResolvedValueOnce(SMALL_OVERSHOOT)
        .mockResolvedValueOnce(rewordedSameCount)
        .mockResolvedValueOnce(buildValidScriptOutput());
      vi.mocked(generateEnrichment).mockResolvedValue(fakeEnrichment());

      await generateEpisodeScript(REQUEST_B2);

      const subAttempt2Prompt = vi.mocked(generateStructuredJson).mock.calls[2][0].messages[0].content as string;
      expect(subAttempt2Prompt).toMatch(/YOUR PREVIOUS ATTEMPT AT THIS FINAL BOUNDARY MADE NO PROGRESS/i);
    });

    it("an INCREASED word count on a final-boundary sub-attempt (967 -> 970) still counts as no-progress, not merely 'still overshooting'", async () => {
      const increased = withExactWordCount(SMALL_OVERSHOOT, 970); // worse than the 967 input, but still within the small/final-boundary band
      expect(countWords(increased.turns)).toBeGreaterThan(countWords(SMALL_OVERSHOOT.turns));

      vi.mocked(generateStructuredJson)
        .mockResolvedValueOnce(SMALL_OVERSHOOT) // outer attempt 1 (initial) -- 967 words
        .mockResolvedValueOnce(increased) // correction sub-attempt 1 -- WORSE, 970 words
        .mockResolvedValueOnce(buildValidScriptOutput()); // correction sub-attempt 2 -- succeeds
      vi.mocked(generateEnrichment).mockResolvedValue(fakeEnrichment());

      await generateEpisodeScript(REQUEST_B2);

      const subAttempt2Prompt = vi.mocked(generateStructuredJson).mock.calls[2][0].messages[0].content as string;
      expect(subAttempt2Prompt).toMatch(/YOUR PREVIOUS ATTEMPT AT THIS FINAL BOUNDARY MADE NO PROGRESS/i);
      expect(subAttempt2Prompt).toMatch(/a HIGHER word count/i);
    });

    /**
     * FIX #13 (SMALL-BAND DETERMINISTIC TARGETING): a real run got stuck at
     * exactly 970 words (5 over) for six consecutive correction calls,
     * despite the no-op escalation and Fix #11's carry-over both firing
     * correctly on every one of them (confirmed by direct code
     * re-inspection). Root cause: unlike "large" and "meaningful", the
     * "small"/final-boundary band never called selectLargeCutTarget() --
     * it asked the model to search the WHOLE script fresh every retry for
     * "one short redundant phrase," with only escalating bluntness, never a
     * concrete location. These tests verify the same, UNMODIFIED
     * selectLargeCutTarget() now also names a target for this band.
     */
    it("Fix #13 (1): a 5-word overshoot (970 words) names a deterministic target turn via the SAME, unmodified selectLargeCutTarget()", async () => {
      const fiveOver = withExactWordCount(SMALL_OVERSHOOT, 970);
      expect(validateGeneratedScript(fiveOver, REQUEST_B2)).toHaveLength(1); // sanity: still word-count-only
      const target = selectLargeCutTarget(fiveOver, REQUEST_B2);
      expect(target).not.toBeNull();

      vi.mocked(generateStructuredJson).mockResolvedValueOnce(fiveOver).mockResolvedValueOnce(buildValidScriptOutput());
      vi.mocked(generateEnrichment).mockResolvedValue(fakeEnrichment());

      await generateEpisodeScript(REQUEST_B2);

      const correctionPrompt = vi.mocked(generateStructuredJson).mock.calls[1][0].messages[0].content as string;
      expect(correctionPrompt).toMatch(new RegExp(`Turn #${target!.turnIndex} \\(${target!.speakerName}, ${target!.wordCount} words\\) is a good place to look first`, "i"));
      expect(correctionPrompt).toMatch(/Remove 5 word\(s\) of redundant wording from THIS turn specifically/i);
      expect(correctionPrompt).toMatch(/do not rewrite or shorten the whole turn, just trim the redundant part/i);
      // Still the exact-deficit framing, unchanged.
      expect(correctionPrompt).toMatch(/You are exactly 5 word\(s\) over the 965-word hard maximum/i);
    });

    it("Fix #13 (2): the FIRST small-band correction call (not just a later, escalated one) already contains the target turn", async () => {
      const oneOver = withExactWordCount(SMALL_OVERSHOOT, 966);
      const target = selectLargeCutTarget(oneOver, REQUEST_B2);
      expect(target).not.toBeNull();

      vi.mocked(generateStructuredJson).mockResolvedValueOnce(oneOver).mockResolvedValueOnce(buildValidScriptOutput());
      vi.mocked(generateEnrichment).mockResolvedValue(fakeEnrichment());

      await generateEpisodeScript(REQUEST_B2);

      // Call index 1 is the FIRST correction sub-attempt -- there has been
      // no no-op yet, so this proves the target is named up front, not only
      // as part of an escalation.
      const firstCorrectionPrompt = vi.mocked(generateStructuredJson).mock.calls[1][0].messages[0].content as string;
      expect(firstCorrectionPrompt).not.toMatch(/MADE NO PROGRESS/i);
      expect(firstCorrectionPrompt).toMatch(new RegExp(`Turn #${target!.turnIndex}.*is a good place to look first`, "i"));
    });

    it("Fix #13 (3): a repeated no-op receives BOTH the target turn AND the existing no-op escalation, referencing the target by number", async () => {
      const fiveOver = withExactWordCount(SMALL_OVERSHOOT, 970);
      vi.mocked(generateStructuredJson)
        .mockResolvedValueOnce(fiveOver) // outer attempt 1 (initial) -- 970 words
        .mockResolvedValueOnce(fiveOver) // correction sub-attempt 1 -- byte-identical no-op
        .mockResolvedValueOnce(buildValidScriptOutput()); // correction sub-attempt 2 -- succeeds
      vi.mocked(generateEnrichment).mockResolvedValue(fakeEnrichment());

      const target = selectLargeCutTarget(fiveOver, REQUEST_B2)!;
      await generateEpisodeScript(REQUEST_B2);

      const subAttempt2Prompt = vi.mocked(generateStructuredJson).mock.calls[2][0].messages[0].content as string;
      expect(subAttempt2Prompt).toMatch(/YOUR PREVIOUS ATTEMPT AT THIS FINAL BOUNDARY MADE NO PROGRESS/i);
      expect(subAttempt2Prompt).toMatch(new RegExp(`MUST actually delete words from Turn #${target.turnIndex}`, "i"));
      expect(subAttempt2Prompt).toMatch(/is a good place to look first/i);
    });

    it("Fix #13 (4): Fix #11's cross-invocation carry-over still delivers the no-op escalation into a fresh continuation invocation, now alongside the target", async () => {
      const fiveOver = withExactWordCount(SMALL_OVERSHOOT, 970);
      vi.mocked(generateStructuredJson)
        .mockResolvedValueOnce(fiveOver) // outer attempt 1 (initial) -- 970 words
        .mockResolvedValueOnce(fiveOver) // correction sub-attempt 1 -- no-op
        .mockResolvedValueOnce(fiveOver) // correction sub-attempt 2 -- no-op, exhausts this invocation
        .mockResolvedValueOnce(buildValidScriptOutput()); // outer attempt 2 (Fix #9 continuation) -- carries Fix #11 state, resolves
      vi.mocked(generateEnrichment).mockResolvedValue(fakeEnrichment());

      await generateEpisodeScript(REQUEST_B2);

      // Call index 3 is the FIRST sub-attempt of the NEW continuation
      // invocation -- Fix #11 seeds it with the previous invocation's final
      // no-op, so it must carry the escalation despite being "sub-attempt 0"
      // of a fresh runWordCountCorrection() call.
      const continuationPrompt = vi.mocked(generateStructuredJson).mock.calls[3][0].messages[0].content as string;
      expect(continuationPrompt).toMatch(/YOUR PREVIOUS ATTEMPT AT THIS FINAL BOUNDARY MADE NO PROGRESS/i);
      expect(continuationPrompt).toMatch(/is a good place to look first/i);
    });

    it("Fix #13 (6): replays the real 970 -> 970 -> 970 shape and recovers to <=965 once the model finally acts on the named target", async () => {
      const fiveOver = withExactWordCount(SMALL_OVERSHOOT, 970);
      const finallyComplies = withExactWordCount(SMALL_OVERSHOOT, 963);
      vi.mocked(generateStructuredJson)
        .mockResolvedValueOnce(fiveOver) // outer attempt 1 (initial) -- 970 words
        .mockResolvedValueOnce(fiveOver) // correction sub-attempt 1 -- no-op (970 -> 970)
        .mockResolvedValueOnce(fiveOver) // correction sub-attempt 2 -- no-op (970 -> 970), exhausts invocation 1
        .mockResolvedValueOnce(fiveOver) // outer attempt 2 (Fix #9 continuation), sub-attempt 1 -- no-op again (970 -> 970)
        .mockResolvedValueOnce(finallyComplies); // sub-attempt 2 -- finally crosses the boundary
      vi.mocked(generateEnrichment).mockResolvedValue(fakeEnrichment());

      const result = await generateEpisodeScript(REQUEST_B2);

      expect(result.wordCount).toBe(963);
      expect(result.wordCount).toBeLessThanOrEqual(965);
      // Fix #9 confirmed intact throughout: every call after the initial is
      // a correction call, never a generic revision.
      const schemaNames = vi.mocked(generateStructuredJson).mock.calls.map((c) => c[0].schemaName);
      expect(schemaNames.slice(1)).toEqual(schemaNames.slice(1).map(() => "linguabc_podcast_script_word_count_correction"));
    });

    it("a final-boundary sub-attempt that already lands at <=965 stops the correction pass immediately -- no second call, even mid-pass", async () => {
      const nowInRange = buildValidScriptOutput(); // a genuinely valid, in-range (950-word) script
      expect(countWords(nowInRange.turns)).toBeLessThanOrEqual(965);

      vi.mocked(generateStructuredJson)
        .mockResolvedValueOnce(SMALL_OVERSHOOT) // outer attempt 1 (initial) -- 967 words
        .mockResolvedValueOnce(nowInRange); // correction sub-attempt 1 -- already <=965
      vi.mocked(generateEnrichment).mockResolvedValue(fakeEnrichment());

      const result = await generateEpisodeScript(REQUEST_B2);

      // Exactly 3 calls: initial + ONE correction sub-attempt. The pass
      // stopped immediately instead of spending its second sub-attempt --
      // existing validation/add-word logic (not this pass) handles
      // whatever else, per the "let existing logic handle any other
      // issue" requirement.
      expect(vi.mocked(generateStructuredJson)).toHaveBeenCalledTimes(2);
      expect(result.wordCount).toBe(countWords(nowInRange.turns));
    });

    it("J: large-overage guidance stays on the large-cut path (never small/meaningful text) and uses the deterministic target instruction, not the old open-ended search text", async () => {
      vi.mocked(generateStructuredJson).mockResolvedValueOnce(LARGE_OVERSHOOT).mockResolvedValueOnce(buildValidScriptOutput());
      vi.mocked(generateEnrichment).mockResolvedValue(fakeEnrichment());

      await generateEpisodeScript(REQUEST_B2);

      const correctionPrompt = vi.mocked(generateStructuredJson).mock.calls[1][0].messages[0].content as string;
      expect(correctionPrompt).not.toMatch(/This is more than a single-word trim/i);
      expect(correctionPrompt).not.toMatch(/You need to remove exactly enough words to get at or below 965/i);
      // DETERMINISTIC LARGE-CUT TARGET SELECTION fix: no longer the old
      // "find the SINGLE longest turn in the script" open-ended search --
      // a specific turn is now named for the model.
      expect(correctionPrompt).not.toMatch(/find the SINGLE longest turn in the script/i);
      expect(correctionPrompt).toMatch(/Turn #5 \(Sarah, 32 words\) is the designated cut target/i);
    });

    it("K: an undershoot (add-words) failure never enters the correction pass or its new near-ceiling logic at all", async () => {
      const under = buildValidScriptOutput();
      const shortened: ScriptGenerationOutput = { ...under, turns: under.turns.slice(0, 5) }; // opening block only, well under the 920 floor
      expect(countWords(shortened.turns)).toBeLessThan(920);

      vi.mocked(generateStructuredJson).mockResolvedValueOnce(shortened).mockResolvedValueOnce(buildValidScriptOutput());
      vi.mocked(generateEnrichment).mockResolvedValue(fakeEnrichment());

      await generateEpisodeScript(REQUEST_B2);

      // Only ONE follow-up call happened -- the ordinary outer revision --
      // never a dedicated word-count-correction call.
      expect(vi.mocked(generateStructuredJson).mock.calls[1][0].schemaName).toBe("linguabc_podcast_script");
      const revisionPrompt = vi.mocked(generateStructuredJson).mock.calls[1][0].messages[2].content as string;
      expect(revisionPrompt).toMatch(/Add approximately/i);
      expect(revisionPrompt).not.toMatch(/DEDICATED WORD-COUNT CORRECTION/i);
    });

    it("L: other retry categories (prosody, interruption, opening, CEFR, markdown) are completely unaffected -- their guidance text is unchanged and never leaks the new correction wording", () => {
      const prosodyIssue = { message: "Prosody density 1.61/100 words is far below the ~4-6 target -- prosody rules were not followed." };
      const interruptionIssue = {
        message:
          "No genuine interruption found -- need one turn ending with a dash immediately followed by the next turn starting with a dash (e.g. Speaker 0: '...we—' / Speaker 1: '—never finish that?').",
      };
      const openingIssue = { message: "Ben's introduction occurs at 98.7% through the script -- must be within the first 25%." };
      const cefrIssue = { message: "Authoritative enrichment graded this script as cefrLevelMin=B1, cefrLevelMax=B2." };
      const markdownIssue = { message: "Found markdown-style emphasis markers that would be read aloud literally (use [emphasis] instead): *just*" };

      const feedback = buildRetryFeedback([prosodyIssue, interruptionIssue, openingIssue, cefrIssue, markdownIssue], 964);

      // The new near-ceiling correction-pass wording lives entirely inside
      // buildWordCountCorrectionMessage(), a completely separate code path
      // never invoked by buildRetryFeedback() -- must never leak here.
      expect(feedback).not.toMatch(/This is more than a single-word trim/i);
      expect(feedback).not.toMatch(/You need to remove exactly enough words to get at or below 965/i);
      expect(feedback).not.toMatch(/YOUR PREVIOUS ATTEMPT FAILED TO MAKE A MEANINGFUL CHANGE/i);
      // Every other category's own guidance is present and untouched.
      expect(feedback).toMatch(/Current prosody density: 1.61\/100 words/i);
      expect(feedback).toMatch(/structurally REQUIRED/i);
      expect(feedback).toMatch(/Ben's introduction was at 98.7% through the script/i);
      expect(feedback).toMatch(/independently graded BELOW the required B2\+ standard/i);
      expect(feedback).toMatch(/remove all markdown emphasis markers/i);
    });

    it("M: final-boundary correction guidance is level-agnostic -- identical exact-deficit behavior for a C1 request", async () => {
      const requestC1: ScriptGenerationRequest = { ...REQUEST_B2, cefrLevel: "C1" };
      const smallOvershootC1: ScriptGenerationOutput = { ...SMALL_OVERSHOOT, cefrLevel: "C1" };
      vi.mocked(generateStructuredJson)
        .mockResolvedValueOnce(smallOvershootC1)
        .mockResolvedValueOnce({ ...buildValidScriptOutput(), cefrLevel: "C1" });
      // Fix #14: see the identical comment in the "meaningful/compression
      // guidance is level-agnostic" test above -- fakeEnrichment()'s
      // default B2 grade no longer clears a C1-requested episode.
      vi.mocked(generateEnrichment).mockResolvedValue(fakeEnrichment({ cefrLevelMin: "C1" }));

      await generateEpisodeScript(requestC1);

      const correctionPrompt = vi.mocked(generateStructuredJson).mock.calls[1][0].messages[0].content as string;
      expect(correctionPrompt).toMatch(/You are exactly 2 word\(s\) over the 965-word hard maximum/i);
    });

    it("M2: final-boundary correction guidance is level-agnostic for a C2 request too", async () => {
      const requestC2: ScriptGenerationRequest = { ...REQUEST_B2, cefrLevel: "C2" };
      const smallOvershootC2: ScriptGenerationOutput = { ...SMALL_OVERSHOOT, cefrLevel: "C2" };
      vi.mocked(generateStructuredJson)
        .mockResolvedValueOnce(smallOvershootC2)
        .mockResolvedValueOnce({ ...buildValidScriptOutput(), cefrLevel: "C2" });
      // Fix #14: a C2 request needs cefrLevelMin=C2 specifically -- C1
      // (fakeEnrichment()'s default max) is still below C2.
      vi.mocked(generateEnrichment).mockResolvedValue(fakeEnrichment({ cefrLevelMin: "C2", cefrLevelMax: "C2" }));

      await generateEpisodeScript(requestC2);

      const correctionPrompt = vi.mocked(generateStructuredJson).mock.calls[1][0].messages[0].content as string;
      expect(correctionPrompt).toMatch(/You are exactly 2 word\(s\) over the 965-word hard maximum/i);
    });

    it("meaningful-band correction guidance (11-60 over) uses Fix #6's deterministic compression target, never the final-boundary or large-cut text", async () => {
      vi.mocked(generateStructuredJson).mockResolvedValueOnce(NEAR_CEILING_OVERSHOOT).mockResolvedValueOnce(buildValidScriptOutput());
      vi.mocked(generateEnrichment).mockResolvedValue(fakeEnrichment());

      await generateEpisodeScript(REQUEST_B2);

      const correctionPrompt = vi.mocked(generateStructuredJson).mock.calls[1][0].messages[0].content as string;
      expect(correctionPrompt).toContain("Current spoken word count: 999");
      expect(correctionPrompt).toContain("Target for this correction: 955-960 words");
      expect(correctionPrompt).toMatch(/Cut approximately 39-44 spoken words/i);
      // Fix #6: a deterministic compression target, not an open-ended search.
      expect(correctionPrompt).toMatch(/The script needs approximately 44 word\(s\) removed at most.*it is currently 34 word\(s\) past that maximum/i);
      expect(correctionPrompt).toMatch(/Turn #5 \(Sarah, 32 words\) is a good compression candidate/i);
      expect(correctionPrompt).toMatch(/COMPRESS this turn/i);
      expect(correctionPrompt).toMatch(/do not increase vocabulary or grammatical sophistication while compressing/i);
      // 34 over, cutMax 44: turn 5 alone (32 words) is below the cut
      // ceiling, so a deterministic SECOND candidate is named too, never a
      // vague "one or two other turns" escape hatch.
      expect(correctionPrompt).toMatch(/is the second candidate/i);
      expect(correctionPrompt).not.toMatch(/apply the same kind of redundant-phrase\/repeated-explanation trim to one or two other turns/i);
      expect(correctionPrompt).not.toMatch(/This is more than a single-word trim/i);
      // Never the final-boundary or large-cut branch's own text leaking in.
      expect(correctionPrompt).not.toMatch(/FINAL boundary correction/i);
      expect(correctionPrompt).not.toMatch(/is the designated cut target/i);
      expect(correctionPrompt).not.toMatch(/ALREADY BEEN IDENTIFIED/i);
      // The generic no-op warning is no longer this band's mechanism --
      // replaced by its own (see the no-op escalation tests below).
      expect(correctionPrompt).not.toMatch(/YOUR PREVIOUS ATTEMPT FAILED TO MAKE A MEANINGFUL CHANGE/i);
    });

    it("11 words over (the bottom of the meaningful band) gets an exact 11-word-deficit compression target", async () => {
      const elevenOver = withExactOvershootPreservingTarget(NEAR_CEILING_OVERSHOOT, 11);
      expect(validateGeneratedScript(elevenOver, REQUEST_B2)).toHaveLength(1); // sanity: still word-count-only
      const target = selectLargeCutTarget(elevenOver, REQUEST_B2);
      expect(target?.turnIndex).toBe(5); // sanity: turn 5 is still the selected target

      vi.mocked(generateStructuredJson).mockResolvedValueOnce(elevenOver).mockResolvedValueOnce(buildValidScriptOutput());
      vi.mocked(generateEnrichment).mockResolvedValue(fakeEnrichment());

      await generateEpisodeScript(REQUEST_B2);

      const correctionPrompt = vi.mocked(generateStructuredJson).mock.calls[1][0].messages[0].content as string;
      // 11 over, min/max=955/960 -> cutMax=976-955=21. Turn 5 has 32 words,
      // which is NOT double cutMax (42) -- realistically compressing it
      // alone (roughly half its length) may not reach 21, so a
      // deterministic second candidate is named too.
      expect(correctionPrompt).toMatch(/The script needs approximately 21 word\(s\) removed at most.*it is currently 11 word\(s\) past that maximum/i);
      expect(correctionPrompt).toMatch(/Turn #5 \(Sarah, 32 words\) is a good compression candidate/i);
      expect(correctionPrompt).toMatch(/is the second candidate/i);
      // Sanity: 11 over is genuinely "meaningful", not "small" (that band
      // tops out at 10) -- confirmed by the compression wording, not the
      // final-boundary "Remove at least N word(s)" phrasing.
      expect(correctionPrompt).not.toMatch(/FINAL boundary correction/i);
    });

    it("a target turn holding at least double the cut ceiling is treated as sufficient alone -- no second candidate named", async () => {
      // A deliberately long target turn (inflated well past 2x cutMax) to
      // exercise the "primary alone is genuinely sufficient" branch --
      // every other fixture in this suite uses a fixed 32-word turn 5,
      // which (correctly) never clears this bar on its own. The fixture's
      // exact resulting overshoot depends on buildCueRichOvershootOutput()'s
      // filler-cycle landing point, which this test does not hand-predict --
      // it verifies its OWN preconditions (genuinely "meaningful", and the
      // inflated turn genuinely clears 2x cutMax) at runtime instead of
      // asserting a guessed number, so a drift in that landing point fails
      // loudly here rather than silently testing the wrong scenario.
      const inflatedWords = 80;
      const base = buildCueRichOvershootOutput(860);
      const longTurnText = Array.from({ length: inflatedWords }, (_, i) => `word${i}`).join(" ");
      const withLongTurn: ScriptGenerationOutput = { ...base, turns: base.turns.map((t, i) => (i === 5 ? { ...t, text: longTurnText } : t)) };

      const total = countWords(withLongTurn.turns);
      const exactWordsOver = total - 965;
      expect(exactWordsOver).toBeGreaterThan(10); // sanity: genuinely "meaningful", not "small"
      expect(exactWordsOver).toBeLessThanOrEqual(60); // sanity: genuinely "meaningful", not "large"
      const cutMax = total - 955; // meaningful band's target min is always 955 (see other tests' "Target for this correction: 955-960 words" assertions)
      expect(inflatedWords).toBeGreaterThanOrEqual(cutMax * 2); // sanity: this fixture genuinely exercises "sufficient alone"

      expect(validateGeneratedScript(withLongTurn, REQUEST_B2)).toHaveLength(1);
      const target = selectLargeCutTarget(withLongTurn, REQUEST_B2);
      expect(target?.turnIndex).toBe(5);
      expect(target?.wordCount).toBe(inflatedWords);

      vi.mocked(generateStructuredJson).mockResolvedValueOnce(withLongTurn).mockResolvedValueOnce(buildValidScriptOutput());
      vi.mocked(generateEnrichment).mockResolvedValue(fakeEnrichment());

      await generateEpisodeScript(REQUEST_B2);

      const correctionPrompt = vi.mocked(generateStructuredJson).mock.calls[1][0].messages[0].content as string;
      expect(correctionPrompt).toMatch(new RegExp(`Turn #5 \\(Sarah, ${inflatedWords} words\\) is a good compression candidate`, "i"));
      expect(correctionPrompt).not.toMatch(/is the second candidate/i);
      expect(correctionPrompt).toMatch(/apply the same kind of redundant-phrase\/repeated-explanation trim to it more aggressively/i);
    });

    it("17 words over (the real 982-word daily-generation failure) gets an exact 17-word-deficit compression target", async () => {
      const seventeenOver = withExactOvershootPreservingTarget(NEAR_CEILING_OVERSHOOT, 17);
      expect(validateGeneratedScript(seventeenOver, REQUEST_B2)).toHaveLength(1);

      vi.mocked(generateStructuredJson).mockResolvedValueOnce(seventeenOver).mockResolvedValueOnce(buildValidScriptOutput());
      vi.mocked(generateEnrichment).mockResolvedValue(fakeEnrichment());

      await generateEpisodeScript(REQUEST_B2);

      const correctionPrompt = vi.mocked(generateStructuredJson).mock.calls[1][0].messages[0].content as string;
      // 17 over -> cutMax=982-955=27; turn 5 (32 words) is below double
      // that (54), so a second candidate is named here too.
      expect(correctionPrompt).toMatch(/The script needs approximately 27 word\(s\) removed at most.*it is currently 17 word\(s\) past that maximum/i);
      expect(correctionPrompt).toMatch(/Turn #5 \(Sarah, 32 words\) is a good compression candidate/i);
      expect(correctionPrompt).toMatch(/is the second candidate/i);
    });

    it("30 words over gets an exact 30-word-deficit compression target", async () => {
      const thirtyOver = withExactOvershootPreservingTarget(NEAR_CEILING_OVERSHOOT, 30);
      expect(validateGeneratedScript(thirtyOver, REQUEST_B2)).toHaveLength(1);

      vi.mocked(generateStructuredJson).mockResolvedValueOnce(thirtyOver).mockResolvedValueOnce(buildValidScriptOutput());
      vi.mocked(generateEnrichment).mockResolvedValue(fakeEnrichment());

      await generateEpisodeScript(REQUEST_B2);

      const correctionPrompt = vi.mocked(generateStructuredJson).mock.calls[1][0].messages[0].content as string;
      // 30 over -> cutMax=995-955=40, which EXCEEDS turn 5's 32 words --
      // a deterministic second candidate must be named.
      expect(correctionPrompt).toMatch(/The script needs approximately 40 word\(s\) removed at most.*it is currently 30 word\(s\) past that maximum/i);
      expect(correctionPrompt).toMatch(/Turn #5 \(Sarah, 32 words\) is a good compression candidate/i);
      expect(correctionPrompt).toMatch(/is the second candidate/i);
    });

    it("60 words over (the top of the meaningful band) gets an exact 60-word-deficit compression target, and 61 over is genuinely 'large' instead", async () => {
      const sixtyOver = withExactOvershootPreservingTarget(NEAR_CEILING_OVERSHOOT, 60);
      expect(validateGeneratedScript(sixtyOver, REQUEST_B2)).toHaveLength(1);

      vi.mocked(generateStructuredJson).mockResolvedValueOnce(sixtyOver).mockResolvedValueOnce(buildValidScriptOutput());
      vi.mocked(generateEnrichment).mockResolvedValue(fakeEnrichment());

      await generateEpisodeScript(REQUEST_B2);

      const correctionPrompt = vi.mocked(generateStructuredJson).mock.calls[1][0].messages[0].content as string;
      // 60 over (the top of the band) -> cutMax=1025-955=70, far above
      // turn 5's 32 words -- a deterministic second candidate is required,
      // not the old vague "one or two other turns" escape hatch.
      expect(correctionPrompt).toMatch(/The script needs approximately 70 word\(s\) removed at most.*it is currently 60 word\(s\) past that maximum/i);
      expect(correctionPrompt).toMatch(/Turn #5 \(Sarah, 32 words\) is a good compression candidate/i);
      expect(correctionPrompt).toMatch(/is the second candidate/i);
      expect(correctionPrompt).not.toMatch(/apply the same kind of redundant-phrase\/repeated-explanation trim to one or two other turns/i);
      // 61 over crosses into "large" -- confirmed against LARGE_OVERSHOOT
      // (240 over), which already uses the large-cut deterministic text,
      // not this one -- see the "large-cut correction guidance" test below.
      expect(correctionPrompt).not.toMatch(/cut target has ALREADY BEEN IDENTIFIED for you/i);
    });

    it("a byte-identical no-op in the meaningful/compression band triggers the STRONGER compression-specific escalation on the NEXT sub-attempt, never the generic one", async () => {
      vi.mocked(generateStructuredJson)
        .mockResolvedValueOnce(NEAR_CEILING_OVERSHOOT) // outer attempt 1 (initial) -- 999 words
        .mockResolvedValueOnce(NEAR_CEILING_OVERSHOOT) // correction sub-attempt 1 -- byte-identical no-op
        .mockResolvedValueOnce(buildValidScriptOutput()); // correction sub-attempt 2 -- succeeds
      vi.mocked(generateEnrichment).mockResolvedValue(fakeEnrichment());

      await generateEpisodeScript(REQUEST_B2);

      const subAttempt1Prompt = vi.mocked(generateStructuredJson).mock.calls[1][0].messages[0].content as string;
      const subAttempt2Prompt = vi.mocked(generateStructuredJson).mock.calls[2][0].messages[0].content as string;

      expect(subAttempt1Prompt).not.toMatch(/MADE NO PROGRESS/i);
      expect(subAttempt2Prompt).toMatch(/YOUR PREVIOUS ATTEMPT AT THIS COMPRESSION MADE NO PROGRESS/i);
      // 999 words (34 over) triggers a second candidate (32 < 44*2), so the
      // escalation must reference BOTH named turns, not just the first --
      // otherwise the strongest, most emphatic sentence in the message
      // would silently point the model back at a single, likely-
      // insufficient turn.
      expect(subAttempt2Prompt).toMatch(/you MUST actually shorten BOTH Turn #5 and Turn #\d+: cut a specific redundant phrase or sentence from each/i);
      expect(subAttempt2Prompt).not.toMatch(/YOUR PREVIOUS ATTEMPT FAILED TO MAKE A MEANINGFUL CHANGE/i);
    });

    it("an INCREASED word count on a meaningful/compression sub-attempt (999 -> 1010) still counts as no-progress, not merely 'still overshooting'", async () => {
      const increased = withExactOvershootPreservingTarget(NEAR_CEILING_OVERSHOOT, 45); // 1010 words -- worse than the 999 input, but still within the meaningful band
      expect(countWords(increased.turns)).toBeGreaterThan(countWords(NEAR_CEILING_OVERSHOOT.turns));

      vi.mocked(generateStructuredJson)
        .mockResolvedValueOnce(NEAR_CEILING_OVERSHOOT) // outer attempt 1 (initial) -- 999 words
        .mockResolvedValueOnce(increased) // correction sub-attempt 1 -- WORSE, 1010 words
        .mockResolvedValueOnce(buildValidScriptOutput()); // correction sub-attempt 2 -- succeeds
      vi.mocked(generateEnrichment).mockResolvedValue(fakeEnrichment());

      await generateEpisodeScript(REQUEST_B2);

      const subAttempt2Prompt = vi.mocked(generateStructuredJson).mock.calls[2][0].messages[0].content as string;
      expect(subAttempt2Prompt).toMatch(/YOUR PREVIOUS ATTEMPT AT THIS COMPRESSION MADE NO PROGRESS/i);
      expect(subAttempt2Prompt).toMatch(/a HIGHER word count/i);
    });

    it("small-band correction guidance is completely unaffected by Fix #6's meaningful-band compression work", async () => {
      vi.mocked(generateStructuredJson).mockResolvedValueOnce(SMALL_OVERSHOOT).mockResolvedValueOnce(buildValidScriptOutput());
      vi.mocked(generateEnrichment).mockResolvedValue(fakeEnrichment());

      await generateEpisodeScript(REQUEST_B2);

      const correctionPrompt = vi.mocked(generateStructuredJson).mock.calls[1][0].messages[0].content as string;
      expect(correctionPrompt).toMatch(/You are exactly 2 word\(s\) over the 965-word hard maximum/i);
      expect(correctionPrompt).toMatch(/This is the FINAL boundary correction/i);
      expect(correctionPrompt).not.toMatch(/is a good compression candidate/i);
      expect(correctionPrompt).not.toMatch(/COMPRESS this turn/i);
    });

    it("large-cut correction guidance is completely unaffected by Fix #6's meaningful-band compression work", async () => {
      vi.mocked(generateStructuredJson).mockResolvedValueOnce(LARGE_OVERSHOOT).mockResolvedValueOnce(buildValidScriptOutput());
      vi.mocked(generateEnrichment).mockResolvedValue(fakeEnrichment());

      await generateEpisodeScript(REQUEST_B2);

      const correctionPrompt = vi.mocked(generateStructuredJson).mock.calls[1][0].messages[0].content as string;
      expect(correctionPrompt).toMatch(/cut target has ALREADY BEEN IDENTIFIED for you -- you do not need to search the script/i);
      expect(correctionPrompt).toMatch(/Turn #5 \(Sarah, 32 words\) is the designated cut target/i);
      expect(correctionPrompt).not.toMatch(/is a good compression candidate/i);
      expect(correctionPrompt).not.toMatch(/COMPRESS this turn/i);
    });

    it("CEFR-level preservation guidance inside the correction prompt is unchanged by Fix #6, on the meaningful band too", async () => {
      vi.mocked(generateStructuredJson).mockResolvedValueOnce(NEAR_CEILING_OVERSHOOT).mockResolvedValueOnce(buildValidScriptOutput());
      vi.mocked(generateEnrichment).mockResolvedValue(fakeEnrichment());

      await generateEpisodeScript(REQUEST_B2);

      const correctionPrompt = vi.mocked(generateStructuredJson).mock.calls[1][0].messages[0].content as string;
      expect(correctionPrompt).toContain("the CEFR-level vocabulary and complexity wherever possible");
    });

    it("meaningful/compression guidance is level-agnostic -- identical deterministic-target behavior for C1 and C2 requests", async () => {
      const requestC1: ScriptGenerationRequest = { ...REQUEST_B2, cefrLevel: "C1" };
      const nearCeilingC1: ScriptGenerationOutput = { ...NEAR_CEILING_OVERSHOOT, cefrLevel: "C1" };
      vi.mocked(generateStructuredJson)
        .mockResolvedValueOnce(nearCeilingC1)
        .mockResolvedValueOnce({ ...buildValidScriptOutput(), cefrLevel: "C1" });
      // Fix #14: generateAndCheckEnrichment() now also requires
      // cefrLevelMin to be at least the REQUESTED level (C1 here), not
      // merely "an approved LinguABC level" -- fakeEnrichment()'s default
      // B2 grade no longer satisfies a C1 request, so this test (which is
      // about the correction PROMPT text, not CEFR grading) must supply a
      // grade that actually clears the requested level.
      vi.mocked(generateEnrichment).mockResolvedValue(fakeEnrichment({ cefrLevelMin: "C1" }));

      await generateEpisodeScript(requestC1);

      const correctionPrompt = vi.mocked(generateStructuredJson).mock.calls[1][0].messages[0].content as string;
      expect(correctionPrompt).toMatch(/The script needs approximately 44 word\(s\) removed at most.*it is currently 34 word\(s\) past that maximum/i);
      expect(correctionPrompt).toMatch(/Turn #5 \(Sarah, 32 words\) is a good compression candidate/i);
    });

    it("large-cut correction guidance (>60 over) is byte-for-byte unchanged by the Fix #5 final-boundary work", async () => {
      vi.mocked(generateStructuredJson).mockResolvedValueOnce(LARGE_OVERSHOOT).mockResolvedValueOnce(buildValidScriptOutput());
      vi.mocked(generateEnrichment).mockResolvedValue(fakeEnrichment());

      await generateEpisodeScript(REQUEST_B2);

      const correctionPrompt = vi.mocked(generateStructuredJson).mock.calls[1][0].messages[0].content as string;
      expect(correctionPrompt).toContain("Target for this correction: 935-950 words");
      expect(correctionPrompt).toMatch(/cut target has ALREADY BEEN IDENTIFIED for you -- you do not need to search the script/i);
      expect(correctionPrompt).toMatch(/Turn #5 \(Sarah, 32 words\) is the designated cut target/i);
      // Never any final-boundary-specific text leaking into the large band.
      expect(correctionPrompt).not.toMatch(/FINAL boundary correction/i);
      expect(correctionPrompt).not.toMatch(/hard maximum/i);
    });

    it("CEFR-level preservation guidance inside the correction prompt is unchanged by the Fix #5 final-boundary work, on every magnitude", async () => {
      vi.mocked(generateStructuredJson).mockResolvedValueOnce(SMALL_OVERSHOOT).mockResolvedValueOnce(buildValidScriptOutput());
      vi.mocked(generateEnrichment).mockResolvedValue(fakeEnrichment());
      await generateEpisodeScript(REQUEST_B2);
      const smallPrompt = vi.mocked(generateStructuredJson).mock.calls[1][0].messages[0].content as string;
      expect(smallPrompt).toContain("the CEFR-level vocabulary and complexity wherever possible");
    });

    it("the final-boundary instruction text never contradicts the outer revision preamble's own guidance -- narrow and separate, same as every other magnitude", async () => {
      vi.mocked(generateStructuredJson).mockResolvedValueOnce(SMALL_OVERSHOOT).mockResolvedValueOnce(buildValidScriptOutput());
      vi.mocked(generateEnrichment).mockResolvedValue(fakeEnrichment());

      await generateEpisodeScript(REQUEST_B2);

      const correctionPrompt = vi.mocked(generateStructuredJson).mock.calls[1][0].messages[0].content as string;
      // Never the full multi-category revision conversation shape or its
      // distinct vocabulary -- this remains a single, narrow, standalone
      // user message (see buildWordCountCorrectionMessage()'s doc comment).
      expect(correctionPrompt).not.toContain("PREVIOUS ATTEMPT REJECTED");
      expect(correctionPrompt).not.toMatch(/prosody density/i);
      expect(correctionPrompt).not.toMatch(/Add approximately/i); // never the undershoot/add-words line
      // And its own internal instructions are mutually consistent: the
      // shared "CUT ONLY" framing and the final-boundary instruction agree
      // on direction (cut, never add) and never ask for two different cut
      // sizes (see the "H" test's exact-figure-agreement assertions above).
      expect(correctionPrompt).toMatch(/CUT ONLY\./);
    });

    /**
     * Regression coverage for a real defect found during this fix's own
     * doubt-driven-development adversarial review (not something the
     * original evidence surfaced): if a correction sub-attempt OVERCORRECTS
     * past the 920 floor, the loop's old break condition
     * (`!stillWordCountIssue`) could not distinguish "still overshooting"
     * from "now undershooting" -- validateGeneratedScript's word-count
     * message covers both -- so it would proceed to a SECOND correction
     * call with a previousCount that is no longer an overshoot at all,
     * producing a nonsensical negative "words over" figure and a negative
     * cut range. The fix changes the break condition to
     * `wordCount <= WORD_COUNT_HARD_MAX`, which stops the pass the moment
     * the overshoot itself is resolved (in range OR undershot), handing an
     * undershoot to the outer revision path's existing add-words guidance
     * instead of feeding it back into this pass.
     */
    it("N: a correction sub-attempt that overcorrects PAST the 920 floor stops the pass immediately -- never a second correction call with a negative deficit", async () => {
      const drasticallyOvercorrected: ScriptGenerationOutput = {
        title: "Test Episode",
        topic: "Testing",
        topicTags: ["Testing"],
        cefrLevel: "B2",
        turns: [
          { speaker: 0, text: "[thoughtful] I once forgot my own name for ten seconds after waking up in a strange hotel room, and it genuinely rattled me for the rest of the morning." },
          { speaker: 1, text: "Wait, seriously? That sounds terrifying, not just strange." },
          { speaker: 0, text: "It really was. [break] Anyway, I'm Sarah." },
          { speaker: 1, text: "And I'm Hannah." },
          { speaker: 0, text: "This is LinguABC, and today we're talking about the strange ways memory can fail us even when nothing is actually wrong." },
          { speaker: 0, text: "...and honestly I think the whole point is that we—" },
          { speaker: 1, text: "—never actually finish that argument? Yeah, I've noticed." },
          { speaker: 0, text: "[reflective] Well, that gives us a lot to think about before next time." },
          { speaker: 1, text: "It really does. [warm] That has been LinguABC -- thanks for listening, and we will catch you in the next one." },
        ],
      };
      expect(countWords(drasticallyOvercorrected.turns)).toBeLessThan(920); // sanity: a real undershoot, not just "closer to range"

      vi.mocked(generateStructuredJson)
        .mockResolvedValueOnce(SMALL_OVERSHOOT) // outer attempt 1 (initial) -- 967 words, word-count-only
        .mockResolvedValueOnce(drasticallyOvercorrected) // correction sub-attempt 1 -- overcorrects to under 920
        .mockResolvedValueOnce(buildValidScriptOutput()); // outer attempt 2 (normal revision, add-words path) -- succeeds
      vi.mocked(generateEnrichment).mockResolvedValue(fakeEnrichment());

      const result = await generateEpisodeScript(REQUEST_B2);

      expect(result.wordCount).toBe(950);
      // Exactly 3 calls total: initial, ONE correction sub-attempt (the
      // pass stops immediately instead of spending its 2nd sub-attempt on
      // a nonsensical negative-deficit prompt), then the outer revision.
      expect(vi.mocked(generateStructuredJson)).toHaveBeenCalledTimes(3);
      expect(vi.mocked(generateStructuredJson).mock.calls[1][0].schemaName).toBe("linguabc_podcast_script_word_count_correction");
      expect(vi.mocked(generateStructuredJson).mock.calls[2][0].schemaName).toBe("linguabc_podcast_script");

      // The fallback outer-revision prompt correctly received UNDERSHOOT
      // (add-words) guidance, not another cut instruction -- proving the
      // undershoot was hung back to the right mechanism.
      const fallbackPrompt = vi.mocked(generateStructuredJson).mock.calls[2][0].messages[2].content as string;
      expect(fallbackPrompt).toMatch(/Add approximately/i);
      expect(fallbackPrompt).not.toMatch(/word\(s\) over/i);
      expect(fallbackPrompt).not.toMatch(/currently -/i); // never a negative deficit anywhere
    });

    it("8: the generated correction prompt explicitly identifies the selected turn -- names its index, speaker, word count, and a text preview", async () => {
      const base = buildCueRichOvershootOutput(1150);
      const romeStoryText =
        "So this one time in Rome I got completely lost near the Colosseum, [amused] and I ended up wandering for almost two hours because my phone had died and I refused to just ask someone for directions like a reasonable person. " +
        "I kept telling myself I would recognize a landmark any minute now, [thoughtful] but every street just looked like every other street, all cobblestone and orange buildings and tiny cafes. " +
        "Eventually a shopkeeper took pity on me and just walked me halfway back to my hotel himself, [warm] which honestly remains one of the kindest things a total stranger has ever done for me.";
      const romeTurn: ScriptGenerationOutput["turns"][number] = { speaker: 1, text: romeStoryText };
      const withRomeStory: ScriptGenerationOutput = { ...base, turns: [...base.turns.slice(0, 5), romeTurn, ...base.turns.slice(5)] };
      expect(countWords([romeTurn])).toBeGreaterThan(80); // sanity: unambiguously the longest single turn in this script

      // Confirmed directly against selectLargeCutTarget() itself first, not
      // just inferred from the prompt text below.
      const target = selectLargeCutTarget(withRomeStory, REQUEST_B2);
      expect(target).not.toBeNull();
      expect(target?.turnIndex).toBe(5);
      expect(target?.speakerName).toBe("Hannah");
      expect(target?.text).toBe(romeStoryText);

      vi.mocked(generateStructuredJson).mockResolvedValueOnce(withRomeStory).mockResolvedValueOnce(buildValidScriptOutput());
      vi.mocked(generateEnrichment).mockResolvedValue(fakeEnrichment());

      await generateEpisodeScript(REQUEST_B2);

      const correctionPrompt = vi.mocked(generateStructuredJson).mock.calls[1][0].messages[0].content as string;
      expect(correctionPrompt).toContain(`Turn #5 (Hannah, ${target!.wordCount} words) is the designated cut target`);
      // The text preview names THIS turn specifically, not a generic
      // description -- the model does not have to search for it.
      expect(correctionPrompt).toContain(romeStoryText.slice(0, 100));
    });

    it("9: when every turn is structurally protected, the large-cut branch falls back to the ORIGINAL open-ended search text unchanged -- selectLargeCutTarget's null case never invents a fragile heuristic", async () => {
      // A continuous chain of turns that each start AND end with an em
      // dash protects the ENTIRE chain (every adjacent pair matches the
      // same interruption-pair pattern selectLargeCutTarget() reuses from
      // validateGeneratedScript() -- see its doc comment), combined with
      // the always-protected hook (index 0) and closing (last index) and
      // the opening block's self-introductions/LinguABC mention. The
      // result: a real, large (>60-over) overshoot with zero eligible cut
      // targets anywhere in the script.
      const turns: ScriptGenerationOutput["turns"] = [
        { speaker: 0, text: "[thoughtful] I once forgot my own name for ten seconds after waking up in a strange hotel room, and it genuinely rattled me for the rest of the morning." },
        { speaker: 1, text: "Wait, seriously? That sounds terrifying—" },
        { speaker: 0, text: "—Anyway, I'm Sarah, and it really did rattle me—" },
        { speaker: 1, text: "—And I'm Hannah. This is LinguABC, and today we're talking about the strange ways memory can fail us—" },
      ];
      const fillerTemplates = [
        "—and further, [thoughtful] this genuinely matters because it connects to what we discussed earlier and adds real texture to the point, keeping the thread going for quite a while now. [reflective] It really does keep unfolding the same idea from a slightly different angle every time we come back to it, on and on—",
        "—right, and it is not just about memory either, [curious] it is about how much we trust an ordinary morning without ever questioning it at all, which is strange when you actually sit with it. [amused] People rarely notice until something breaks the pattern entirely, on and on—",
      ];
      let i = 0;
      while (countWords(turns) < 1150) {
        turns.push({ speaker: ((i + 1) % 2) as 0 | 1, text: fillerTemplates[i % fillerTemplates.length] });
        i++;
      }
      turns.push({ speaker: 1, text: "It really does. [warm] That has been LinguABC -- thanks for listening, and we will catch you in the next one." });
      const noCandidateOutput: ScriptGenerationOutput = { title: "Test Episode", topic: "Testing", topicTags: ["Testing"], cefrLevel: "B2", turns };

      // Sanity: this fixture fails ONLY word count (same "word-count-issue-
      // only" gate every other correction-pass fixture in this suite must
      // pass), is genuinely a LARGE overshoot, and selectLargeCutTarget()
      // really does find nothing.
      const issues = validateGeneratedScript(noCandidateOutput, REQUEST_B2);
      expect(issues).toHaveLength(1);
      expect(issues[0].message).toMatch(/^Word count \d+ is outside/);
      expect(countWords(noCandidateOutput.turns)).toBeGreaterThan(965 + 60);
      expect(selectLargeCutTarget(noCandidateOutput, REQUEST_B2)).toBeNull();

      vi.mocked(generateStructuredJson).mockResolvedValueOnce(noCandidateOutput).mockResolvedValueOnce(buildValidScriptOutput());
      vi.mocked(generateEnrichment).mockResolvedValue(fakeEnrichment());

      await generateEpisodeScript(REQUEST_B2);

      const correctionPrompt = vi.mocked(generateStructuredJson).mock.calls[1][0].messages[0].content as string;
      // Unmodified fallback text -- IDENTICAL to pre-Fix-#4 behavior.
      expect(correctionPrompt).toMatch(/find the SINGLE longest turn in the script that is a personal example, story, extended explanation, or other non-essential aside/i);
      expect(correctionPrompt).toMatch(/never the hook, the self-introductions, the LinguABC mention, or the interruption pair/i);
      expect(correctionPrompt).not.toMatch(/cut target has ALREADY BEEN IDENTIFIED for you/i);
      expect(correctionPrompt).not.toMatch(/is the designated cut target/i);
    });

    it("10a: a small overshoot correction never contains the deterministic large-cut target language -- that's exclusive to the large-cut branch", async () => {
      vi.mocked(generateStructuredJson).mockResolvedValueOnce(SMALL_OVERSHOOT).mockResolvedValueOnce(buildValidScriptOutput());
      vi.mocked(generateEnrichment).mockResolvedValue(fakeEnrichment());

      await generateEpisodeScript(REQUEST_B2);

      const correctionPrompt = vi.mocked(generateStructuredJson).mock.calls[1][0].messages[0].content as string;
      expect(correctionPrompt).not.toMatch(/cut target has ALREADY BEEN IDENTIFIED for you/i);
      expect(correctionPrompt).not.toMatch(/is the designated cut target/i);
      expect(correctionPrompt).not.toMatch(/Substantially shorten this turn -- remove at least half of it/i);
    });

    it("10b: a meaningful (near-ceiling) overshoot correction never contains the deterministic large-cut target language either", async () => {
      vi.mocked(generateStructuredJson).mockResolvedValueOnce(NEAR_CEILING_OVERSHOOT).mockResolvedValueOnce(buildValidScriptOutput());
      vi.mocked(generateEnrichment).mockResolvedValue(fakeEnrichment());

      await generateEpisodeScript(REQUEST_B2);

      const correctionPrompt = vi.mocked(generateStructuredJson).mock.calls[1][0].messages[0].content as string;
      expect(correctionPrompt).not.toMatch(/cut target has ALREADY BEEN IDENTIFIED for you/i);
      expect(correctionPrompt).not.toMatch(/is the designated cut target/i);
      expect(correctionPrompt).not.toMatch(/Substantially shorten this turn -- remove at least half of it/i);
    });

    it("11a: CEFR guidance inside the correction prompt is untouched by the large-cut fix -- present with identical wording on the large-cut branch", async () => {
      vi.mocked(generateStructuredJson).mockResolvedValueOnce(LARGE_OVERSHOOT).mockResolvedValueOnce(buildValidScriptOutput());
      vi.mocked(generateEnrichment).mockResolvedValue(fakeEnrichment());

      await generateEpisodeScript(REQUEST_B2);

      const correctionPrompt = vi.mocked(generateStructuredJson).mock.calls[1][0].messages[0].content as string;
      expect(correctionPrompt).toContain("the CEFR-level vocabulary and complexity wherever possible");
    });

    it("11b: CEFR guidance inside the correction prompt is untouched on the small-cut branch too -- same shared line, not duplicated or reworded per branch", async () => {
      vi.mocked(generateStructuredJson).mockResolvedValueOnce(SMALL_OVERSHOOT).mockResolvedValueOnce(buildValidScriptOutput());
      vi.mocked(generateEnrichment).mockResolvedValue(fakeEnrichment());

      await generateEpisodeScript(REQUEST_B2);

      const correctionPrompt = vi.mocked(generateStructuredJson).mock.calls[1][0].messages[0].content as string;
      expect(correctionPrompt).toContain("the CEFR-level vocabulary and complexity wherever possible");
    });

    it("12a: the deterministic large-cut target selection is level-agnostic -- identical turn selection and instruction text for a C1 request", async () => {
      const requestC1: ScriptGenerationRequest = { ...REQUEST_B2, cefrLevel: "C1" };
      const largeOvershootC1: ScriptGenerationOutput = { ...LARGE_OVERSHOOT, cefrLevel: "C1" };
      vi.mocked(generateStructuredJson)
        .mockResolvedValueOnce(largeOvershootC1)
        .mockResolvedValueOnce({ ...buildValidScriptOutput(), cefrLevel: "C1" });
      // Fix #14: see the identical comment on the "M"/"meaningful/
      // compression guidance" tests above.
      vi.mocked(generateEnrichment).mockResolvedValue(fakeEnrichment({ cefrLevelMin: "C1" }));

      await generateEpisodeScript(requestC1);

      const correctionPrompt = vi.mocked(generateStructuredJson).mock.calls[1][0].messages[0].content as string;
      expect(correctionPrompt).toMatch(/cut target has ALREADY BEEN IDENTIFIED for you/i);
      expect(correctionPrompt).toMatch(/Turn #5 \(Sarah, 32 words\) is the designated cut target/i);
    });

    it("12b: the deterministic large-cut target selection is level-agnostic -- identical turn selection and instruction text for a C2 request", async () => {
      const requestC2: ScriptGenerationRequest = { ...REQUEST_B2, cefrLevel: "C2" };
      const largeOvershootC2: ScriptGenerationOutput = { ...LARGE_OVERSHOOT, cefrLevel: "C2" };
      vi.mocked(generateStructuredJson)
        .mockResolvedValueOnce(largeOvershootC2)
        .mockResolvedValueOnce({ ...buildValidScriptOutput(), cefrLevel: "C2" });
      // Fix #14: see the identical comment on the "M2" test above.
      vi.mocked(generateEnrichment).mockResolvedValue(fakeEnrichment({ cefrLevelMin: "C2", cefrLevelMax: "C2" }));

      await generateEpisodeScript(requestC2);

      const correctionPrompt = vi.mocked(generateStructuredJson).mock.calls[1][0].messages[0].content as string;
      expect(correctionPrompt).toMatch(/cut target has ALREADY BEEN IDENTIFIED for you/i);
      expect(correctionPrompt).toMatch(/Turn #5 \(Sarah, 32 words\) is the designated cut target/i);
    });

    /**
     * FIX #8 (CEFR-REGROWTH RETRY-BUDGET FIX): a real run reached 961 words
   * (structural PASS), failed authoritative CEFR grading, and Fix #7's
   * dedicated CEFR-only revision correctly improved the register but
   * returned 1210 words (+249) -- a large overshoot the existing
   * word-count-correction pass (bounded to WORD_COUNT_CORRECTION_MAX_ATTEMPTS,
   * unchanged) could not fully resolve in one invocation. Before this fix,
   * the next outer attempt fell back to the generic
   * buildRevisionPreamble()/buildWordCountGuidance() path -- the OLDER,
   * non-deterministic large-cut instruction, not Fix #4's mechanism -- and
   * the real run alternated between that and the correction pass for the
   * rest of MAX_ATTEMPTS without ever recovering. This fix makes the outer
   * loop skip that generic fallback and go straight back into the SAME,
   * unmodified runWordCountCorrection() whenever the unresolved state is a
   * plain word-count overshoot that originated from a genuine pure-CEFR
   * mismatch -- see generateEpisodeScript()'s own doc comment for the full
   * mechanism (cefrRecoveryPending).
   */
  describe("generateEpisodeScript — Fix #8: CEFR-regrowth recovery routes through the existing word-count correction machinery", () => {
    it("A: 961 -> CEFR fail -> CEFR revision returns a large overshoot (1210-like) -> recovery skips the generic revision call and goes straight back into word-count correction", async () => {
      const initialValid = buildValidScriptOutput();
      vi.mocked(generateStructuredJson)
        .mockResolvedValueOnce(initialValid) // attempt 1 [initial] -- structural PASS
        .mockResolvedValueOnce(LARGE_OVERSHOOT) // attempt 2 [CEFR-only revision] -- regrowth, large overshoot (1201 words, word-count-only)
        .mockResolvedValueOnce(LARGE_OVERSHOOT) // correction sub-attempt 1 -- no progress
        .mockResolvedValueOnce(LARGE_OVERSHOOT) // correction sub-attempt 2 -- no progress, bound exhausted
        .mockResolvedValueOnce(buildValidScriptOutput()); // Fix #8 recovery call -- NOT a generic revision, a correction sub-attempt that fully recovers
      vi.mocked(generateEnrichment)
        .mockResolvedValueOnce(fakeEnrichment({ cefrLevelMin: "B1", cefrLevelMax: "B2" })) // fails after attempt 1
        .mockResolvedValueOnce(fakeEnrichment({ cefrLevelMin: "B2", cefrLevelMax: "C1" })); // passes after recovery

      const result = await generateEpisodeScript(REQUEST_B2);

      expect(result.wordCount).toBe(countWords(initialValid.turns));
      expect(vi.mocked(generateStructuredJson)).toHaveBeenCalledTimes(5);
      // Call 2 is the CEFR-only revision (the dedicated preamble).
      expect((vi.mocked(generateStructuredJson).mock.calls[1][0].messages[2].content as string)).toMatch(/This revision failed ONLY the authoritative CEFR grading/i);
      // Calls 3-4 are the FIRST correction pass's two bounded sub-attempts.
      expect(vi.mocked(generateStructuredJson).mock.calls[2][0].schemaName).toBe("linguabc_podcast_script_word_count_correction");
      expect(vi.mocked(generateStructuredJson).mock.calls[3][0].schemaName).toBe("linguabc_podcast_script_word_count_correction");
      // Call 5 -- the critical Fix #8 assertion -- is ALSO a correction
      // call, never a generic "linguabc_podcast_script" revision. No
      // generic revision call happens anywhere between the exhausted
      // correction pass and full recovery.
      expect(vi.mocked(generateStructuredJson).mock.calls[4][0].schemaName).toBe("linguabc_podcast_script_word_count_correction");
    });

    it("B: 961 -> CEFR fail -> CEFR revision returns an in-range draft (933-like) -> existing successful behavior is completely unchanged", async () => {
      const initialValid = buildValidScriptOutput();
      const inRangeRevision = { ...buildValidScriptOutput(), title: "Revised Title" };
      vi.mocked(generateStructuredJson).mockResolvedValueOnce(initialValid).mockResolvedValueOnce(inRangeRevision);
      vi.mocked(generateEnrichment)
        .mockResolvedValueOnce(fakeEnrichment({ cefrLevelMin: "B1", cefrLevelMax: "B2" }))
        .mockResolvedValueOnce(fakeEnrichment({ cefrLevelMin: "B2", cefrLevelMax: "C1" }));

      const result = await generateEpisodeScript(REQUEST_B2);

      expect(result.output.title).toBe("Revised Title");
      expect(result.attempts).toBe(2);
      expect(vi.mocked(generateStructuredJson)).toHaveBeenCalledTimes(2); // no correction call at all -- never needed
      expect(vi.mocked(generateEnrichment)).toHaveBeenCalledTimes(2);
    });

    it("C: CEFR revision already in range -> no extra correction call is ever made", async () => {
      vi.mocked(generateStructuredJson).mockResolvedValueOnce(buildValidScriptOutput()).mockResolvedValueOnce(buildValidScriptOutput());
      vi.mocked(generateEnrichment)
        .mockResolvedValueOnce(fakeEnrichment({ cefrLevelMin: "B1", cefrLevelMax: "B2" }))
        .mockResolvedValueOnce(fakeEnrichment({ cefrLevelMin: "B2", cefrLevelMax: "C1" }));

      await generateEpisodeScript(REQUEST_B2);

      const schemaNames = vi.mocked(generateStructuredJson).mock.calls.map((call) => call[0].schemaName);
      expect(schemaNames).not.toContain("linguabc_podcast_script_word_count_correction");
    });

    it("D: CEFR revision introduces a COMBINED non-word-count issue (e.g. a missing interruption pattern) -> existing combined-issue behavior is preserved, never the correction machinery", async () => {
      const initialValid = buildValidScriptOutput();
      // In range on word count, but the interruption pair is broken --
      // the kind of "CEFR revision touched more than intended" combined
      // failure this test guards against being mis-routed.
      const brokenInterruption: ScriptGenerationOutput = {
        ...buildValidScriptOutput(),
        turns: buildValidScriptOutput().turns.map((t, i, arr) => (i === arr.length - 4 ? { ...t, text: "...and honestly I think the whole point is that we finish our own sentences." } : t)),
      };
      const combinedIssues = validateGeneratedScript(brokenInterruption, REQUEST_B2);
      expect(combinedIssues.some((i) => /No genuine interruption found/i.test(i.message))).toBe(true);
      expect(combinedIssues.some((i) => /word count/i.test(i.message))).toBe(false);

      vi.mocked(generateStructuredJson).mockResolvedValueOnce(initialValid).mockResolvedValueOnce(brokenInterruption).mockResolvedValueOnce(buildValidScriptOutput());
      vi.mocked(generateEnrichment)
        .mockResolvedValueOnce(fakeEnrichment({ cefrLevelMin: "B1", cefrLevelMax: "B2" }))
        .mockResolvedValueOnce(fakeEnrichment({ cefrLevelMin: "B2", cefrLevelMax: "C1" }));

      await generateEpisodeScript(REQUEST_B2);

      // The attempt AFTER the broken-interruption CEFR revision must be the
      // EXISTING generic multi-category revision (buildRevisionPreamble +
      // buildRetryFeedback's interruption guidance) -- never a word-count
      // correction call, since word count was never the (sole) problem.
      expect(vi.mocked(generateStructuredJson).mock.calls[2][0].schemaName).toBe("linguabc_podcast_script");
      const thirdCallPrompt = vi.mocked(generateStructuredJson).mock.calls[2][0].messages[2].content as string;
      expect(thirdCallPrompt).toMatch(/structurally REQUIRED/i);
      expect(thirdCallPrompt).not.toMatch(/This revision failed ONLY the authoritative CEFR grading/i);
    });

    it("E: once recovery reaches <=965, authoritative CEFR grading runs again", async () => {
      vi.mocked(generateStructuredJson)
        .mockResolvedValueOnce(buildValidScriptOutput())
        .mockResolvedValueOnce(LARGE_OVERSHOOT)
        .mockResolvedValueOnce(LARGE_OVERSHOOT)
        .mockResolvedValueOnce(LARGE_OVERSHOOT)
        .mockResolvedValueOnce(buildValidScriptOutput());
      vi.mocked(generateEnrichment)
        .mockResolvedValueOnce(fakeEnrichment({ cefrLevelMin: "B1", cefrLevelMax: "B2" }))
        .mockResolvedValueOnce(fakeEnrichment({ cefrLevelMin: "B2", cefrLevelMax: "C1" }));

      const result = await generateEpisodeScript(REQUEST_B2);

      expect(vi.mocked(generateEnrichment)).toHaveBeenCalledTimes(2);
      expect(result.enrichment.cefrLevelMin).toBe("B2");
      expect(result.enrichment.cefrLevelMax).toBe("C1");
    });

    it("F: recovery does not consume an unnecessary outer attempt -- no wasted generic-revision call is inserted", async () => {
      vi.mocked(generateStructuredJson)
        .mockResolvedValueOnce(buildValidScriptOutput()) // outer attempt 1
        .mockResolvedValueOnce(LARGE_OVERSHOOT) // outer attempt 2 (CEFR-only revision)
        .mockResolvedValueOnce(LARGE_OVERSHOOT) // correction sub-attempt (does not consume an outer slot)
        .mockResolvedValueOnce(LARGE_OVERSHOOT) // correction sub-attempt (does not consume an outer slot)
        .mockResolvedValueOnce(buildValidScriptOutput()); // outer attempt 3 (Fix #8 recovery, fully succeeds)
      vi.mocked(generateEnrichment)
        .mockResolvedValueOnce(fakeEnrichment({ cefrLevelMin: "B1", cefrLevelMax: "B2" }))
        .mockResolvedValueOnce(fakeEnrichment({ cefrLevelMin: "B2", cefrLevelMax: "C1" }));

      const result = await generateEpisodeScript(REQUEST_B2);

      // Exactly 3 OUTER attempts: initial, CEFR-only revision, recovery --
      // never a 4th spent on a wasted generic revision in between.
      expect(result.attempts).toBe(3);
    });

    it("G: Fix #9 generalizes recovery -- a NON-CEFR-triggered large overshoot from a fresh initial draft ALSO continues via the correction mechanism, never the generic revision", async () => {
      // Same fixture/shape as the pre-existing "dedicated word-count
      // correction pass" test D above. BEFORE Fix #9, cefrRecoveryPending
      // only ever seeded from a genuine pure-CEFR-mismatch revision, so
      // this exact scenario (a plain initial-draft overshoot, no CEFR
      // involved anywhere) fell back to the weaker generic revision once
      // the correction pass exhausted its budget -- that was this test's
      // ORIGINAL assertion. A real GitHub Actions failure (word-count
      // trajectory 1226->1245->...->996, exhausting all 6 outer attempts)
      // proved that fallback is a real regression independent of origin.
      // Fix #9 removes the CEFR-origin gate entirely, so this test's
      // expectation is now the opposite of its pre-Fix-#9 version: the
      // continuation activates here too.
      vi.mocked(generateStructuredJson)
        .mockResolvedValueOnce(LARGE_OVERSHOOT) // outer attempt 1 (initial) -- NOT a CEFR revision
        .mockResolvedValueOnce(LARGE_OVERSHOOT) // correction sub-attempt 1 -- still overshoot
        .mockResolvedValueOnce(LARGE_OVERSHOOT) // correction sub-attempt 2 -- still overshoot, bound exhausted
        .mockResolvedValueOnce(buildValidScriptOutput()); // outer attempt 2 -- Fix #9 continuation, resolves
      vi.mocked(generateEnrichment).mockResolvedValue(fakeEnrichment());

      const result = await generateEpisodeScript(REQUEST_B2);

      expect(result.wordCount).toBe(950);
      expect(result.attempts).toBe(2);
      expect(vi.mocked(generateStructuredJson)).toHaveBeenCalledTimes(4);
      // The 4th call MUST be another correction call (schemaName
      // "linguabc_podcast_script_word_count_correction"), never the generic
      // "linguabc_podcast_script" revision -- proving cefrRecoveryPending
      // now activates for this non-CEFR path too.
      expect(vi.mocked(generateStructuredJson).mock.calls[3][0].schemaName).toBe("linguabc_podcast_script_word_count_correction");
      expect(vi.mocked(generateStructuredJson).mock.calls[3][0].messages).toHaveLength(1);
    });

    it("H (Fix #9): a NON-CEFR overshoot that originates from a RESOLVED INTERRUPTION issue also seeds continuation, mirroring the real production failure (interruption+word-count combined -> revision resolves the interruption but overshoots -> correction exhausts -> continuation, not generic revision)", async () => {
      const brokenInterruptionOvershoot: ScriptGenerationOutput = {
        ...LARGE_OVERSHOOT,
        turns: LARGE_OVERSHOOT.turns.map((t, i, arr) => (i === arr.length - 4 ? { ...t, text: "...and honestly I think the whole point is that we finish our own sentences." } : t)),
      };
      const initialIssues = validateGeneratedScript(brokenInterruptionOvershoot, REQUEST_B2);
      expect(initialIssues).toHaveLength(2);
      expect(initialIssues.some((i) => /No genuine interruption found/i.test(i.message))).toBe(true);
      expect(initialIssues.some((i) => /word count/i.test(i.message))).toBe(true);

      vi.mocked(generateStructuredJson)
        .mockResolvedValueOnce(brokenInterruptionOvershoot) // outer attempt 1 (initial) -- interruption + word count, combined
        .mockResolvedValueOnce(LARGE_OVERSHOOT) // outer attempt 2 (generic revision) -- interruption fixed, still a pure overshoot
        .mockResolvedValueOnce(LARGE_OVERSHOOT) // correction sub-attempt 1 -- still overshoot
        .mockResolvedValueOnce(LARGE_OVERSHOOT) // correction sub-attempt 2 -- still overshoot, bound exhausted
        .mockResolvedValueOnce(buildValidScriptOutput()); // outer attempt 3 -- Fix #9 continuation, resolves
      vi.mocked(generateEnrichment).mockResolvedValue(fakeEnrichment());

      const result = await generateEpisodeScript(REQUEST_B2);

      expect(result.wordCount).toBe(950);
      expect(result.attempts).toBe(3);
      // Call 2 is the EXISTING generic revision (combined interruption +
      // word-count issue) -- unaffected by Fix #9, since a combined issue
      // never satisfies cefrRecoveryPending's structuralIssues.length === 1
      // conjunct, exactly like Fix #8's own test D.
      expect(vi.mocked(generateStructuredJson).mock.calls[1][0].schemaName).toBe("linguabc_podcast_script");
      // Calls 3-4 are the first correction pass's bounded sub-attempts.
      expect(vi.mocked(generateStructuredJson).mock.calls[2][0].schemaName).toBe("linguabc_podcast_script_word_count_correction");
      expect(vi.mocked(generateStructuredJson).mock.calls[3][0].schemaName).toBe("linguabc_podcast_script_word_count_correction");
      // Call 5 -- the Fix #9 assertion -- is ALSO a correction call, never a
      // generic revision, even though this chain never involved CEFR.
      expect(vi.mocked(generateStructuredJson).mock.calls[4][0].schemaName).toBe("linguabc_podcast_script_word_count_correction");
    });

    it("I (Fix #9): replays today's real production trajectory shape and verifies EVERY subsequent outer attempt routes into correction, never the generic revision, across MULTIPLE consecutive recovery boundaries", async () => {
      const brokenInterruptionOvershoot: ScriptGenerationOutput = {
        ...LARGE_OVERSHOOT,
        turns: LARGE_OVERSHOOT.turns.map((t, i, arr) => (i === arr.length - 4 ? { ...t, text: "...and honestly I think the whole point is that we finish our own sentences." } : t)),
      };

      vi.mocked(generateStructuredJson)
        .mockResolvedValueOnce(brokenInterruptionOvershoot) // outer attempt 1 (initial) -- 1226-like: interruption + word count
        .mockResolvedValueOnce(LARGE_OVERSHOOT) // outer attempt 2 (generic revision) -- 1245-like: interruption fixed, still overshoot
        .mockResolvedValueOnce(LARGE_OVERSHOOT) // correction sub-attempt -- 1230-like, still overshoot
        .mockResolvedValueOnce(LARGE_OVERSHOOT) // correction sub-attempt -- 1207-like, still overshoot, bound exhausted
        // Real run's bug: outer attempt 3 fell back to a generic revision
        // here. Fix #9: outer attempt 3 must be a correction call instead.
        .mockResolvedValueOnce(LARGE_OVERSHOOT) // outer attempt 3 (Fix #9 continuation) sub-attempt -- 1197-like, still overshoot
        .mockResolvedValueOnce(LARGE_OVERSHOOT) // -- 1191-like, still overshoot, bound exhausted
        // Real run's bug repeated at outer attempt 4 too -- Fix #9 must not
        // reset after only one continuation; it keeps chaining.
        .mockResolvedValueOnce(buildValidScriptOutput()); // outer attempt 4 (Fix #9 continuation) sub-attempt -- resolves
      vi.mocked(generateEnrichment).mockResolvedValue(fakeEnrichment());

      const result = await generateEpisodeScript(REQUEST_B2);

      const schemaNames = vi.mocked(generateStructuredJson).mock.calls.map((c) => c[0].schemaName);
      expect(schemaNames).toEqual([
        "linguabc_podcast_script", // attempt 1: initial
        "linguabc_podcast_script", // attempt 2: generic revision (combined interruption + word count)
        "linguabc_podcast_script_word_count_correction",
        "linguabc_podcast_script_word_count_correction", // outer attempt 2's correction pass, exhausted
        "linguabc_podcast_script_word_count_correction", // outer attempt 3 -- continuation, NOT generic revision
        "linguabc_podcast_script_word_count_correction", // outer attempt 3's correction pass, exhausted
        "linguabc_podcast_script_word_count_correction", // outer attempt 4 -- continuation, NOT generic revision -- resolves
      ]);
      expect(result.wordCount).toBe(950);
      // Outer attempts consumed: initial, generic revision, 2 continuations = 4 -- well inside MAX_ATTEMPTS (6),
      // demonstrating the fix converges where the real run exhausted its budget without recovering.
      expect(result.attempts).toBe(4);
    });

    it("J (Fix #9): continuation clears when a correction sub-attempt overcorrects into an UNDERSHOOT, and control returns to the normal revision mechanism", async () => {
      const undershoot = buildCueRichOvershootOutput(800); // lands well under 920 words
      expect(validateGeneratedScript(undershoot, REQUEST_B2)).toHaveLength(1);

      vi.mocked(generateStructuredJson)
        .mockResolvedValueOnce(LARGE_OVERSHOOT) // outer attempt 1 (initial) -- pure overshoot
        .mockResolvedValueOnce(undershoot) // correction sub-attempt 1 -- overcorrects below 920, stops early
        .mockResolvedValueOnce(buildValidScriptOutput()); // outer attempt 2 -- normal revision (add-words path), succeeds
      vi.mocked(generateEnrichment).mockResolvedValue(fakeEnrichment());

      const result = await generateEpisodeScript(REQUEST_B2);

      expect(result.wordCount).toBe(950);
      expect(result.attempts).toBe(2);
      // The 3rd call must be the NORMAL revision mechanism, never another
      // correction call -- continuation must not seed from an undershoot.
      expect(vi.mocked(generateStructuredJson).mock.calls[2][0].schemaName).toBe("linguabc_podcast_script");
    });
    });

  /**
   * FIX #10 (INSUFFICIENT-PROGRESS ESCALATION): see
   * INSUFFICIENT_PROGRESS_RATIO's doc comment on the production module for
   * the real, directly-captured model call this fix addresses -- input
   * 1068 words, a correctly-named 141-word target turn, an explicit
   * "remove at least half of it" instruction (~118-133 words required
   * overall), and a real model response that cut only 21 words (~18% of
   * the 118-word minimum) while touching no other turn. The existing
   * previousAttemptWasNoOp check (same-or-greater count, or a
   * byte-identical script) cannot see this: the count went down and the
   * script genuinely changed, so no escalation ever fired for it.
   */
  describe("generateEpisodeScript — Fix #10: insufficient-progress escalation for word-count correction", () => {
    // Adjusts the script to land at EXACTLY `targetTotal` words, by
    // trimming (or, if growing, extending) consecutive filler turns
    // starting at index 5 -- never the hook, the self-introductions, the
    // LinguABC mention (indices 0-4), or the last 5 turns (the
    // interruption pair and closing). Fix #10's insufficiency check
    // operates on the TOTAL reduction achieved this call, not on whether
    // the deterministically-named cut target specifically was edited (that
    // selection mechanism is selectLargeCutTarget(), untouched by this fix
    // and already covered by its own tests) -- so an exact, predictable
    // total is what these tests need. Spans MULTIPLE filler turns (not
    // just one) because these fixtures' individual filler turns are only
    // ~30-35 words each, far too small to absorb the 100+ word trims
    // several of these tests require on their own.
    function withExactTotalWordCount(base: ScriptGenerationOutput, targetTotal: number): ScriptGenerationOutput {
      const currentTotal = countWords(base.turns);
      const delta = currentTotal - targetTotal;
      const turns = base.turns.map((t) => ({ ...t }));
      if (delta < 0) {
        const filler = Array.from({ length: -delta }, (_, i) => `extra${i}`).join(" ");
        turns[5] = { ...turns[5], text: `${turns[5].text} ${filler}` };
        return { ...base, turns };
      }
      const eligibleEnd = turns.length - 5;
      let remaining = delta;
      for (let i = 5; i < eligibleEnd && remaining > 0; i++) {
        const words = turns[i].text.replace(/\[[^\]]*\]/g, " ").split(/\s+/).filter(Boolean);
        if (words.length <= remaining) {
          remaining -= words.length;
          turns[i] = { ...turns[i], text: "" };
        } else {
          turns[i] = { ...turns[i], text: words.slice(0, words.length - remaining).join(" ") };
          remaining = 0;
        }
      }
      if (remaining > 0) throw new Error(`test fixture error: not enough eligible words to remove ${delta} total words from this base script`);
      return { ...base, turns };
    }

    it("A: a real-evidence-shaped insufficient cut (large band, ~14% of the required reduction) escalates the NEXT sub-attempt with the exact numbers", async () => {
      // LARGE_OVERSHOOT is 1201 words; requiredReduction for the "large"
      // band is 1201 - 950 = 251, so half is 125.5. A 35-word cut (~14%,
      // the same order of magnitude as the real 21-of-118, ~18%) is
      // clearly insufficient.
      const insufficientCut = withExactTotalWordCount(LARGE_OVERSHOOT, 1166);

      vi.mocked(generateStructuredJson)
        .mockResolvedValueOnce(LARGE_OVERSHOOT) // outer attempt 1 (initial)
        .mockResolvedValueOnce(insufficientCut) // correction sub-attempt 1 -- 1201 -> 1166, only -35 of a required 251
        .mockResolvedValueOnce(buildValidScriptOutput()); // correction sub-attempt 2 -- resolves
      vi.mocked(generateEnrichment).mockResolvedValue(fakeEnrichment());

      await generateEpisodeScript(REQUEST_B2);

      const subAttempt1Prompt = vi.mocked(generateStructuredJson).mock.calls[1][0].messages[0].content as string;
      const subAttempt2Prompt = vi.mocked(generateStructuredJson).mock.calls[2][0].messages[0].content as string;

      // Nothing prior to compare against on the first correction call.
      expect(subAttempt1Prompt).not.toMatch(/INSUFFICIENT CUT/i);
      expect(subAttempt2Prompt).toMatch(/YOUR PREVIOUS ATTEMPT MADE ONLY A SMALL, INSUFFICIENT CUT/i);
      expect(subAttempt2Prompt).toMatch(/it went from 1201 to 1166 words/i);
      expect(subAttempt2Prompt).toMatch(/an actual reduction of only 35 word\(s\)/i);
      expect(subAttempt2Prompt).toMatch(/this pass required cutting at least 251 word\(s\)/i);
      expect(subAttempt2Prompt).toMatch(/leaving the script still 201 word\(s\) over the 965-word hard maximum/i);
      expect(subAttempt2Prompt).toMatch(/MUST make a MATERIALLY LARGER cut/i);
      // Mutually exclusive with the generic no-op warning -- this was not a no-op.
      expect(subAttempt2Prompt).not.toMatch(/YOUR PREVIOUS ATTEMPT FAILED TO MAKE A MEANINGFUL CHANGE/i);
    });

    it("B: a genuinely adequate large-band cut does NOT escalate the next sub-attempt", async () => {
      // 150 of the required 251 (~60%) is a real, substantial cut -- not
      // full compliance with "at least half of the 141-word turn" alone,
      // but well past the insufficiency threshold.
      const adequateCut = withExactTotalWordCount(LARGE_OVERSHOOT, 1051);

      vi.mocked(generateStructuredJson)
        .mockResolvedValueOnce(LARGE_OVERSHOOT)
        .mockResolvedValueOnce(adequateCut) // 1201 -> 1051, -150 of a required 251 -- adequate, still overshoot
        .mockResolvedValueOnce(buildValidScriptOutput()); // resolves
      vi.mocked(generateEnrichment).mockResolvedValue(fakeEnrichment());

      await generateEpisodeScript(REQUEST_B2);

      const subAttempt2Prompt = vi.mocked(generateStructuredJson).mock.calls[2][0].messages[0].content as string;
      expect(subAttempt2Prompt).not.toMatch(/INSUFFICIENT CUT/i);
      expect(subAttempt2Prompt).not.toMatch(/YOUR PREVIOUS ATTEMPT FAILED TO MAKE A MEANINGFUL CHANGE/i);
    });

    it("C: a byte-identical no-op in the large band still escalates via the EXISTING generic warning, never the new insufficient-progress one", async () => {
      vi.mocked(generateStructuredJson)
        .mockResolvedValueOnce(LARGE_OVERSHOOT)
        .mockResolvedValueOnce(LARGE_OVERSHOOT) // byte-identical no-op
        .mockResolvedValueOnce(buildValidScriptOutput());
      vi.mocked(generateEnrichment).mockResolvedValue(fakeEnrichment());

      await generateEpisodeScript(REQUEST_B2);

      const subAttempt2Prompt = vi.mocked(generateStructuredJson).mock.calls[2][0].messages[0].content as string;
      expect(subAttempt2Prompt).toMatch(/YOUR PREVIOUS ATTEMPT FAILED TO MAKE A MEANINGFUL CHANGE/i);
      expect(subAttempt2Prompt).not.toMatch(/INSUFFICIENT CUT/i);
    });

    it("D: an INCREASED word count in the large band still escalates via the EXISTING generic warning, never the new insufficient-progress one", async () => {
      const increased: ScriptGenerationOutput = { ...LARGE_OVERSHOOT, turns: [...LARGE_OVERSHOOT.turns, { speaker: 0, text: "One more turn that adds several extra spoken words to the total count." }] };
      expect(countWords(increased.turns)).toBeGreaterThan(countWords(LARGE_OVERSHOOT.turns));

      vi.mocked(generateStructuredJson)
        .mockResolvedValueOnce(LARGE_OVERSHOOT)
        .mockResolvedValueOnce(increased) // word count went UP
        .mockResolvedValueOnce(buildValidScriptOutput());
      vi.mocked(generateEnrichment).mockResolvedValue(fakeEnrichment());

      await generateEpisodeScript(REQUEST_B2);

      const subAttempt2Prompt = vi.mocked(generateStructuredJson).mock.calls[2][0].messages[0].content as string;
      expect(subAttempt2Prompt).toMatch(/YOUR PREVIOUS ATTEMPT FAILED TO MAKE A MEANINGFUL CHANGE/i);
      expect(subAttempt2Prompt).not.toMatch(/INSUFFICIENT CUT/i);
    });

    it("E: meaningful-band insufficient progress escalates via the SAME shared insufficient-progress text, not the compression band's own no-op text", async () => {
      // NEAR_CEILING_OVERSHOOT is 999 words (34 over, "meaningful" band).
      // requiredReduction = 999 - 960 = 39, half = 19.5 -- a 10-word cut is
      // clearly insufficient.
      const insufficientCut = withExactTotalWordCount(NEAR_CEILING_OVERSHOOT, 989);

      vi.mocked(generateStructuredJson)
        .mockResolvedValueOnce(NEAR_CEILING_OVERSHOOT) // outer attempt 1 (initial) -- 999 words
        .mockResolvedValueOnce(insufficientCut) // correction sub-attempt 1 -- 999 -> 989, only -10 of a required 39
        .mockResolvedValueOnce(buildValidScriptOutput()); // correction sub-attempt 2 -- resolves
      vi.mocked(generateEnrichment).mockResolvedValue(fakeEnrichment());

      await generateEpisodeScript(REQUEST_B2);

      const subAttempt2Prompt = vi.mocked(generateStructuredJson).mock.calls[2][0].messages[0].content as string;
      expect(subAttempt2Prompt).toMatch(/YOUR PREVIOUS ATTEMPT MADE ONLY A SMALL, INSUFFICIENT CUT/i);
      expect(subAttempt2Prompt).toMatch(/it went from 999 to 989 words/i);
      expect(subAttempt2Prompt).toMatch(/an actual reduction of only 10 word\(s\)/i);
      expect(subAttempt2Prompt).toMatch(/this pass required cutting at least 39 word\(s\)/i);
      // Never the compression band's OWN no-op text -- this was not a no-op.
      expect(subAttempt2Prompt).not.toMatch(/YOUR PREVIOUS ATTEMPT AT THIS COMPRESSION MADE NO PROGRESS/i);
    });

    it("F: large-band boundary -- exactly half the required reduction does NOT escalate, one word less than half DOES", async () => {
      // requiredReduction = 1201 - 950 = 251; half = 125.5.
      const exactlyHalf = withExactTotalWordCount(LARGE_OVERSHOOT, 1075); // 1201 - 126 = 1075, 126 > 125.5 -- sufficient
      const oneUnderHalf = withExactTotalWordCount(LARGE_OVERSHOOT, 1076); // 1201 - 125 = 1076, 125 < 125.5 -- insufficient

      vi.mocked(generateStructuredJson)
        .mockResolvedValueOnce(LARGE_OVERSHOOT)
        .mockResolvedValueOnce(exactlyHalf)
        .mockResolvedValueOnce(buildValidScriptOutput());
      vi.mocked(generateEnrichment).mockResolvedValue(fakeEnrichment());
      await generateEpisodeScript(REQUEST_B2);
      expect(vi.mocked(generateStructuredJson).mock.calls[2][0].messages[0].content as string).not.toMatch(/INSUFFICIENT CUT/i);

      vi.mocked(generateStructuredJson)
        .mockReset()
        .mockResolvedValueOnce(LARGE_OVERSHOOT)
        .mockResolvedValueOnce(oneUnderHalf)
        .mockResolvedValueOnce(buildValidScriptOutput());
      vi.mocked(generateEnrichment).mockResolvedValue(fakeEnrichment());
      await generateEpisodeScript(REQUEST_B2);
      expect(vi.mocked(generateStructuredJson).mock.calls[2][0].messages[0].content as string).toMatch(/INSUFFICIENT CUT/i);
    });

    it("G: small-band behavior is byte-for-byte unchanged -- the new mechanism never reaches buildFinalBoundaryCorrectionInstruction()", async () => {
      // SMALL_OVERSHOOT is 967 words (2 over, "small" band). A 1-word cut
      // (967 -> 966, still 1 over) would be a small fraction of a
      // requested-cut ratio if the small band computed one -- but it
      // never does, since previousAttemptWasInsufficient is only ever
      // wired into the "large" and "meaningful" branches.
      const barelyTrimmed = withExactTotalWordCount(SMALL_OVERSHOOT, 966);
      vi.mocked(generateStructuredJson)
        .mockResolvedValueOnce(SMALL_OVERSHOOT)
        .mockResolvedValueOnce(barelyTrimmed)
        .mockResolvedValueOnce(buildValidScriptOutput());
      vi.mocked(generateEnrichment).mockResolvedValue(fakeEnrichment());

      await generateEpisodeScript(REQUEST_B2);

      const subAttempt2Prompt = vi.mocked(generateStructuredJson).mock.calls[2][0].messages[0].content as string;
      expect(subAttempt2Prompt).not.toMatch(/INSUFFICIENT CUT/i);
      // The small band's own existing final-boundary escalation is
      // completely unaffected -- still fires exactly as before this fix,
      // driven only by previousAttemptWasNoOp (untouched signature).
      expect(subAttempt2Prompt).toMatch(/FINAL boundary correction/i);
    });

    it("I: Fix #11 -- an insufficient sub-attempt 2 that EXHAUSTS its invocation now carries the escalation into the NEXT invocation's sub-attempt 0 too, not just within one invocation", async () => {
      // Mirrors the real log's calls 3-4 (1189 -> 1150 -> 1143, a cut far
      // short of what was required) exhausting into Fix #9's continuation
      // (calls 5-6). BEFORE Fix #11, the continuation's first sub-attempt
      // started with fresh state and never saw sub-attempt 2's insufficient
      // outcome -- this test's ORIGINAL assertion. Fix #11 carries that
      // outcome across the boundary, so this test's expectation flips.
      const subAttempt1 = withExactTotalWordCount(LARGE_OVERSHOOT, 1166); // 1201 -> 1166, insufficient (required 251)
      const subAttempt2 = withExactTotalWordCount(subAttempt1, 1136); // 1166 -> 1136, still insufficient -- exhausts this invocation
      const continuationSubAttempt1 = withExactTotalWordCount(subAttempt2, 996); // 1136 -> 996, ADEQUATE for its own call (required 1136-950=186, half=93)
      const continuationSubAttempt2 = { ...buildValidScriptOutput() }; // resolves

      vi.mocked(generateStructuredJson)
        .mockResolvedValueOnce(LARGE_OVERSHOOT) // outer attempt 1 (initial)
        .mockResolvedValueOnce(subAttempt1) // outer attempt 1's correction, sub-attempt 1 -- insufficient
        .mockResolvedValueOnce(subAttempt2) // sub-attempt 2 -- exhausted, still overshoot -> cefrRecoveryPending seeds
        .mockResolvedValueOnce(continuationSubAttempt1) // outer attempt 2 (Fix #9 continuation) -- carries Fix #11 state, sub-attempt 1
        .mockResolvedValueOnce(continuationSubAttempt2); // sub-attempt 2 -- resolves
      vi.mocked(generateEnrichment).mockResolvedValue(fakeEnrichment());

      await generateEpisodeScript(REQUEST_B2);

      const calls = vi.mocked(generateStructuredJson).mock.calls;
      // Call index 2 (outer attempt 1's correction sub-attempt 2) DOES see
      // the escalation from sub-attempt 1's insufficient cut -- unaffected
      // by Fix #11, same as before.
      expect(calls[2][0].messages[0].content as string).toMatch(/YOUR PREVIOUS ATTEMPT MADE ONLY A SMALL, INSUFFICIENT CUT/i);
      // Call index 3 -- the FIRST sub-attempt of the NEW continuation
      // invocation (Fix #9) -- Fix #11: NOW carries sub-attempt 2's
      // insufficient outcome (1166->1136, only -30 of a required 216)
      // forward, instead of starting cold.
      const continuationPrompt = calls[3][0].messages[0].content as string;
      expect(continuationPrompt).toMatch(/YOUR PREVIOUS ATTEMPT MADE ONLY A SMALL, INSUFFICIENT CUT/i);
      expect(continuationPrompt).toMatch(/it went from 1166 to 1136 words/i);
      expect(continuationPrompt).toMatch(/an actual reduction of only 30 word\(s\)/i);
      expect(continuationPrompt).toMatch(/this pass required cutting at least 216 word\(s\)/i);
      // And since continuationSubAttempt1's cut (140 of a required 186) is
      // adequate, the continuation's own sub-attempt 2 (call index 4)
      // carries no escalation of any kind -- carried state does not persist
      // past the sub-attempt it was consumed by.
      expect(calls[4][0].messages[0].content as string).not.toMatch(/INSUFFICIENT CUT/i);
      expect(calls[4][0].messages[0].content as string).not.toMatch(/FAILED TO MAKE A MEANINGFUL CHANGE/i);
    });
  });

  /**
   * FIX #11 (CROSS-INVOCATION CARRY-OVER): a real GitHub Actions failure
   * (word-count trajectory 1152->1133->1120->1120->1103->1081->1050->1050->
   * 1050->1038->1015->1006) showed the SAME correction-pass call producing
   * two DIFFERENT true no-ops (1120->1120, ending one invocation; then
   * 1050->1050 immediately followed by ANOTHER 1050->1050) even with Fix
   * #10 already confirmed working. Root cause: Fix #9's continuation starts
   * every new runWordCountCorrection() invocation with fresh local state
   * (previousAttemptWasNoOp=false, previousAttemptWasInsufficient=null),
   * so the SECOND 1050->1050 received NO escalation at all, despite the
   * FIRST 1050->1050 (from the immediately preceding invocation) being
   * exactly the kind of outcome the escalation mechanism exists to react
   * to. This fix carries that final outcome across the boundary via
   * generateEpisodeScript()'s own carriedNoOp/carriedInsufficient (updated
   * in lockstep with cefrRecoveryPending) and runWordCountCorrection()'s
   * new initialWasNoOp/initialWasInsufficient parameters.
   */
  describe("generateEpisodeScript — Fix #11: cross-invocation no-op/insufficient-progress carry-over", () => {
    // Same implementation as the Fix #10 describe block's own helper of the
    // same name -- that one is local to its own describe's function scope
    // and not visible here, so this is a local copy rather than a shared
    // hoist, matching this file's existing per-fix fixture-locality
    // convention.
    function withExactTotalWordCount(base: ScriptGenerationOutput, targetTotal: number): ScriptGenerationOutput {
      const currentTotal = countWords(base.turns);
      const delta = currentTotal - targetTotal;
      const turns = base.turns.map((t) => ({ ...t }));
      if (delta < 0) {
        const filler = Array.from({ length: -delta }, (_, i) => `extra${i}`).join(" ");
        turns[5] = { ...turns[5], text: `${turns[5].text} ${filler}` };
        return { ...base, turns };
      }
      const eligibleEnd = turns.length - 5;
      let remaining = delta;
      for (let i = 5; i < eligibleEnd && remaining > 0; i++) {
        const words = turns[i].text.replace(/\[[^\]]*\]/g, " ").split(/\s+/).filter(Boolean);
        if (words.length <= remaining) {
          remaining -= words.length;
          turns[i] = { ...turns[i], text: "" };
        } else {
          turns[i] = { ...turns[i], text: words.slice(0, words.length - remaining).join(" ") };
          remaining = 0;
        }
      }
      if (remaining > 0) throw new Error(`test fixture error: not enough eligible words to remove ${delta} total words from this base script`);
      return { ...base, turns };
    }

    it("J: a true no-op that ENDS an invocation carries the generic no-op escalation into the NEXT invocation's sub-attempt 0", async () => {
      const sub1 = withExactTotalWordCount(LARGE_OVERSHOOT, 1150); // 1201 -> 1150, a real cut
      // sub2 returns the SAME object as sub1 -- guaranteed byte-identical,
      // so isSameScript() is true regardless of word-count comparison.
      vi.mocked(generateStructuredJson)
        .mockResolvedValueOnce(LARGE_OVERSHOOT) // outer attempt 1 (initial)
        .mockResolvedValueOnce(sub1) // correction sub-attempt 1
        .mockResolvedValueOnce(sub1) // correction sub-attempt 2 -- byte-identical no-op, exhausts this invocation
        .mockResolvedValueOnce(buildValidScriptOutput()); // outer attempt 2 (Fix #9 continuation) -- carries Fix #11 no-op state, resolves
      vi.mocked(generateEnrichment).mockResolvedValue(fakeEnrichment());

      await generateEpisodeScript(REQUEST_B2);

      const continuationPrompt = vi.mocked(generateStructuredJson).mock.calls[3][0].messages[0].content as string;
      expect(continuationPrompt).toMatch(/YOUR PREVIOUS ATTEMPT FAILED TO MAKE A MEANINGFUL CHANGE/i);
      expect(continuationPrompt).not.toMatch(/INSUFFICIENT CUT/i);
    });

    it("K: state does not leak once the chain clears for a DIFFERENT reason (the correction pass resolves word count but introduces a new issue) -- a LATER, unrelated correction pass starts completely cold", async () => {
      const lowProsodyButInRange = buildInRangeLowProsodyOutput();
      vi.mocked(generateStructuredJson)
        .mockResolvedValueOnce(LARGE_OVERSHOOT) // outer attempt 1 (initial) -- pure overshoot
        .mockResolvedValueOnce(LARGE_OVERSHOOT) // correction sub-attempt 1 -- byte-identical no-op
        .mockResolvedValueOnce(lowProsodyButInRange) // correction sub-attempt 2 -- word count now fine, but a NEW (prosody) issue appears -> clears cefrRecoveryPending/carried state
        .mockResolvedValueOnce(LARGE_OVERSHOOT) // outer attempt 2 (generic revision, since cefrRecoveryPending is now false) -- a FRESH, unrelated overshoot
        .mockResolvedValueOnce(buildValidScriptOutput()); // outer attempt 2's inline correction, sub-attempt 1 -- resolves
      vi.mocked(generateEnrichment).mockResolvedValue(fakeEnrichment());

      await generateEpisodeScript(REQUEST_B2);

      const calls = vi.mocked(generateStructuredJson).mock.calls;
      // Call index 3 is the generic revision (proves cefrRecoveryPending
      // really did clear after the prosody issue appeared).
      expect(calls[3][0].schemaName).toBe("linguabc_podcast_script");
      // Call index 4 -- the NEW, unrelated correction pass's sub-attempt 0
      // -- must NOT carry the earlier byte-identical no-op forward, even
      // though it occurred earlier in the SAME run.
      const laterCorrectionPrompt = calls[4][0].messages[0].content as string;
      expect(laterCorrectionPrompt).not.toMatch(/FAILED TO MAKE A MEANINGFUL CHANGE/i);
      expect(laterCorrectionPrompt).not.toMatch(/INSUFFICIENT CUT/i);
    });

    it("L: replays today's real 1081 -> 1050 -> 1050 shape -- the SECOND 1050 (start of a new continuation invocation) now receives the escalation the real run never got", async () => {
      const initialOvershoot = withExactTotalWordCount(LARGE_OVERSHOOT, 1081); // matches the real run's pre-1050 state exactly
      expect(validateGeneratedScript(initialOvershoot, REQUEST_B2)).toHaveLength(1);
      const afterFirstCut = withExactTotalWordCount(initialOvershoot, 1050); // 1081 -> 1050, matches the real -31 cut exactly

      vi.mocked(generateStructuredJson)
        .mockResolvedValueOnce(initialOvershoot) // outer attempt 1 (initial) -- 1081 words, matches real call 7's input
        .mockResolvedValueOnce(afterFirstCut) // correction sub-attempt 1 -- 1081 -> 1050, matches real call 7's output
        .mockResolvedValueOnce(afterFirstCut) // correction sub-attempt 2 -- SAME object -> byte-identical no-op, matches real call 8 (1050 -> 1050) exactly, exhausts this invocation
        // Real run's bug: the next call (real call 9) started cold and
        // ALSO came back a no-op, with no escalation ever sent. Fix #11:
        // this call now carries the no-op escalation from the line above.
        .mockResolvedValueOnce(withExactTotalWordCount(afterFirstCut, 1038)) // outer attempt 2 (Fix #9 continuation), sub-attempt 1 -- 1050 -> 1038, a real cut this time
        .mockResolvedValueOnce(buildValidScriptOutput()); // sub-attempt 2 -- resolves
      vi.mocked(generateEnrichment).mockResolvedValue(fakeEnrichment());

      const result = await generateEpisodeScript(REQUEST_B2);

      const calls = vi.mocked(generateStructuredJson).mock.calls;
      const schemaNames = calls.map((c) => c[0].schemaName);
      // Fix #9 confirmed intact: every call after the initial is a
      // correction call, never a generic revision.
      expect(schemaNames.slice(1)).toEqual(schemaNames.slice(1).map(() => "linguabc_podcast_script_word_count_correction"));
      // Fix #11: call index 3 -- the exact position of the real run's
      // second, unescalated 1050->1050 -- now carries the no-op escalation.
      expect(calls[3][0].messages[0].content as string).toMatch(/YOUR PREVIOUS ATTEMPT FAILED TO MAKE A MEANINGFUL CHANGE/i);
      expect(result.wordCount).toBe(950);
    });
  });
  });
});

/**
 * DIAGNOSTIC-ONLY TELEMETRY for the word-count correction pass (added to
 * distinguish, on a future failure, model non-compliance with the selected
 * target from an ineffective/exhausted target -- see the investigation
 * this closes the gap on). A separate, self-contained top-level describe
 * block (its own fixtures/helpers, its own beforeEach) rather than
 * inserted into the existing nested nested describe structure above, so it
 * carries no dependency on that structure's exact nesting. Reuses the same
 * module-level vi.mock(...) calls at the top of this file -- no new mocks.
 *
 * These tests deliberately drive generateEpisodeScript() to its FINAL
 * failure throw in every case: the new telemetry fields are only visible
 * in formatTrajectory()'s output, which is only ever included in that
 * thrown error message, never in a successful return value.
 */
describe("generateEpisodeScript — diagnostic-only word-count-correction telemetry (target/reduction)", () => {
  const REQUEST_B2: ScriptGenerationRequest = {
    speaker0Name: "Sarah",
    speaker1Name: "Hannah",
    cefrLevel: "B2",
    usedTitles: [],
    usedTopicTags: [],
  };

  const stripTags = (t: string) => t.replace(/\[[^\]]*\]/g, " ");
  const countWords = (turns: ScriptGenerationOutput["turns"]) => turns.reduce((sum, t) => sum + stripTags(t.text).split(/\s+/).filter(Boolean).length, 0);

  beforeEach(() => {
    vi.resetAllMocks();
  });

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
    for (let i = 0; i < 24; i++) turns.push({ speaker: (i % 2) as 0 | 1, text: fillerTemplates[i % fillerTemplates.length] });
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

  function fakeEnrichment(): EnrichmentResult {
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
    };
  }

  /** Same construction this file's own "dedicated word-count correction
   * pass" describe block already uses for its LARGE_OVERSHOOT/
   * NEAR_CEILING_OVERSHOOT fixtures -- copied here (not imported/shared
   * across describe scopes) so this block stays fully self-contained. */
  function buildCueRichOvershootOutput(targetMinWords: number): ScriptGenerationOutput {
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
    let i = 0;
    while (countWords(turns) < targetMinWords) {
      turns.push({ speaker: (i % 2) as 0 | 1, text: fillerTemplates[i % fillerTemplates.length] });
      i++;
    }
    turns.push({ speaker: 0, text: "...and honestly I think the whole point is that we—" });
    turns.push({ speaker: 1, text: "—never actually finish that argument? Yeah, I've noticed." });
    turns.push({ speaker: 0, text: "[reflective] Well, that gives us a lot to think about before next time." });
    turns.push({ speaker: 1, text: "It really does. [warm] That has been LinguABC -- thanks for listening, and we will catch you in the next one." });
    return { title: "Test Episode", topic: "Testing", topicTags: ["Testing"], cefrLevel: "B2", turns };
  }

  const LARGE_OVERSHOOT = buildCueRichOvershootOutput(1150); // 1201 words -- 236 over the 965 ceiling, "large" band
  const NEAR_CEILING_OVERSHOOT = buildCueRichOvershootOutput(940); // 999 words -- 34 over, "meaningful" band

  /** Same total-word-count-targeting helper this file's own "Fix #10"
   * describe block already uses -- copied, not shared, for the same
   * self-containment reason as buildCueRichOvershootOutput above. */
  function withExactTotalWordCount(base: ScriptGenerationOutput, targetTotal: number): ScriptGenerationOutput {
    const currentTotal = countWords(base.turns);
    const delta = currentTotal - targetTotal;
    const turns = base.turns.map((t) => ({ ...t }));
    if (delta < 0) {
      const filler = Array.from({ length: -delta }, (_, i) => `extra${i}`).join(" ");
      turns[5] = { ...turns[5], text: `${turns[5].text} ${filler}` };
      return { ...base, turns };
    }
    const eligibleEnd = turns.length - 5;
    let remaining = delta;
    for (let i = 5; i < eligibleEnd && remaining > 0; i++) {
      const words = turns[i].text.replace(/\[[^\]]*\]/g, " ").split(/\s+/).filter(Boolean);
      if (words.length <= remaining) {
        remaining -= words.length;
        turns[i] = { ...turns[i], text: "" };
      } else {
        turns[i] = { ...turns[i], text: words.slice(0, words.length - remaining).join(" ") };
        remaining = 0;
      }
    }
    if (remaining > 0) throw new Error(`test fixture error: not enough eligible words to remove ${delta} total words from this base script`);
    return { ...base, turns };
  }

  /**
   * A small-band overshoot (967 words, 2 over the 965 ceiling) built the
   * SAME way this file's own "9: when every turn is structurally
   * protected..." fixture is (a continuous em-dash interruption chain
   * protects every turn from selectLargeCutTarget()'s candidacy, alongside
   * the always-protected hook/closing/opening-block turns), just much
   * shorter -- for proving requirement 3 (null target metadata when none
   * exists) specifically in the "small" band, which Fix #13 proved CAN
   * otherwise have a real target (see this file's "Fix #13 (1)" test) --
   * so this fixture must genuinely have zero eligible turns, not merely be
   * small-band-sized.
   */
  function buildSmallOvershootNoTarget(): ScriptGenerationOutput {
    const turns: ScriptGenerationOutput["turns"] = [
      { speaker: 0, text: "[thoughtful] I once forgot my own name for ten seconds after waking up in a strange hotel room, and it genuinely rattled me for the rest of the morning." },
      { speaker: 1, text: "Wait, seriously? That sounds terrifying—" },
      { speaker: 0, text: "—Anyway, I'm Sarah, and it really did rattle me—" },
      { speaker: 1, text: "—And I'm Hannah. This is LinguABC, and today we're talking about the strange ways memory can fail us—" },
    ];
    const fillerTemplates = [
      "—and further, [thoughtful] this genuinely matters because it connects to what we discussed earlier and adds real texture to the point, keeping the thread going for quite a while now. [reflective] It really does keep unfolding the same idea from a slightly different angle every time we come back to it, on and on—",
      "—right, and it is not just about memory either, [curious] it is about how much we trust an ordinary morning without ever questioning it at all, which is strange when you actually sit with it. [amused] People rarely notice until something breaks the pattern entirely, on and on—",
    ];
    let i = 0;
    while (countWords(turns) < 940) {
      turns.push({ speaker: ((i + 1) % 2) as 0 | 1, text: fillerTemplates[i % fillerTemplates.length] });
      i++;
    }
    // Pad the last filler turn's word count precisely (inserting whole
    // words just before its trailing em dash, so the dash-chain protection
    // is preserved) to land at EXACTLY 967 total -- 2 over the 965
    // ceiling, "small" band -- calibrated directly against this exact
    // fixture shape before writing this test, not guessed.
    const lastIdx = turns.length - 1;
    const dashMatch = turns[lastIdx].text.match(/(—)\s*$/);
    const dash = dashMatch ? dashMatch[1] : "";
    const withoutDash = dash ? turns[lastIdx].text.slice(0, turns[lastIdx].text.length - dashMatch![0].length) : turns[lastIdx].text;
    turns[lastIdx] = { ...turns[lastIdx], text: `${withoutDash} extra extra extra extra extra${dash}` };
    turns.push({ speaker: 1, text: "It really does. [warm] That has been LinguABC -- thanks for listening, and we will catch you in the next one." });
    return { title: "Test Episode", topic: "Testing", topicTags: ["Testing"], cefrLevel: "B2", turns };
  }

  const SMALL_OVERSHOOT_NO_TARGET = buildSmallOvershootNoTarget();

  it("fixture sanity check: the small-band no-target fixture is exactly 967 words, fails ONLY word count, and selectLargeCutTarget() genuinely finds nothing", () => {
    expect(countWords(SMALL_OVERSHOOT_NO_TARGET.turns)).toBe(967);
    const issues = validateGeneratedScript(SMALL_OVERSHOOT_NO_TARGET, REQUEST_B2);
    expect(issues).toHaveLength(1);
    expect(issues[0].message).toMatch(/^Word count 967 is outside/);
    expect(selectLargeCutTarget(SMALL_OVERSHOOT_NO_TARGET, REQUEST_B2)).toBeNull();
  });

  it("large-band correction logs the selected target turn's index and word count, and no script text ever appears in the trajectory", async () => {
    // A perpetual no-op (the model always returns the identical 1201-word
    // draft) so the run exhausts MAX_ATTEMPTS and the trajectory becomes
    // visible in the final thrown error's message.
    vi.mocked(generateStructuredJson).mockResolvedValue(LARGE_OVERSHOOT);
    vi.mocked(generateEnrichment).mockResolvedValue(fakeEnrichment());

    // Confirmed directly against selectLargeCutTarget() itself first, not
    // just inferred from the formatted trajectory text below.
    const target = selectLargeCutTarget(LARGE_OVERSHOOT, REQUEST_B2);
    expect(target?.turnIndex).toBe(5);
    expect(target?.wordCount).toBe(32);

    let thrown: Error | undefined;
    try {
      await generateEpisodeScript(REQUEST_B2);
    } catch (error) {
      thrown = error as Error;
    }
    expect(thrown).toBeDefined();
    const message = thrown!.message;

    // requiredReduction for a 1201-word input in the "large" band is
    // wordCountCorrectionTarget(1201).max = 950, so 1201 - 950 = 251 --
    // the exact same number the existing correction-prompt text already
    // asserts elsewhere in this file (test A's "Cut approximately
    // 251-266 spoken words"), never a second/duplicated calculation.
    // actualReduction is 0 -- a genuine no-op.
    expect(message).toMatch(/attempt 2 \[word-count correction\]: 1201 words -- word count \[target: turn #5 \(32 words\), reduction: 0\/251 required\]/);
    expect(message).toMatch(/attempt 3 \[word-count correction\]: 1201 words -- word count \[target: turn #5 \(32 words\), reduction: 0\/251 required\]/);

    // Never the actual generated dialogue, the target turn's own text, or
    // raw JSON, anywhere in the error -- requirement 2's "NEVER log the
    // target turn text" and this interface's pre-existing content-free
    // contract, both still holding with the new fields present.
    expect(message).not.toContain("hotel room");
    expect(message).not.toContain("genuinely interesting way to think about it");
    expect(message).not.toContain('"turns":[');
    expect(message).not.toContain('{"speaker"');
  });

  it("meaningful-band correction logs the selected target turn's index and word count", async () => {
    vi.mocked(generateStructuredJson).mockResolvedValue(NEAR_CEILING_OVERSHOOT);
    vi.mocked(generateEnrichment).mockResolvedValue(fakeEnrichment());

    const target = selectLargeCutTarget(NEAR_CEILING_OVERSHOOT, REQUEST_B2);
    expect(target?.turnIndex).toBe(5);
    expect(target?.wordCount).toBe(32);

    let thrown: Error | undefined;
    try {
      await generateEpisodeScript(REQUEST_B2);
    } catch (error) {
      thrown = error as Error;
    }
    expect(thrown).toBeDefined();
    const message = thrown!.message;

    // requiredReduction for a 999-word input in the "meaningful" band is
    // wordCountCorrectionTarget(999).max = 960 (NEAR_CEILING_TARGET_MAX),
    // so 999 - 960 = 39 -- the same number test B elsewhere in this file
    // already asserts ("Cut approximately 39-44 spoken words").
    expect(message).toMatch(/attempt 2 \[word-count correction\]: 999 words -- word count \[target: turn #5 \(32 words\), reduction: 0\/39 required\]/);
  });

  it("small-band correction logs null target metadata when selectLargeCutTarget() genuinely finds no eligible turn", async () => {
    vi.mocked(generateStructuredJson).mockResolvedValue(SMALL_OVERSHOOT_NO_TARGET);
    vi.mocked(generateEnrichment).mockResolvedValue(fakeEnrichment());

    let thrown: Error | undefined;
    try {
      await generateEpisodeScript(REQUEST_B2);
    } catch (error) {
      thrown = error as Error;
    }
    expect(thrown).toBeDefined();
    const message = thrown!.message;

    // requiredReduction for a 967-word input in the "small" band is
    // wordCountCorrectionTarget(967).max = WORD_COUNT_HARD_MAX (965) --
    // the small band's own target ceiling IS the hard max -- so
    // 967 - 965 = 2, the exact deficit this band's own prompt text states
    // directly ("You are exactly 2 word(s) over the 965-word hard
    // maximum").
    expect(message).toMatch(/attempt 2 \[word-count correction\]: 967 words -- word count \[target: none, reduction: 0\/2 required\]/);
  });

  it("actualReduction and requiredReduction match the exact real numbers for a genuine (non-zero, non-no-op) cut", async () => {
    // Reuses the identical scenario this file's own "Fix #10 test A"
    // already verifies via the escalation prompt text (1201 -> 1166, an
    // actual reduction of 35 against a required 251) -- this test checks
    // the SAME real numbers now also appear in the trajectory telemetry,
    // never a second/duplicated calculation of either figure.
    const insufficientCut = withExactTotalWordCount(LARGE_OVERSHOOT, 1166);
    vi.mocked(generateStructuredJson)
      .mockResolvedValueOnce(LARGE_OVERSHOOT) // outer attempt 1 (initial)
      .mockResolvedValueOnce(insufficientCut) // correction sub-attempt 1 -- the entry under test: 1201 -> 1166
      .mockResolvedValue(insufficientCut); // stalls forever afterward -- guarantees the run eventually fails, exposing the trajectory
    vi.mocked(generateEnrichment).mockResolvedValue(fakeEnrichment());

    let thrown: Error | undefined;
    try {
      await generateEpisodeScript(REQUEST_B2);
    } catch (error) {
      thrown = error as Error;
    }
    expect(thrown).toBeDefined();
    const message = thrown!.message;

    expect(message).toMatch(/attempt 2 \[word-count correction\]: 1166 words -- word count \[target: turn #5 \(32 words\), reduction: 35\/251 required\]/);
  });

  it("Fix #9/#10/#11/#13 routing behavior is unaffected: a full run using the SAME real trajectory shape still converges exactly as before, with the new fields simply added alongside", async () => {
    // Mirrors this file's own pre-existing "D" test (Fix #9's generalized
    // continuation) byte-for-byte in its mock sequence and assertions on
    // attempts/call count/schemaName -- proving the new telemetry is
    // strictly additive and changes no existing routing decision.
    vi.mocked(generateStructuredJson)
      .mockResolvedValueOnce(LARGE_OVERSHOOT) // outer attempt 1 (initial)
      .mockResolvedValueOnce(LARGE_OVERSHOOT) // correction sub-attempt 1 -- still overshoot
      .mockResolvedValueOnce(LARGE_OVERSHOOT) // correction sub-attempt 2 -- still overshoot, bound exhausted
      .mockResolvedValueOnce(buildValidScriptOutput()); // outer attempt 2 -- Fix #9 continuation, resolves
    vi.mocked(generateEnrichment).mockResolvedValue(fakeEnrichment());

    const result = await generateEpisodeScript(REQUEST_B2);

    expect(result.wordCount).toBe(950);
    expect(result.attempts).toBe(2);
    expect(vi.mocked(generateStructuredJson)).toHaveBeenCalledTimes(4);
    expect(vi.mocked(generateStructuredJson).mock.calls[1][0].schemaName).toBe("linguabc_podcast_script_word_count_correction");
    expect(vi.mocked(generateStructuredJson).mock.calls[2][0].schemaName).toBe("linguabc_podcast_script_word_count_correction");
    expect(vi.mocked(generateStructuredJson).mock.calls[3][0].schemaName).toBe("linguabc_podcast_script_word_count_correction");
  });
});

/**
 * FIX #14 (CEFR EROSION DURING WORD-COUNT CORRECTION): a real GitHub
 * Actions run requested C2, converged word count correctly (992->969->
 * 969->968->968->967->967->967->967->967->961, entirely inside the
 * dedicated correction pass), then failed authoritative grading at
 * cefrLevelMin=B1/cefrLevelMax=B2 -- see buildWordCountCorrectionMessage()'s
 * own "FIX #14" doc comment and generateAndCheckEnrichment()'s own doc
 * comment for the full root-cause writeup this test suite verifies.
 *
 * A separate, self-contained top-level describe block (own fixtures, own
 * beforeEach), same reasoning as the telemetry describe block above.
 */
describe("generateEpisodeScript — Fix #14: CEFR-level enforcement during word-count correction and authoritative grading", () => {
  const REQUEST_B2: ScriptGenerationRequest = {
    speaker0Name: "Sarah",
    speaker1Name: "Hannah",
    cefrLevel: "B2",
    usedTitles: [],
    usedTopicTags: [],
  };
  const REQUEST_C2: ScriptGenerationRequest = { ...REQUEST_B2, cefrLevel: "C2" };

  const stripTags = (t: string) => t.replace(/\[[^\]]*\]/g, " ");
  const countWords = (turns: ScriptGenerationOutput["turns"]) => turns.reduce((sum, t) => sum + stripTags(t.text).split(/\s+/).filter(Boolean).length, 0);

  beforeEach(() => {
    vi.resetAllMocks();
  });

  function buildValidScriptOutput(cefrLevel: ScriptGenerationOutput["cefrLevel"] = "B2"): ScriptGenerationOutput {
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
    for (let i = 0; i < 24; i++) turns.push({ speaker: (i % 2) as 0 | 1, text: fillerTemplates[i % fillerTemplates.length] });
    turns.push({ speaker: 0, text: "...and honestly I think the whole point is that we—" });
    turns.push({ speaker: 1, text: "—never actually finish that argument? Yeah, I've noticed." });
    turns.push({ speaker: 0, text: "[reflective] Well, that gives us a lot to think about before next time." });
    turns.push({ speaker: 1, text: "It really does. [warm] That has been LinguABC -- thanks for listening, and we will catch you in the next one." });
    while (countWords(turns) < 950) {
      const last = turns[turns.length - 1];
      turns[turns.length - 1] = { ...last, text: `${last.text} genuinely` };
    }
    return { title: "Test Episode", topic: "Testing", topicTags: ["Testing"], cefrLevel, turns };
  }

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

  /** A small, 967-word (2-over-ceiling, "small" band) overshoot -- enough
   * to exercise the dedicated correction pass without LARGE_OVERSHOOT's
   * much larger fixture machinery, since these tests only need the
   * correction pass to run ONCE and check its prompt text/outcome, not
   * exercise band-selection edge cases (already covered elsewhere). */
  function buildSmallOvershootOutput(cefrLevel: ScriptGenerationOutput["cefrLevel"]): ScriptGenerationOutput {
    const base = buildValidScriptOutput(cefrLevel);
    const turns = base.turns.map((t) => ({ ...t }));
    const idx = 5; // first filler turn -- never the protected opening/interruption/closing turns
    const extra = Array.from({ length: 967 - countWords(base.turns) }, (_, i) => `extra${i}`).join(" ");
    turns[idx] = { ...turns[idx], text: `${turns[idx].text} ${extra}` };
    return { ...base, turns };
  }

  it("fixture sanity check: the small-overshoot fixture is exactly 967 words and fails ONLY word count", () => {
    const fixture = buildSmallOvershootOutput("C2");
    expect(countWords(fixture.turns)).toBe(967);
    const issues = validateGeneratedScript(fixture, REQUEST_C2);
    expect(issues).toHaveLength(1);
    expect(issues[0].message).toMatch(/^Word count 967 is outside/);
  });

  it("C2 remains required for a C2 request: a genuinely C2-graded script passes end to end", async () => {
    vi.mocked(generateStructuredJson).mockResolvedValueOnce(buildValidScriptOutput("C2"));
    vi.mocked(generateEnrichment).mockResolvedValue(fakeEnrichment({ cefrLevelMin: "C2", cefrLevelMax: "C2" }));

    const result = await generateEpisodeScript(REQUEST_C2);

    expect(result.wordCount).toBe(950);
    expect(result.enrichment.cefrLevelMin).toBe("C2");
  });

  it("B1/B2 output is rejected for a C2 request -- replays the exact real production failure (cefrLevelMin=B1/cefrLevelMax=B2)", async () => {
    // Structurally valid and in-range every attempt -- the ONLY reason
    // every attempt fails is the authoritative CEFR grade, exactly
    // matching the real run's shape (word count already resolved, CEFR is
    // the sole remaining failure).
    vi.mocked(generateStructuredJson).mockResolvedValue(buildValidScriptOutput("C2"));
    vi.mocked(generateEnrichment).mockResolvedValue(fakeEnrichment({ cefrLevelMin: "B1", cefrLevelMax: "B2" }));

    let thrown: Error | undefined;
    try {
      await generateEpisodeScript(REQUEST_C2);
    } catch (error) {
      thrown = error as Error;
    }
    expect(thrown).toBeDefined();
    expect(thrown!.message).toMatch(/cefrLevelMin=B1, cefrLevelMax=B2/);
    expect(thrown!.message).toMatch(/Requested level was C2/);
  });

  it("B2 output is rejected for a C2 request even though B2 is an APPROVED LinguABC level -- the specific gap Fix #14 closes", async () => {
    // cefrLevelMin=B2/cefrLevelMax=C1 is a perfectly valid, APPROVED
    // LinguABC grade (isApprovedLinguAbcCefrLevel would have accepted it
    // before this fix) -- but it does not satisfy a C2 REQUEST specifically.
    vi.mocked(generateStructuredJson).mockResolvedValue(buildValidScriptOutput("C2"));
    vi.mocked(generateEnrichment).mockResolvedValue(fakeEnrichment({ cefrLevelMin: "B2", cefrLevelMax: "C1" }));

    let thrown: Error | undefined;
    try {
      await generateEpisodeScript(REQUEST_C2);
    } catch (error) {
      thrown = error as Error;
    }
    expect(thrown).toBeDefined();
    // The NEW, requested-level-specific message -- not the generic
    // "must grade as B2, C1, or C2" one, since this grade IS approved.
    expect(thrown!.message).toMatch(/below the requested CEFR C2/);
    expect(thrown!.message).toMatch(/cefrLevelMin must be at least C2/);
    expect(thrown!.message).not.toMatch(/must grade as B2, C1, or C2/);
  });

  it("the corrected C2 path passes: the word-count correction prompt reinforces genuine C2 language, and a genuinely-C2-graded corrected script is accepted", async () => {
    const overshootC2 = buildSmallOvershootOutput("C2");
    vi.mocked(generateStructuredJson)
      .mockResolvedValueOnce(overshootC2) // outer attempt 1 (initial) -- 967 words, word-count-only issue
      .mockResolvedValueOnce(buildValidScriptOutput("C2")); // correction sub-attempt -- converges to 950 words
    vi.mocked(generateEnrichment).mockResolvedValue(fakeEnrichment({ cefrLevelMin: "C2", cefrLevelMax: "C2" }));

    const result = await generateEpisodeScript(REQUEST_C2);

    expect(result.wordCount).toBe(950);
    expect(result.enrichment.cefrLevelMin).toBe("C2");

    const correctionPrompt = vi.mocked(generateStructuredJson).mock.calls[1][0].messages[0].content as string;
    // The Fix #14 reinforcement: names the requested level explicitly,
    // reuses CEFR_LEVEL_GUIDANCE.C2's own real text (never a duplicated
    // description), and states the actual failure mode (simplifying
    // instead of deleting) directly.
    expect(correctionPrompt).toMatch(/remaining script must stay genuine CEFR C2/i);
    expect(correctionPrompt).toMatch(/near-native fluency/i); // CEFR_LEVEL_GUIDANCE.C2's own distinctive text
    expect(correctionPrompt).toMatch(/cutting by DELETING words, phrases, or whole sentences -- never by rewriting a sophisticated phrase into a simpler one/i);
    // The existing, pre-Fix-#14 preservation sentence is untouched, not replaced.
    expect(correctionPrompt).toContain("the CEFR-level vocabulary and complexity wherever possible");
  });

  it("B1 and B2 behavior is unchanged: a B2 request with the default B2 grade still passes exactly as before", async () => {
    vi.mocked(generateStructuredJson).mockResolvedValueOnce(buildValidScriptOutput("B2"));
    vi.mocked(generateEnrichment).mockResolvedValue(fakeEnrichment()); // default: cefrLevelMin=B2, cefrLevelMax=C1

    const result = await generateEpisodeScript(REQUEST_B2);

    expect(result.wordCount).toBe(950);
    expect(result.enrichment.cefrLevelMin).toBe("B2");
  });

  it("a B2 request graded ABOVE B2 (C1) still passes -- Fix #14 only rejects grades BELOW the request, never ones that exceed it", async () => {
    vi.mocked(generateStructuredJson).mockResolvedValueOnce(buildValidScriptOutput("B2"));
    vi.mocked(generateEnrichment).mockResolvedValue(fakeEnrichment({ cefrLevelMin: "C1", cefrLevelMax: "C2" }));

    const result = await generateEpisodeScript(REQUEST_B2);

    expect(result.wordCount).toBe(950);
    expect(result.enrichment.cefrLevelMin).toBe("C1");
  });

  it("word-count correction behavior is unchanged: exact same cut math and target selection for a B2 request, with the new CEFR text added alongside, not replacing anything", async () => {
    const overshootB2 = buildSmallOvershootOutput("B2");
    vi.mocked(generateStructuredJson).mockResolvedValueOnce(overshootB2).mockResolvedValueOnce(buildValidScriptOutput("B2"));
    vi.mocked(generateEnrichment).mockResolvedValue(fakeEnrichment());

    await generateEpisodeScript(REQUEST_B2);

    const correctionPrompt = vi.mocked(generateStructuredJson).mock.calls[1][0].messages[0].content as string;
    // Every pre-existing "small"/final-boundary band marker, byte-for-byte
    // unchanged -- this fix touches no threshold, band, or Fix #10/#11/#13
    // mechanism.
    expect(correctionPrompt).toMatch(/You are exactly 2 word\(s\) over the 965-word hard maximum/i);
    expect(correctionPrompt).toMatch(/This is the FINAL boundary correction/i);
    expect(correctionPrompt).toContain("the CEFR-level vocabulary and complexity wherever possible");
    // The new reinforcement is present too, for a B2 request as well --
    // level-agnostic, not hardcoded to C2 only.
    expect(correctionPrompt).toMatch(/remaining script must stay genuine CEFR B2/i);
  });
});
