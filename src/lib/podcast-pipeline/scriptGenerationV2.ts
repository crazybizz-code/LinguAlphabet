import { z } from "zod";
import { generateStructuredJson } from "@/ai/services/generate-structured-json";
import type { AIProviderMessage } from "@/ai/providers";
import { BATCH_RETRY_POLICY } from "@/ai/retry";
import { generateEnrichment } from "@/lib/content-engine/ai-processing";
import type { EnrichmentResult } from "@/lib/content-engine/types";
import { isApprovedLinguAbcCefrLevel, meetsOrExceedsLinguAbcCefrLevel, type LinguAbcCefrLevel } from "./cefrLevel";
import { buildReaderTranscript } from "./transcript";
import { checkOpeningStructure, toScriptLines, type ScriptGenerationRequest, type ScriptGenerationOutput, type OpeningStructureCheck } from "./scriptGeneration";

/**
 * PODCAST SCRIPT GENERATION — V2.
 *
 * PRODUCT DECISION THIS MODULE IMPLEMENTS: word count is NOT a validation
 * gate. There is no minimum, no maximum, no target range, no repair
 * mechanism when a script is judged too long or too short, and no
 * cross-attempt state describing how much a length problem was reduced by
 * a previous try — anywhere in this file. A script is valid or invalid
 * based on its actual content and structure — never its length. Word
 * count is computed once, per successful attempt, purely as telemetry
 * (ScriptValidationResultV2.wordCount / ScriptGenerationResultV2.
 * wordCount) — read it, log it, but it must never appear on either side of
 * an `if` that decides pass/fail.
 *
 * This is a clean rebuild, not a patch on top of scriptGeneration.ts's
 * (V1) dedicated length-repair pass and its whole supporting state
 * machine — the function that ran that pass, the prompt builder that
 * named a specific turn and a specific word deficit to cut, the
 * deterministic target-turn selector, the classifier that sorted a length
 * problem into a severity tier, the fields that recorded how much of a
 * requested cut was actually achieved versus how much was required, the
 * flag that routed a later attempt straight back into another length-repair
 * round, and the two fields that carried a length-repair outcome across
 * that boundary. None of that exists here, under any name, and this file
 * imports NONE of it. V1 (scriptGeneration.ts) is untouched by this module
 * and keeps working exactly as before; this file is additive and
 * isolated, safe to run and test side by side with V1 before any caller
 * (dailyGenerate.ts) is migrated to it.
 *
 * What IS reused from V1, deliberately, because it has zero length
 * involvement and is already well-tested: checkOpeningStructure() (the
 * position-aware hook/self-introduction/LinguABC-mention check) and
 * toScriptLines() (turns -> ScriptLine[] conversion), both imported
 * unchanged, plus the CEFR ordering helpers from cefrLevel.ts
 * (isApprovedLinguAbcCefrLevel, meetsOrExceedsLinguAbcCefrLevel). Every
 * other piece here (prompt, schema, structural validator, revision
 * feedback, CEFR grading check, orchestrator) is a fresh, independent
 * implementation — never a modified copy of a V1 function.
 */

// ── Schema ───────────────────────────────────────────────────────────────
// Duplicated (not imported) from scriptGeneration.ts's private
// ScriptTurnSchema/ScriptGenerationOutputSchema — those are not exported,
// and this module is meant to be independent of V1's internals. The SHAPE
// is intentionally identical to V1's ScriptGenerationOutput (imported as a
// type above), so a V2 output is structurally interchangeable with every
// V1-typed consumer (toScriptLines(), checkOpeningStructure()) with no
// cast needed.

const ScriptTurnSchemaV2 = z.object({
  speaker: z.union([z.literal(0), z.literal(1)]),
  text: z.string(),
});

const ScriptGenerationOutputSchemaV2 = z.object({
  title: z.string(),
  topic: z.string(),
  topicTags: z.array(z.string()),
  cefrLevel: z.enum(["B2", "C1", "C2"]),
  turns: z.array(ScriptTurnSchemaV2),
});

export type { ScriptGenerationRequest, ScriptGenerationOutput, OpeningStructureCheck };

const FIXED_PROSODY_TAGS_V2 = ["[emphasis]", "[break]", "[long-break]", "[whispering]", "[soft tone]", "[shouting]", "[screaming]", "[in a hurry tone]"];

/** Same three-level CEFR guidance text as scriptGeneration.ts's
 * CEFR_LEVEL_GUIDANCE (duplicated for the same independence reason as the
 * schema above — that constant is not exported either). */
