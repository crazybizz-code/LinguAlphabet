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

  it("gives a narrower 960-975 word target specifically for a word-count failure", () => {
    const feedback = buildRetryFeedback([{ message: "Word count 856 is outside the acceptable 920-990 range (calibrated to land inside the pipeline's 300-360s audio-duration gate with real margin)." }]);
    expect(feedback).toContain("Word count 856 is outside the acceptable 920-990 range");
    expect(feedback).toMatch(/target approximately 960-975 spoken words/i);
  });

  it("does not add word-count-specific guidance when there is no word-count issue", () => {
    const feedback = buildRetryFeedback([{ message: "No genuine interruption found." }]);
    expect(feedback).not.toMatch(/960-975/);
  });

  it("combines a word-count issue with other issues in the same feedback block", () => {
    const feedback = buildRetryFeedback([
      { message: "Word count 856 is outside the acceptable 920-990 range." },
      { message: "Only 3/20 turns have 2+ sentences -- looks like sentence-by-sentence alternation, not natural turns." },
    ]);
    expect(feedback).toContain("Word count 856 is outside the acceptable 920-990 range.");
    expect(feedback).toContain("Only 3/20 turns have 2+ sentences");
    expect(feedback).toMatch(/target approximately 960-975 spoken words/i);
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
