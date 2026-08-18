import { describe, it, expect } from "vitest";
import { validateGeneratedScript, buildRetryFeedback, buildPrompt, type ScriptGenerationOutput, type ScriptGenerationRequest } from "./scriptGeneration";

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
    expect(feedback).not.toMatch(/960-975/);
  });

  /**
   * Regression coverage for the real GitHub Actions failure this fix
   * addresses: a script landed at 833 words (well under the 920 floor) and
   * kept failing across all 6 attempts because the retry feedback only
   * ever restated an abstract "target ~960-975" -- never told the model
   * concretely how far off 833 actually was. buildWordCountGuidance() now
   * parses the real previous count out of validateGeneratedScript's own
   * message and computes a real add-this-many-words range against the
   * 960-975 sub-target.
   */
  describe("word-count guidance — concrete deficit computed from the real previous count", () => {
    it("computes an add-range of 127-142 words for a real 833-word failure", () => {
      const feedback = buildRetryFeedback([
        { message: "Word count 833 is outside the acceptable 920-990 range (calibrated to land inside the pipeline's 300-360s audio-duration gate with real margin)." },
      ]);
      expect(feedback).toContain("Word count 833 is outside the acceptable 920-990 range");
      expect(feedback).toContain("Previous draft: 833 words. Required: 920-990.");
      expect(feedback).toMatch(/add approximately 127-142 spoken words/i);
      expect(feedback).toMatch(/target 960-975 words total/i);
    });

    it("computes a different add-range for a different undershoot amount (856 words)", () => {
      const feedback = buildRetryFeedback([{ message: "Word count 856 is outside the acceptable 920-990 range." }]);
      expect(feedback).toContain("Previous draft: 856 words. Required: 920-990.");
      expect(feedback).toMatch(/add approximately 104-119 spoken words/i);
    });

    it("tells the model to cut words, not add, for an overshoot above 990", () => {
      const feedback = buildRetryFeedback([{ message: "Word count 1005 is outside the acceptable 920-990 range." }]);
      expect(feedback).toContain("Previous draft: 1005 words. Required: 920-990.");
      expect(feedback).toMatch(/cut approximately 30-45 spoken words/i);
      expect(feedback).not.toMatch(/add approximately/i);
    });

    it("falls back to the abstract target when the previous count can't be parsed out of the message", () => {
      const feedback = buildRetryFeedback([{ message: "Word count is outside the acceptable range somehow." }]);
      expect(feedback).toMatch(/target approximately 960-975 spoken words/i);
    });
  });

  it("combines a word-count issue with other issues in the same feedback block", () => {
    const feedback = buildRetryFeedback([
      { message: "Word count 833 is outside the acceptable 920-990 range." },
      { message: "Only 3/20 turns have 2+ sentences -- looks like sentence-by-sentence alternation, not natural turns." },
    ]);
    expect(feedback).toContain("Word count 833 is outside the acceptable 920-990 range.");
    expect(feedback).toContain("Only 3/20 turns have 2+ sentences");
    expect(feedback).toMatch(/add approximately 127-142 spoken words/i);
  });

  it("gives concrete corrective guidance specifically for a CEFR-level failure", () => {
    const feedback = buildRetryFeedback([
      { message: "Independent CEFR check graded this script as cefrLevelMin=B1, cefrLevelMax=B2 -- LinguABC AI-generated podcasts must grade as B2, C1, or C2." },
    ]);
    expect(feedback).toContain("Independent CEFR check graded this script as cefrLevelMin=B1");
    expect(feedback).toMatch(/raise vocabulary sophistication/i);
    expect(feedback).toMatch(/conditional\/subordinate-clause sentence structures/i);
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
      { message: "Word count 833 is outside the acceptable 920-990 range." },
      { message: "Independent CEFR check graded this script as cefrLevelMin=B1, cefrLevelMax=B2." },
      { message: "Found markdown-style emphasis markers that would be read aloud literally (use [emphasis] instead): *just*, *so close*" },
    ]);
    expect(feedback).toContain("Word count 833 is outside the acceptable 920-990 range.");
    expect(feedback).toContain("Independent CEFR check graded this script as cefrLevelMin=B1");
    expect(feedback).toContain("Found markdown-style emphasis markers");
    expect(feedback).toContain("Previous draft: 833 words. Required: 920-990.");
    expect(feedback).toMatch(/add approximately 127-142 spoken words/i);
    expect(feedback).toMatch(/raise vocabulary sophistication/i);
    expect(feedback).toMatch(/remove all markdown emphasis markers/i);
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

  it("states the 940-word hard floor explicitly, matching the other MANDATORY rules", () => {
    const prompt = buildPrompt(request);
    expect(prompt).toMatch(/MANDATORY, NON-NEGOTIABLE: your dialogue MUST contain at least 940 spoken words/i);
    expect(prompt).toMatch(/do not submit a draft under 940 words/i);
  });

  it("gives a single, unambiguous 960-975 target instead of the old 940-980 band", () => {
    const prompt = buildPrompt(request);
    expect(prompt).toMatch(/Target 960-975 words specifically/i);
    expect(prompt).not.toContain("940-980");
  });

  it("explicitly warns that satisfying every other rule does not excuse a short script", () => {
    const prompt = buildPrompt(request);
    expect(prompt).toMatch(/does NOT excuse a short script/i);
  });
});