const CEFR_LEVEL_GUIDANCE_V2: Record<LinguAbcCefrLevel, string> = {
  B2: "Natural spoken vocabulary, common idioms and everyday conversational expressions welcome. Sentences can have some complexity (relative clauses, conditionals, linking words like \"although\"/\"despite\") but stay clear and direct -- not textbook-stiff, not artificially advanced. A confident upper-intermediate learner should follow it without strain. IMPORTANT -- this must clearly clear B1, not sit at its edge: B1 is simple everyday chat with basic connectors and the occasional idiom; B2 requires genuinely extended discussion of a complex or abstract ANGLE of the topic (not just a surface-level personal anecdote), real conditional/subordinate-clause sentences used THROUGHOUT the conversation (not merely available if needed), and vocabulary a B1 learner would find noticeably harder. This script is independently graded against that exact bar after generation -- writing it \"safe and simple\" will fail the grade and be rejected.",
  C1: "More sophisticated vocabulary and less-common idiomatic expressions used naturally, not forced. Comfortable with nuance, implication, and understatement -- speakers can hedge, qualify, and disagree subtly rather than bluntly. Longer, more complex sentence structures (multiple subordinate clauses, varied discourse markers) are natural here, and the conversation can handle more abstract or layered ideas than a B2 episode would.",
  C2: "Near-native fluency: precise, idiomatic, occasionally playful with language (wordplay, understatement, dry humor) the way a fluent native speaker would use it, not simplified for a learner. Vocabulary can include lower-frequency words used exactly right. Arguments and reflections can be genuinely abstract or nuanced. This is the hardest tier LinguABC produces -- do not pull punches to make it easier.",
};

// ── Prompt (Phase 3 — no hard word-count target anywhere) ─────────────────

/**
 * Builds the initial-generation prompt. Deliberately contains NO word
 * count number anywhere — no floor, no ceiling, no target, no cut-words or
 * reduce-length language, and no language describing a script as having
 * gone past some length limit. The LENGTH section instructs natural
 * length instead: write however long the actual content genuinely needs,
 * no artificial padding, no artificial compression.
 */
