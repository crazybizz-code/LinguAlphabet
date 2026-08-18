import { vi, describe, it, expect, beforeEach } from "vitest";
import {
  validateGeneratedScript,
  buildRetryFeedback,
  buildPrompt,
  generateEpisodeScript,
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
      { message: "Word count 833 is outside the acceptable 920-990 range." },
      { message: "Authoritative enrichment graded this script as cefrLevelMin=B1, cefrLevelMax=B2." },
      { message: "Found markdown-style emphasis markers that would be read aloud literally (use [emphasis] instead): *just*, *so close*" },
    ]);
    expect(feedback).toContain("Word count 833 is outside the acceptable 920-990 range.");
    expect(feedback).toContain("Authoritative enrichment graded this script as cefrLevelMin=B1");
    expect(feedback).toContain("Found markdown-style emphasis markers");
    expect(feedback).toContain("Previous draft: 833 words. Required: 920-990.");
    expect(feedback).toMatch(/add approximately 127-142 spoken words/i);
    expect(feedback).toMatch(/raise vocabulary sophistication/i);
    expect(feedback).toMatch(/remove all markdown emphasis markers/i);
  });

  /**
   * Regression coverage for the real GitHub Actions failure this fix
   * addresses: a script overshot to 1181 words (correctly computed a
   * 206-221 cut range by the existing word-count formula) but ALSO
   * failed prosody density (1.61/100, well under the ~2/100 hard floor)
   * and the interruption pattern -- and neither of those two failures got
   * any corrective push beyond the generic bullet list, so the model kept
   * fixing length alone across all 6 attempts. buildProsodyGuidance() and
   * buildInterruptionGuidance() close that gap; this section covers each
   * in isolation and combined, matching the exact real failure.
   */
  describe("prosody and interruption guidance — the constraint-convergence fix", () => {
    it("computes the exact 206-221 cut range for the real 1181-word overshoot", () => {
      const feedback = buildRetryFeedback([{ message: "Word count 1181 is outside the acceptable 920-990 range." }]);
      expect(feedback).toContain("Previous draft: 1181 words. Required: 920-990.");
      expect(feedback).toMatch(/cut approximately 206-221 spoken words/i);
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
      const feedback = buildRetryFeedback([{ message: "Word count 833 is outside the acceptable 920-990 range." }]);
      expect(feedback).not.toMatch(/structurally REQUIRED/i);
    });

    it("combines word-count overshoot, low prosody density, and missing interruption in ONE coherent block, none dropped", () => {
      const feedback = buildRetryFeedback([
        { message: "Word count 1181 is outside the acceptable 920-990 range." },
        { message: "Prosody density 1.61/100 words is far below the ~4-6 target -- prosody rules were not followed." },
        {
          message:
            "No genuine interruption found -- need one turn ending with a dash immediately followed by the next turn starting with a dash (e.g. Speaker 0: '...we—' / Speaker 1: '—never finish that?').",
        },
      ]);
      // All three original issue bullets present.
      expect(feedback).toContain("Word count 1181 is outside the acceptable 920-990 range.");
      expect(feedback).toContain("Prosody density 1.61/100 words is far below the ~4-6 target");
      expect(feedback).toContain("No genuine interruption found");
      // All three corrective instructions present -- fixing one must not crowd out the others.
      expect(feedback).toMatch(/cut approximately 206-221 spoken words/i);
      expect(feedback).toContain("Current prosody density: 1.61/100 words. Required: approximately 4-6/100 words.");
      expect(feedback).toMatch(/structurally REQUIRED/i);
      // The explicit "fix all together" framing fires because 3 corrections are active at once.
      expect(feedback).toMatch(/must ALL be fixed together in the SAME rewrite/i);
    });

    it("does not add the combined-fix framing sentence when only one correction is active", () => {
      const feedback = buildRetryFeedback([{ message: "Word count 1181 is outside the acceptable 920-990 range." }]);
      expect(feedback).not.toMatch(/must ALL be fixed together/i);
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
   * can't silently drift out of the 920-990 range as its text changes.
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

    // The retry prompt for attempt 2 must carry the genuine-improvement
    // guidance, not a metadata-relabeling instruction.
    const secondCall = vi.mocked(generateStructuredJson).mock.calls[1][0];
    const secondPrompt = secondCall.messages[0].content as string;
    expect(secondPrompt).toMatch(/Authoritative enrichment graded this script as cefrLevelMin=B1/i);
    expect(secondPrompt).toMatch(/independently graded BELOW the required B2\+ standard/i);
    expect(secondPrompt).toMatch(/do not just relabel the same simple script or change the self-reported level field/i);
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
});
