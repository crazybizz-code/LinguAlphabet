import { describe, it, expect } from "vitest";
import { validateGeneratedScript, type ScriptGenerationOutput, type ScriptGenerationRequest } from "./scriptGeneration";

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