export function buildPodcastScriptPromptV2(request: ScriptGenerationRequest): string {
  const avoidList = [...new Set([...request.usedTitles, ...request.usedTopicTags])];

  return `You are the scriptwriter for LinguABC, a B2-level English-learning podcast. Two hosts have a genuine, natural conversation about one everyday topic. Write ONE new episode script.

===================== SPEAKERS =====================
Speaker 0's name is "${request.speaker0Name}". Speaker 1's name is "${request.speaker1Name}".
Give them slightly different conversational personalities, shown ONLY through how they talk (never stated outright): one is more curious/reflective and tends to tell small personal examples; the other is more practical/skeptical/playful and tends to challenge or tease the first. Decide which speaker gets which personality.

===================== TOPIC =====================
${
  request.forcedTopic
    ? `Write about this EXACT topic (a corrected replacement script is needed for an existing episode on this subject, keeping the same topic): ${request.forcedTopic}`
    : `Already used -- do NOT reuse or closely repeat any of these titles or subjects: ${avoidList.length > 0 ? avoidList.join("; ") : "(none yet)"}.
Avoid making the episode about AI or technology.
Prefer: everyday psychology, habits, communication, social behavior, culture, travel, work, relationships between people, surprising everyday questions, interesting human behavior.
The topic must give BOTH speakers real things to say -- not one expert lecturing the other.`
}

===================== LENGTH =====================
There is NO target word count, NO minimum, and NO maximum. Write a complete, natural podcast conversation of whatever length the topic genuinely calls for to be covered with real depth and a genuine back-and-forth -- a natural episode might land anywhere from roughly 900 to 1500+ words, and any length is fine as long as it is the conversation's OWN natural length. Do NOT pad the conversation with filler, repeated points, or unnecessary tangents to reach a certain length, and do NOT cut it short or rush the ending to stay brief. Every structural requirement below (the hook, both self-introductions, the LinguABC mention, the interruption pair, a natural sign-off, prosody density, and the requested CEFR level) is still MANDATORY regardless of length -- length itself is simply never a requirement to satisfy or a limit to respect.

===================== CRITICAL TURN-STRUCTURE RULE =====================
A turn is NOT one sentence. NEVER alternate speaker after every single sentence like a ping-pong pattern (A-sentence, B-sentence, A-sentence, B-sentence...). Instead use IRREGULAR natural turns:
- Speaker A: 2-4 sentences (explaining something, telling a short story)
- Speaker B: 1 short sentence or reaction
- Speaker A: a short reaction only ("Wait, really?")
- Speaker B: 3 sentences
- Speaker A: 2 sentences
- Speaker B: 4 sentences
There is NO fixed pattern -- the variation must feel organic, decided by what the conversation actually needs at that moment. Some turns are one word. Some turns run 3-5 sentences when a speaker is genuinely explaining or telling a story.

===================== CONVERSATIONAL FEATURES =====================
Naturally work in whichever of the following genuinely fit the topic -- a short reaction, a follow-up question, a self-correction or unfinished thought ("...", trailing off), a mild disagreement or pushback, a moment of humor, a small personal example or story from at least one speaker, or a brief callback near the end to something mentioned earlier. Include as many or as few as the conversation genuinely calls for -- there is no word-count reason to include more or fewer of them. Do not force filler words into every sentence.

MANDATORY, NON-NEGOTIABLE: at least one genuine interruption MUST appear somewhere in the script -- one speaker's turn ends mid-sentence with an em dash "—" (not two hyphens), and the very next turn (the OTHER speaker) begins with an em dash "—" and completes or talks over that thought. This is two separate turns, not one. Concrete example of the exact pattern required:
  Speaker 0: "...and honestly I think the whole point is that we—"
  Speaker 1: "—never actually finish that argument? Yeah, I've noticed."
If your script does not contain this exact two-turn, dash-linked pattern at least once, it is invalid and will be rejected.

===================== PROSODY (VOCAL DIRECTION) =====================
Every spoken line may contain bracket cues that describe HOW it should sound. These are Fish Audio TTS delivery directions and are never spoken aloud.
Fixed supported tags you may use where they genuinely fit: ${FIXED_PROSODY_TAGS_V2.join(", ")}.
You are NOT limited to fixed tags -- write natural-language descriptive cues for anything else, for example: [thoughtful], [curious, slight pitch rise], [genuine surprise, slight pitch rise], [quiet, lower voice], [slightly more energetic], [warm, lightly amused], [playful], [reflective], [amused].
MANDATORY, NON-NEGOTIABLE: target 4-6 meaningful cues per 100 words, spread across the WHOLE script, whatever its length. A script with a real prosody density below ~2 cues per 100 words WILL BE REJECTED outright, exactly like the other hard rules in this prompt -- this is checked mechanically by counting bracket cues after you respond, not judged loosely. The important thing is CONTRAST: the vocal energy should shift a few times across the episode (for example calm, then curious, then more energetic, then reflective) rather than sitting at one flat energy the whole time -- two or three genuine shifts are enough; this does not require moving through every possible tone. Do not tag every single sentence -- a longer conversation needs proportionally more cues to hold the same density, not the same handful spread thinner.
Place some cues at the very start of a turn, but also place some cues INSIDE a turn, in the middle of a thought, right before the word or phrase whose delivery changes -- not only at turn-start.
Use "..." for a trailing/hesitant pause and an em dash "—" for an interruption or self-correction, plus [break] or [long-break] for a real conversational boundary. Do not insert a pause or break at every turn change -- most natural speaker changes need no explicit pause tag at all; let native multi-speaker synthesis handle ordinary timing.

MANDATORY, NON-NEGOTIABLE: NEVER wrap a word in asterisks or underscores for emphasis. This is the single most important formatting rule in this entire prompt -- violating it will get the whole script rejected regardless of how good the dialogue is.
  WRONG (never write this): "I *really* thought it would work." / "That's **exactly** the problem." / "I _genuinely_ had no idea." / "so *close*"
  RIGHT (always write this instead): "[emphasis] I really thought it would work." / "That's [emphasis] exactly the problem." / "[emphasis] I genuinely had no idea." / "[emphasis] so close"
The [emphasis] bracket tag (or a natural-language cue like [with emphasis]) placed right before the word or phrase is the ONLY way to mark emphasis. Scan your own output before returning it and confirm it contains zero "*" and zero "_" characters anywhere.
Audio-safe formatting, stated explicitly, because this rule is violated more than any other:
  - NEVER use Markdown emphasis markers such as *word* or **word** -- anywhere, on any word, no matter how minor the emphasis feels.
  - For spoken emphasis, use the [emphasis] bracket cue placed directly before the word or phrase. This schema has no closing or paired tag -- never write [/emphasis] or anything resembling it.
  - Do not use ANY Markdown formatting (bold, italic, headers, bullet lists, etc.) anywhere in spoken dialogue. This schema supports only the bracket prosody cues already described above, nothing else.

===================== OPENING =====================
Start with an original, specific hook (not a generic greeting) -- something concrete, slightly surprising or personal, that pulls the listener in. Let it continue naturally for a beat (a short reaction and a little development is fine), then create a clear boundary (a trailing "..." and/or a [break]/[long-break] cue) BEFORE the self-introductions. Never let the hook's last word run directly into "I'm ${request.speaker0Name}." There must be real separation. Then:
"${request.speaker0Name}: I'm ${request.speaker0Name}."
"${request.speaker1Name}: And I'm ${request.speaker1Name}."
Then a natural, brief mention that this is LinguABC, then transition into the topic conversationally (not a formal announcement).
Do not reuse a hook about airplane clapping or about saying "on my way" -- those are two prior episodes' hooks.

MANDATORY, NON-NEGOTIABLE: this entire introduction block (both speakers saying their names, plus the LinguABC mention) MUST occur within the FIRST FEW TURNS of the script -- roughly the first 15-25% of it, never later. It must NEVER appear only at the end, folded into the sign-off. A real prior generation put "I'm Sarah" / "And I'm Hannah" at the very end instead of the opening and was rejected for it after already being published by mistake -- do not repeat that mistake. The hook and a short development beat come first, then the introductions, then the main conversation. Do not save the names for later. The closing sign-off is NOT a substitute for this opening block: even if your sign-off naturally mentions LinguABC again (that is fine and expected), the FIRST LinguABC mention and BOTH self-introductions must already have happened near the opening -- a script whose only introductions or brand mention occur in the closing sign-off fails this rule, no matter how natural that sign-off sounds.

===================== ENDING =====================
Let the conversation reach its own natural conclusion first -- do not cut it off abruptly into a formal outro voice. Then close with a short, natural LinguABC sign-off. Vary the sign-off wording -- do not just write "This has been LinguABC" every time; find a natural way to close that fits THIS conversation's tone (and, if you included a callback, ties back to it).

===================== LEVEL =====================
This episode MUST be written at genuine CEFR ${request.cefrLevel} English -- not merely labeled ${request.cefrLevel}, actually written at that level of vocabulary, grammar, and conversational complexity. LinguABC's AI-generated podcasts are B2, C1, or C2 only -- never B1 or below; B1 listening content comes from a separate, non-AI-generated source.
${CEFR_LEVEL_GUIDANCE_V2[request.cefrLevel]}

===================== OUTPUT =====================
Return the episode as a title, a one-line topic description, 1-5 short topic tags (e.g. "Psychology", "Travel", "Communication" -- broad descriptive categories, not the controlled app vocabulary), the CEFR level you wrote this at (must be exactly "${request.cefrLevel}", matching the LEVEL section above), and the full ordered list of turns, each with a speaker (0 for ${request.speaker0Name}, 1 for ${request.speaker1Name}) and that turn's exact spoken text including its bracket prosody cues.`;
}

const MAX_ATTEMPTS_V2 = 6;

/** Generous headroom for a genuinely long natural script (V2 explicitly
 * allows 1500+ words, unlike V1's 965-word ceiling) -- scaled up from V1's
 * SCRIPT_JSON_MAX_TOKENS (6000, calibrated for a ~965-word/100-turn
 * ceiling) proportionally for a ~1500-word/140-turn ceiling, so a
 * genuinely long, valid script's JSON response is never truncated. */
const SCRIPT_JSON_MAX_TOKENS_V2 = 9000;

function sleepV2(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ── Structural validation (Phase 4) ────────────────────────────────────────

export interface ScriptValidationIssueV2 {
  message: string;
}

export interface ScriptValidationResultV2 {
  issues: ScriptValidationIssueV2[];
  /** TELEMETRY ONLY. Never gates pass/fail in either direction (too many
   * or too few words) — see this module's own doc comment. */
  wordCount: number;
}

/**
 * Same structural/content checks scriptGeneration.ts's validateGeneratedScript()
 * performs (self-report CEFR mismatch, turn-count plausibility, natural
 * turn-length variety, prosody density/placement, markdown/bracket
 * formatting safety, opening structure, interruption pattern) — MINUS the
 * word-count range check, which V1 has and V2 deliberately never will. The
 * turn-count upper bound is raised from V1's 100 to 140 to comfortably
 * accommodate a genuinely longer natural script (V2 explicitly allows up
 * to 1500+ words) without ever flagging a normal long episode as
 * implausible; the lower bound (16) is unchanged since it exists to catch
 * something structurally broken, not to constrain length.
 */
export function validatePodcastScriptV2(output: ScriptGenerationOutput, request: ScriptGenerationRequest): ScriptValidationResultV2 {
  const issues: ScriptValidationIssueV2[] = [];
  const stripTags = (t: string) => t.replace(/\[[^\]]*\]/g, " ");

  if (output.cefrLevel !== request.cefrLevel) {
    issues.push({ message: `Requested CEFR level ${request.cefrLevel} but the model self-reported ${output.cefrLevel}.` });
  }

  const wordCount = output.turns.reduce((sum, t) => sum + stripTags(t.text).split(/\s+/).filter(Boolean).length, 0);
  // Word count is NEVER pushed as an issue here, in either direction —
  // this is the one line in this whole function that computes it, and it
  // is returned as telemetry only.

  if (output.turns.length < 16 || output.turns.length > 140) {
    issues.push({ message: `Turn count ${output.turns.length} looks implausible for a natural episode.` });
  }

  const sentenceCounts = output.turns.map((t) => stripTags(t.text).trim().split(/(?<=[.!?])\s+/).filter(Boolean).length);
  const multiSentenceTurns = sentenceCounts.filter((c) => c >= 2).length;
  if (multiSentenceTurns / output.turns.length < 0.25) {
    issues.push({ message: `Only ${multiSentenceTurns}/${output.turns.length} turns have 2+ sentences -- looks like sentence-by-sentence alternation, not natural turns.` });
  }

  const allTags: string[] = [];
  let midSentence = 0;
  for (const turn of output.turns) {
    const matches = [...turn.text.matchAll(/\[([^\]]*)\]/g)];
    matches.forEach((m, idx) => {
      allTags.push(m[1]);
      const before = turn.text.slice(0, m.index).trim();
      if (!(idx === 0 && before === "")) midSentence += 1;
    });
  }
  const tagsPer100Words = wordCount > 0 ? (allTags.length / wordCount) * 100 : 0;
  if (tagsPer100Words < 2) {
    issues.push({ message: `Prosody density ${tagsPer100Words.toFixed(2)}/100 words is far below the ~4-6 target -- prosody rules were not followed.` });
  }
  if (allTags.length > 0 && midSentence === 0) {
    issues.push({ message: "No prosody cues are placed mid-sentence -- every cue is turn-initial." });
  }

  const markdownMarkers = output.turns.flatMap((t) => t.text.match(/\*[^*]+\*|_[^_]+_/g) ?? []);
  if (markdownMarkers.length > 0) {
    issues.push({ message: `Found markdown-style emphasis markers that would be read aloud literally (use [emphasis] instead): ${markdownMarkers.slice(0, 5).join(", ")}` });
  }

  const unbalancedBracketTurns = output.turns.filter((t) => {
    let depth = 0;
    for (const ch of t.text) {
      if (ch === "[") depth += 1;
      else if (ch === "]") {
        depth -= 1;
        if (depth < 0) return true;
      }
    }
    return depth !== 0;
  });
  if (unbalancedBracketTurns.length > 0) {
    issues.push({
      message: `${unbalancedBracketTurns.length} turn(s) contain unclosed or unmatched prosody brackets (e.g. "${unbalancedBracketTurns[0].text.slice(0, 60)}"), which would be spoken aloud literally instead of interpreted as a cue.`,
    });
  }

  const bareCueWords = FIXED_PROSODY_TAGS_V2.map((tag) => tag.slice(1, -1)).sort((a, b) => b.length - a.length);
  const bareCueRe = new RegExp(`^\\s*(${bareCueWords.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})\\s*[,.:]`, "i");
  const leakedCueTurns = output.turns.filter((t) => bareCueRe.test(stripTags(t.text)));
  if (leakedCueTurns.length > 0) {
    issues.push({
      message: `${leakedCueTurns.length} turn(s) start with what looks like a forgotten-bracket prosody cue spoken as literal dialogue (e.g. "${leakedCueTurns[0].text.slice(0, 40)}") -- wrap it in brackets (e.g. "[emphasis] ...") if it's a delivery direction.`,
    });
  }

  // Reused unchanged from V1 (see this module's own doc comment) -- zero
  // word-count involvement.
  const openingStructure = checkOpeningStructure(output, request);
  if (!openingStructure.passed) {
    issues.push(...openingStructure.issues.map((message) => ({ message })));
  }

  const endsWithDash = (t: string) => /[—-]\s*$/.test(t.trim());
  const startsWithDash = (t: string) => /^\s*[—-]/.test(t.trim());
  const hasInterruptionPattern = output.turns.some((turn, i) => i > 0 && endsWithDash(output.turns[i - 1].text) && startsWithDash(turn.text));
  if (!hasInterruptionPattern) {
    issues.push({ message: "No genuine interruption found -- need one turn ending with a dash immediately followed by the next turn starting with a dash (e.g. Speaker 0: '...we—' / Speaker 1: '—never finish that?')." });
  }

  return { issues, wordCount };
}

// ── Targeted revision (Phase 6) ─────────────────────────────────────────────
// Each builder below fires ONLY when its specific issue category is
// present, and says nothing about length in any direction. There is no
// "largeCutNeeded"/shortening branch anywhere in this file.

const PROSODY_DENSITY_ISSUE_RE_V2 = /Prosody density ([\d.]+)\/100 words/i;

function buildProsodyGuidanceV2(issues: ScriptValidationIssueV2[]): string {
  const densityMatch = issues.map((issue) => issue.message.match(PROSODY_DENSITY_ISSUE_RE_V2)).find((m): m is RegExpMatchArray => m !== null);
  const hasMidSentenceIssue = issues.some((issue) => /every cue is turn-initial/i.test(issue.message));
  if (!densityMatch && !hasMidSentenceIssue) return "";

  const densityLine = densityMatch
    ? `Current prosody density: ${densityMatch[1]}/100 words. Required: approximately 4-6/100 words.`
    : "Prosody cue placement needs work.";
  const placementLine = hasMidSentenceIssue
    ? " At least some cues must sit INSIDE a turn, mid-sentence, right before the word or phrase whose delivery changes -- not only at the very start of a turn."
    : "";

  return `\n${densityLine} Add natural bracket prosody cues (the SAME existing tags/format already described in the PROSODY section above -- e.g. [emphasis], [thoughtful], [break] -- placed directly before the affected word or phrase) spread THROUGHOUT the entire dialogue, not clustered in only a few turns or added as a handful of isolated markers.${placementLine} Do not cue every single sentence either -- this is about even, natural distribution across the whole script, not maximum cue count.`;
}

function buildInterruptionGuidanceV2(issues: ScriptValidationIssueV2[]): string {
  const hasInterruptionIssue = issues.some((issue) => /no genuine interruption found/i.test(issue.message));
  if (!hasInterruptionIssue) return "";

  return `\nA genuine interruption is still missing and is structurally REQUIRED. You must include the EXACT pattern: one speaker's turn ends mid-sentence with an em dash "—", and the very next turn (the OTHER speaker) begins with an em dash "—" and completes or talks over that thought -- this is TWO separate turns, not a dash placed anywhere inside a single turn's dialogue. Merely including a dash somewhere in the script does NOT satisfy this rule. Required pattern: Speaker 0: "...and honestly I think the whole point is that we—" / Speaker 1: "—never actually finish that argument? Yeah, I've noticed."`;
}

const HOOK_MISSING_RE_V2 = /reads like a generic greeting\/announcement instead of a real hook/i;
const NO_DEVELOPMENT_RE_V2 = /no hook\/development beat before it/i;
const MISSING_INTROS_RE_V2 = /Missing one or both .*self-introductions entirely/i;
const FIRST_INTRO_LATE_RE_V2 = /^(.+?)'s introduction occurs at ([\d.]+)% through the script -- must be within the first/i;
const SECOND_INTRO_LATE_RE_V2 = /^(.+?)'s introduction occurs at ([\d.]+)% through the script or too far from (.+?)'s/i;
const LINGUABC_LATE_RE_V2 = /^LinguABC identity occurs at ([\d.]+)% through the script/i;
const ENDING_ONLY_RE_V2 = /Introduction block found only in the final \d+% of the script \(the sign-off\)/i;

function buildOpeningStructureGuidanceV2(issues: ScriptValidationIssueV2[]): string {
  const hookMissing = issues.some((issue) => HOOK_MISSING_RE_V2.test(issue.message));
  const noDevelopment = issues.some((issue) => NO_DEVELOPMENT_RE_V2.test(issue.message));
  const missingIntros = issues.some((issue) => MISSING_INTROS_RE_V2.test(issue.message));
  const firstIntroLate = issues.map((issue) => issue.message.match(FIRST_INTRO_LATE_RE_V2)).find((m): m is RegExpMatchArray => m !== null);
  const secondIntroLate = issues.map((issue) => issue.message.match(SECOND_INTRO_LATE_RE_V2)).find((m): m is RegExpMatchArray => m !== null);
  const linguabcLate = issues.map((issue) => issue.message.match(LINGUABC_LATE_RE_V2)).find((m): m is RegExpMatchArray => m !== null);
  const endingOnly = issues.some((issue) => ENDING_ONLY_RE_V2.test(issue.message));

  const hasOpeningIssue = hookMissing || noDevelopment || missingIntros || !!firstIntroLate || !!secondIntroLate || !!linguabcLate || endingOnly;
  if (!hasOpeningIssue) return "";

  const specifics: string[] = [];
  if (hookMissing) specifics.push("the first turn read like a generic greeting/announcement instead of a real hook");
  if (noDevelopment) specifics.push("the introductions happened on the very first turn, with no hook/development beat before them");
  if (missingIntros) specifics.push("one or both self-introductions (\"I'm <name>\") are missing entirely");
  if (firstIntroLate) specifics.push(`${firstIntroLate[1]}'s introduction was at ${firstIntroLate[2]}% through the script -- far too late`);
  if (secondIntroLate) specifics.push(`${secondIntroLate[1]}'s introduction was at ${secondIntroLate[2]}% through the script (or too far from ${secondIntroLate[3]}'s)`);
  if (linguabcLate) specifics.push(`the LinguABC mention was at ${linguabcLate[1]}% through the script -- far too late`);
  if (endingOnly) specifics.push("the introduction block was found ONLY in the final portion of the script, folded into the sign-off");

  return `\nThe opening block is still wrong: ${specifics.join("; ")}. The REQUIRED order, every time, with nothing else in between, is: (1) the hook, (2) one brief reaction/development beat, (3) Speaker 0 introduces himself ("I'm <name>"), (4) Speaker 1 introduces herself in that SAME opening block ("And I'm <name>"), (5) a brief LinguABC mention immediately after the introductions, (6) THEN the main topic conversation begins. The introductions and the LinguABC identity must NOT first appear in the closing sign-off. The FIRST LinguABC mention and BOTH introductions must land within roughly the first quarter of the script, immediately after the hook and its one reaction beat.`;
}

/** Base CEFR revision guidance — no word-count-preservation caveat of any
 * kind (V1's buildCefrGuidance() has one, because raising sophistication
 * could previously blow past V1's word-count ceiling; that tension does
 * not exist in V2, since there is no ceiling to protect). */
function buildCefrGuidanceV2(): string {
  return "\nFor the CEFR level specifically: this draft was independently graded BELOW the required standard by the same authoritative grading the published episode will be checked against -- this is not a labeling mistake, the actual vocabulary and sentence complexity were too simple for the requested level. Raise vocabulary sophistication, use real conditional/subordinate-clause sentence structures throughout (not just when convenient), and discuss a genuinely complex or abstract angle of the topic instead of a simple personal anecdote. Genuinely rewrite the language -- do not just relabel the same script or change the self-reported level field.";
}

function buildRevisionFeedbackV2(issues: ScriptValidationIssueV2[]): string {
  const bullets = issues.map((issue) => `- ${issue.message}`).join("\n");
  const hasCefrIssue = issues.some((issue) => /cefr/i.test(issue.message));
  const hasMarkdownIssue = issues.some((issue) => /markdown/i.test(issue.message));
  const cefrGuidance = hasCefrIssue && !isPureCefrMismatchV2(issues) ? buildCefrGuidanceV2() : "";
  const markdownGuidance = hasMarkdownIssue
    ? "\nRemove ALL Markdown emphasis markers such as *word* and **word**. They would be spoken literally, not interpreted as emphasis. Use the [emphasis] bracket cue placed directly before the word or phrase instead (e.g. \"[emphasis] really\", never \"*really*\") -- there is no closing tag in this schema, so never write [/emphasis]."
    : "";
  const prosodyGuidance = buildProsodyGuidanceV2(issues);
  const interruptionGuidance = buildInterruptionGuidanceV2(issues);
  const openingGuidance = buildOpeningStructureGuidanceV2(issues);

  const activeCorrectionCount = [hasCefrIssue, hasMarkdownIssue, !!prosodyGuidance, !!interruptionGuidance, !!openingGuidance].filter(Boolean).length;
  const combinedGuidance =
    activeCorrectionCount > 1
      ? "\nThese issues must ALL be fixed together in the SAME rewrite. Fixing one must never come at the expense of another -- every specific instruction below applies simultaneously, not as alternatives."
      : "";

  return `\n\n===================== PREVIOUS ATTEMPT REJECTED =====================\nYour previous draft was rejected for these reasons:\n${bullets}\nRevise the script and fix ALL listed issues. There is no word-count target of any kind -- do NOT shorten or lengthen the conversation to address these issues; fix only the specific problems listed, and leave the length exactly as natural as it already is.${combinedGuidance}${prosodyGuidance}${interruptionGuidance}${openingGuidance}${cefrGuidance}${markdownGuidance}`;
}

function buildRevisionPreambleV2(): string {
  return "The assistant message directly above is the EXACT script you wrote last time, as the same JSON structure you must return again. Do NOT discard it and write a new script from scratch -- REVISE that exact draft. Make the smallest possible targeted edits that fix every issue listed below, and leave every turn, line, joke, example, and structural element that was NOT flagged completely unchanged: same topic, same hook, same personalities, same wording wherever it already worked, same opening block and interruption if they already passed, same overall length. You must still return the FULL script (every turn, not a diff or a summary of changes) -- but it should read as a lightly-edited version of your previous draft, not a different episode.";
}

/**
 * True when CEFR mismatch is the ONLY issue in the previous attempt's list
 * -- covers both shapes buildRevisionFeedbackV2()'s hasCefrIssue already
 * treats identically: the authoritative-grading failure
 * (checkCefrGradeV2(), always exactly one issue on its own, since grading
 * only runs once structural validation is already clean) and the rarer
 * structural self-report mismatch. A pure mismatch gets its own dedicated
 * preamble instead of the generic one, since the generic preamble's "leave
 * everything unchanged" directly contradicts "genuinely rewrite the
 * language" for a CEFR-only fix -- the same tension V1's
 * isPureCefrMismatch()/buildCefrOnlyRevisionPreamble() exist to resolve,
 * reproduced here as a fresh, independent implementation (never imported
 * from V1, and with no length caveat, since V2 has no length constraint to
 * protect during a CEFR-only rewrite).
 */
function isPureCefrMismatchV2(issues: ScriptValidationIssueV2[]): boolean {
  return issues.length === 1 && /cefr/i.test(issues[0].message);
}

/**
 * FIX #15 (CEFR-ONLY REVISION NEVER NAMED THE TARGET LEVEL): a real V2
 * canary (C2 request) confirmed by direct code audit that this preamble
 * previously took no parameters -- it never named the requested level and
 * never repeated CEFR_LEVEL_GUIDANCE_V2's level-specific content, unlike
 * buildPodcastScriptPromptV2()'s initial-generation prompt, which does
 * both. The real run's attempt 1 (with the full CEFR_LEVEL_GUIDANCE_V2.C2
 * text) failed CEFR grading once; the next 5 revision attempts then ran
 * on a preamble that never restated what "C2" specifically requires
 * (near-native fluency, lower-frequency vocabulary, wordplay/dry humor) --
 * every retry after the first was effectively asking the model to "raise
 * sophistication" toward an unnamed target. This fix closes exactly that
 * gap: the requested level is now named explicitly and
 * CEFR_LEVEL_GUIDANCE_V2[cefrLevel] is repeated here, the same way the
 * initial prompt already does it -- no other change to this preamble's
 * content-preservation/no-new-content framing, which is untouched.
 */
function buildCefrOnlyRevisionPreambleV2(cefrLevel: LinguAbcCefrLevel): string {
  return `The assistant message directly above is the EXACT script you wrote last time. Your ONLY job this time is to raise its CEFR sophistication to genuinely reach the requested level, CEFR ${cefrLevel} -- preserve the facts, topic, meaning, structure, opening block, interruption pattern, and every other passing element exactly as they already are, including its overall length. Do NOT add any new facts, examples, explanations, or content of any kind, and do NOT change the topic -- only upgrade the vocabulary and grammar used to express the SAME content. This is what genuine CEFR ${cefrLevel} specifically requires: ${CEFR_LEVEL_GUIDANCE_V2[cefrLevel]}`;
}

// ── CEFR grading (Phase 5 — a hard requirement, never weakened) ────────────

type CefrGradingResultV2 = { enrichment: EnrichmentResult } | { issues: ScriptValidationIssueV2[] };

/**
 * The REAL, authoritative enrichment grading — the same generateEnrichment()
 * (ai-processing.ts) call V1's generateAndCheckEnrichment() uses, reused
 * here as a fresh, independent implementation (that function is not
 * exported from scriptGeneration.ts). Requested CEFR remains a HARD
 * requirement: an approved grade (B2/C1/C2) that is still below the
 * REQUESTED level is rejected, not just an unapproved one (reuses
 * meetsOrExceedsLinguAbcCefrLevel() from cefrLevel.ts, same as V1's Fix
 * #14) — so a C2 request graded C1 or B2 fails here exactly as it should,
 * while a C2 request graded C2 passes, a C1 request graded C1 or C2
 * passes, and a B2 request graded B2, C1, or C2 all pass.
 */
async function checkCefrGradeV2(output: ScriptGenerationOutput, request: ScriptGenerationRequest): Promise<CefrGradingResultV2> {
  const readerText = buildReaderTranscript(toScriptLines(output, request))
    .map((segment) => `${segment.speaker}: ${segment.text}`)
    .join("\n");

  const enrichment = await generateEnrichment(output.title, readerText, "audio");

  if (!isApprovedLinguAbcCefrLevel(enrichment.cefrLevelMin) || !isApprovedLinguAbcCefrLevel(enrichment.cefrLevelMax)) {
    return {
      issues: [
        {
          message: `Authoritative enrichment graded this script as cefrLevelMin=${enrichment.cefrLevelMin}, cefrLevelMax=${enrichment.cefrLevelMax} -- LinguABC AI-generated podcasts must grade as B2, C1, or C2. Requested level was ${request.cefrLevel}.`,
        },
      ],
    };
  }
  if (!meetsOrExceedsLinguAbcCefrLevel(enrichment.cefrLevelMin, request.cefrLevel)) {
    return {
      issues: [
        {
          message: `Authoritative enrichment graded this script as cefrLevelMin=${enrichment.cefrLevelMin}, cefrLevelMax=${enrichment.cefrLevelMax} -- below the requested CEFR ${request.cefrLevel} (cefrLevelMin must be at least ${request.cefrLevel}). The script must genuinely be written at the requested level, not merely graded at LinguABC's B2 floor.`,
        },
      ],
    };
  }
  return { enrichment };
}

// ── Orchestrator (Phase 2) ──────────────────────────────────────────────────

export interface ScriptGenerationResultV2 {
  output: ScriptGenerationOutput;
  /** TELEMETRY ONLY — see this module's own doc comment. */
  wordCount: number;
  attempts: number;
  openingStructure: OpeningStructureCheck;
  enrichment: EnrichmentResult;
}

/**
 * generatePodcastScriptV2() — generate → validate → (targeted revision if
 * invalid) → re-validate → CEFR grading → return. Bounded by
 * MAX_ATTEMPTS_V2, same overall shape as V1's outer loop, but with NO
 * nested length-repair invocations and NO cross-attempt state describing
 * a length problem's severity, how much of it a previous attempt fixed, or
 * whether a later attempt should route straight back into another
 * length-repair round. Every attempt after the first is a single,
 * self-contained targeted revision driven ONLY by the immediately
 * preceding attempt's own real issues — there is no other state to carry.
 *
 * A malformed/unparseable response is retried exactly like a validation
 * failure, with the same short backoff V1 uses for the same reason
 * (observed transient truncated-response behavior from this provider).
 *
 * Throws (never returns a script that failed validation) if every attempt
 * fails — the caller must treat that as a failed generation. The thrown
 * message includes a short, content-free per-attempt log (word count only
 * as telemetry, issue messages themselves — never raw turn/script text).
 */
export async function generatePodcastScriptV2(request: ScriptGenerationRequest): Promise<ScriptGenerationResultV2> {
  const basePrompt = buildPodcastScriptPromptV2(request);
  let lastIssues: ScriptValidationIssueV2[] = [];
  let previousOutput: ScriptGenerationOutput | undefined;
  const attemptLog: string[] = [];

  for (let attempt = 1; attempt <= MAX_ATTEMPTS_V2; attempt++) {
    const wasPureCefrMismatch = isPureCefrMismatchV2(lastIssues);
    const messages: AIProviderMessage[] = previousOutput
      ? [
          { role: "user", content: basePrompt },
          { role: "assistant", content: JSON.stringify(previousOutput) },
          { role: "user", content: `${wasPureCefrMismatch ? buildCefrOnlyRevisionPreambleV2(request.cefrLevel) : buildRevisionPreambleV2()}${buildRevisionFeedbackV2(lastIssues)}` },
        ]
      : [{ role: "user", content: basePrompt }];

    let output: ScriptGenerationOutput;
    try {
      output = await generateStructuredJson({
        messages,
        schema: ScriptGenerationOutputSchemaV2,
        schemaName: "linguabc_podcast_script_v2",
        retryPolicy: BATCH_RETRY_POLICY,
        temperature: 0.9,
        maxTokens: SCRIPT_JSON_MAX_TOKENS_V2,
      });
    } catch (error) {
      lastIssues = [{ message: error instanceof Error ? error.message : String(error) }];
      attemptLog.push(`attempt ${attempt}: parse/generation error`);
      await sleepV2(3000 * attempt);
      continue;
    }

    previousOutput = output;
    const { issues: structuralIssues, wordCount } = validatePodcastScriptV2(output, request);

    if (structuralIssues.length > 0) {
      lastIssues = structuralIssues;
      attemptLog.push(`attempt ${attempt}: structural issues (wordCount: ${wordCount})`);
      continue;
    }

    // Structural validation is clean — run the real, authoritative CEFR
    // grading. Only reached once structural checks already passed, same
    // "don't spend a paid grading call on a script that's already going
    // to be rejected" reasoning V1 uses.
    let graded: CefrGradingResultV2;
    try {
      graded = await checkCefrGradeV2(output, request);
    } catch (error) {
      lastIssues = [{ message: `Enrichment/CEFR grading failed: ${error instanceof Error ? error.message : String(error)}` }];
      attemptLog.push(`attempt ${attempt}: CEFR grading call failed (wordCount: ${wordCount})`);
      continue;
    }
    if ("issues" in graded) {
      lastIssues = graded.issues;
      attemptLog.push(`attempt ${attempt}: CEFR grade rejected (wordCount: ${wordCount})`);
      continue;
    }

    return {
      output,
      wordCount,
      attempts: attempt,
      openingStructure: checkOpeningStructure(output, request),
      enrichment: graded.enrichment,
    };
  }

  throw new Error(`V2 script generation failed after ${MAX_ATTEMPTS_V2} attempts: ${lastIssues.map((issue) => issue.message).join("; ")}\n\nAttempt log:\n${attemptLog.join("\n")}`);
}
