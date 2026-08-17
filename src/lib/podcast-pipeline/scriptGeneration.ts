import { z } from "zod";
import { generateStructuredJson } from "@/ai/services/generate-structured-json";
import { BATCH_RETRY_POLICY } from "@/ai/retry";
import type { ScriptLine } from "./types";
import type { SpeakerName } from "./config";
import { isApprovedLinguAbcCefrLevel, type LinguAbcCefrLevel } from "./cefrLevel";
import { buildReaderTranscript } from "./transcript";

/**
 * Automated script generation — the capability this project's earlier
 * "Daily Podcast Automation" investigation deliberately deferred ("script
 * generation needs more design first"). Built now, as its own prompt
 * through the SAME shared LLM gateway generateEnrichment() already uses
 * (generateStructuredJson -> OpenRouter), never a second client.
 *
 * DELIBERATELY A SEPARATE PROMPT FROM ai-processing.ts's enrichment
 * prompt. Enrichment summarizes/quizzes an existing text; this WRITES a
 * two-person conversation with specific turn-structure and prosody rules
 * an enrichment prompt has no reason to know about. Reusing one prompt
 * for both would silently degrade whichever task it wasn't written for.
 *
 * The model is asked for STRUCTURED turns (speaker index + text), not raw
 * <|speaker:N|> text, specifically so this module can run real structural
 * validation (word count, turn-length variety, prosody density/placement,
 * opening/ending shape) before anything downstream ever sees the script —
 * matching this project's "no silent degradation" rule. A script that
 * fails validation is retried a bounded number of times, never softened
 * and never published as-is.
 */

const ScriptTurnSchema = z.object({
  /** 0 or 1, matching the two speakers passed into the prompt below. */
  speaker: z.union([z.literal(0), z.literal(1)]),
  /** The spoken line, WITH inline bracket prosody cues (e.g. "[thoughtful] ..."), exactly as Fish Audio expects. */
  text: z.string(),
});

const ScriptGenerationOutputSchema = z.object({
  title: z.string(),
  /** One-line topic description, human-readable, not the controlled topic vocabulary. */
  topic: z.string(),
  /** Free-form descriptive tags for this episode's subject (e.g. ["Psychology", "Travel"]) -- goes into rawTopics, same field enrichment.rawTopics already uses. No min/max here (matches ai-processing.ts's schemas, which never constrain array length) -- real length requirements are enforced by validateGeneratedScript() below instead, to avoid relying on how strictly a given provider's structured-output mode enforces JSON Schema minItems/maxItems. */
  topicTags: z.array(z.string()),
  /**
   * The model's own self-reported level, echoing back the exact level it
   * was asked to write at (ScriptGenerationRequest.cefrLevel). This is a
   * SOFT, early sanity check only -- validateGeneratedScript() below
   * rejects an outright mismatch (the model ignored the instruction), but
   * this is never the authoritative CEFR determination for the episode.
   * That's generateEnrichment()'s independent judgment of the actual
   * produced text, checked by publishing.ts's quality gate -- see
   * cefrLevel.ts's doc comment for why self-report alone would be "merely
   * labeling" rather than actually enforcing the level.
   */
  cefrLevel: z.enum(["B2", "C1", "C2"]),
  turns: z.array(ScriptTurnSchema),
});

export type ScriptGenerationOutput = z.infer<typeof ScriptGenerationOutputSchema>;

export interface ScriptGenerationRequest {
  speaker0Name: SpeakerName;
  speaker1Name: SpeakerName;
  /**
   * Which of B2/C1/C2 this episode must be written at -- chosen by the
   * caller (cefrLevel.ts's chooseCefrLevelForEpisode(), deterministic
   * rotation off the episode number), never left to the model to pick.
   * B1 is never a valid value here; that level comes only from the
   * external NOAA/existing content pipeline, never the AI generator.
   */
  cefrLevel: LinguAbcCefrLevel;
  /** Titles/topics of episodes already published -- the model must not repeat these. */
  usedTitles: string[];
  usedTopicTags: string[];
  /** Regenerate a corrected script for a SPECIFIC existing topic instead of
   * picking a fresh one -- used when a published episode's script must be
   * replaced for a structural defect (e.g. Episode #004's introductions
   * landing at the end instead of the opening) without changing its
   * subject. When set, this topic is exempted from the "already used"
   * avoid-list and the model is told explicitly to write about it again. */
  forcedTopic?: string;
}

const FIXED_PROSODY_TAGS = [
  "[emphasis]", "[break]", "[long-break]", "[whispering]", "[soft tone]", "[shouting]", "[screaming]", "[in a hurry tone]",
];

/** Level-specific prompt guidance -- each entry describes what genuinely
 * distinguishes that level's spoken English, not just a label to attach.
 * Deliberately does not include B1 or below -- that level is out of scope
 * for this generator entirely (see cefrLevel.ts). */
const CEFR_LEVEL_GUIDANCE: Record<LinguAbcCefrLevel, string> = {
  B2: "Natural spoken vocabulary, common idioms and everyday conversational expressions welcome. Sentences can have some complexity (relative clauses, conditionals, linking words like \"although\"/\"despite\") but stay clear and direct -- not textbook-stiff, not artificially advanced. A confident upper-intermediate learner should follow it without strain. IMPORTANT -- this must clearly clear B1, not sit at its edge: B1 is simple everyday chat with basic connectors and the occasional idiom; B2 requires genuinely extended discussion of a complex or abstract ANGLE of the topic (not just a surface-level personal anecdote), real conditional/subordinate-clause sentences used THROUGHOUT the conversation (not merely available if needed), and vocabulary a B1 learner would find noticeably harder. This script is independently graded against that exact bar after generation -- writing it \"safe and simple\" will fail the grade and be rejected.",
  C1: "More sophisticated vocabulary and less-common idiomatic expressions used naturally, not forced. Comfortable with nuance, implication, and understatement -- speakers can hedge, qualify, and disagree subtly rather than bluntly. Longer, more complex sentence structures (multiple subordinate clauses, varied discourse markers) are natural here, and the conversation can handle more abstract or layered ideas than a B2 episode would.",
  C2: "Near-native fluency: precise, idiomatic, occasionally playful with language (wordplay, understatement, dry humor) the way a fluent native speaker would use it, not simplified for a learner. Vocabulary can include lower-frequency words used exactly right. Arguments and reflections can be genuinely abstract or nuanced. This is the hardest tier LinguABC produces -- do not pull punches to make it easier.",
};

export function buildPrompt(request: ScriptGenerationRequest): string {
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
Target 940-980 words of actual spoken dialogue (prosody cues in [brackets] do not count toward this). A script under 920 words WILL BE REJECTED -- three separate real generations at ~850-870 words produced only 283-298 seconds of audio, just under the required 300 second minimum, and were wasted. Err toward the top of this range, not the bottom. This should produce roughly 5-6 minutes of audio.

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
Naturally include a MIX of (not force every one into every turn): short reactions, longer explanatory turns, follow-up questions, at least one self-correction or unfinished thought ("...", trailing off), a mild disagreement or pushback, a moment of humor, a small personal example or story from at least one speaker, and at least ONE callback near the end to something specific mentioned earlier in the episode. Do not force filler words into every sentence.

MANDATORY, NON-NEGOTIABLE: at least one genuine interruption MUST appear somewhere in the script -- one speaker's turn ends mid-sentence with an em dash "—" (not two hyphens), and the very next turn (the OTHER speaker) begins with an em dash "—" and completes or talks over that thought. This is two separate turns, not one. Concrete example of the exact pattern required:
  Speaker 0: "...and honestly I think the whole point is that we—"
  Speaker 1: "—never actually finish that argument? Yeah, I've noticed."
If your script does not contain this exact two-turn, dash-linked pattern at least once, it is invalid and will be rejected.

===================== PROSODY (VOCAL DIRECTION) =====================
Every spoken line may contain bracket cues that describe HOW it should sound. These are Fish Audio TTS delivery directions and are never spoken aloud.
Fixed supported tags you may use where they genuinely fit: ${FIXED_PROSODY_TAGS.join(", ")}.
You are NOT limited to fixed tags -- write natural-language descriptive cues for anything else, for example: [thoughtful], [curious, slight pitch rise], [genuine surprise, slight pitch rise], [quiet, lower voice], [slightly more energetic], [warm, lightly amused], [playful], [reflective], [amused].
Target roughly 4-6 meaningful cues per 100 words -- this is a target, not a mechanical rule. The important thing is CONTRAST: the vocal energy should genuinely shift across the episode (calm -> curious -> amused -> energetic -> reflective -> quiet), not sit at one flat energy the whole time. Do not tag every single sentence.
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

MANDATORY, NON-NEGOTIABLE: this entire introduction block (both speakers saying their names, plus the LinguABC mention) MUST occur within the FIRST FEW TURNS of the script -- roughly the first 15-25% of it, never later. It must NEVER appear only at the end, folded into the sign-off. A real prior generation put "I'm Sarah" / "And I'm Hannah" at the very end instead of the opening and was rejected for it after already being published by mistake -- do not repeat that mistake. The hook and a short development beat come first, then the introductions, then the main conversation. Do not save the names for later.

===================== ENDING =====================
Let the conversation reach its own natural conclusion first -- do not cut it off abruptly into a formal outro voice. Then close with a short, natural LinguABC sign-off. Vary the sign-off wording -- do not just write "This has been LinguABC" every time; find a natural way to close that fits THIS conversation's tone and, ideally, its callback.

===================== LEVEL =====================
This episode MUST be written at genuine CEFR ${request.cefrLevel} English -- not merely labeled ${request.cefrLevel}, actually written at that level of vocabulary, grammar, and conversational complexity. LinguABC's AI-generated podcasts are B2, C1, or C2 only -- never B1 or below; B1 listening content comes from a separate, non-AI-generated source.
${CEFR_LEVEL_GUIDANCE[request.cefrLevel]}

===================== OUTPUT =====================
Return the episode as a title, a one-line topic description, 1-5 short topic tags (e.g. "Psychology", "Travel", "Communication" -- broad descriptive categories, not the controlled app vocabulary), the CEFR level you wrote this at (must be exactly "${request.cefrLevel}", matching the LEVEL section above), and the full ordered list of turns, each with a speaker (0 for ${request.speaker0Name}, 1 for ${request.speaker1Name}) and that turn's exact spoken text including its bracket prosody cues.`;
}

const MAX_ATTEMPTS = 6;

/**
 * Explicit cap for generateStructuredJson()'s underlying provider call,
 * scoped to THIS call only (generateStructuredJson's maxTokens is already
 * per-call, not global -- see its own doc comment). Without this, OpenRouter
 * receives no `max_tokens` at all and falls back to the model's own
 * default, which is not guaranteed to comfortably fit this schema's output:
 * ~990 words of dialogue (~1400 tokens) plus per-turn JSON overhead
 * (speaker/text fields, quoting, punctuation) across up to 100 turns (the
 * upper bound validateGeneratedScript() accepts) can plausibly reach
 * ~3000-3500 tokens for the turns array alone. 6000 leaves comfortable
 * headroom above that worst case without constraining normal-length output.
 */
const SCRIPT_JSON_MAX_TOKENS = 6000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface ScriptValidationIssue {
  message: string;
}

const OPENING_WINDOW_PCT = 25;
const ENDING_WINDOW_PCT = 80;
const FORBIDDEN_OPENERS = [/^hello everyone/i, /^welcome back/i, /^today we(?:'re| are) going to/i, /^hi everyone/i, /^welcome to/i];

interface StructurePosition {
  turnIndex: number;
  wordIndex: number;
  percentage: number;
}

export interface OpeningStructureCheck {
  hookPresent: boolean;
  developmentPresent: boolean;
  introductionBlockPresent: boolean;
  speaker0IntroPosition: StructurePosition | null;
  speaker1IntroPosition: StructurePosition | null;
  linguabcPosition: StructurePosition | null;
  firstIntroPositionValid: boolean;
  secondIntroPositionValid: boolean;
  linguabcPositionValid: boolean;
  introductionBlockNotAtEnding: boolean;
  passed: boolean;
  issues: string[];
}

/**
 * Checks WHERE the introduction block occurs, not just whether the right
 * words exist anywhere in the script. Episode #004 published with real
 * "I'm Sarah." / "And I'm Hannah." text -- the OLD validator only checked
 * presence and passed it -- but positioned at the very end, folded into
 * the sign-off, instead of the required opening beat. This function is
 * the fix: it locates each marker's turn/word index, converts to a
 * percentage of the script's total length, and validates against
 * structural thresholds instead of a plain substring check.
 */
export function checkOpeningStructure(output: ScriptGenerationOutput, request: ScriptGenerationRequest): OpeningStructureCheck {
  const issues: string[] = [];
  const stripTags = (t: string) => t.replace(/\[[^\]]*\]/g, " ");

  let cumulativeWords = 0;
  let speaker0IntroPosition: StructurePosition | null = null;
  let speaker1IntroPosition: StructurePosition | null = null;
  let linguabcPosition: StructurePosition | null = null;
  let totalWords = 0;

  const turnStartWords: number[] = [];
  for (const turn of output.turns) {
    turnStartWords.push(cumulativeWords);
    const clean = stripTags(turn.text);
    const lower = clean.toLowerCase();

    if (speaker0IntroPosition === null && lower.includes(`i'm ${request.speaker0Name.toLowerCase()}`)) {
      speaker0IntroPosition = { turnIndex: turnStartWords.length - 1, wordIndex: cumulativeWords, percentage: 0 };
    }
    if (speaker1IntroPosition === null && lower.includes(`i'm ${request.speaker1Name.toLowerCase()}`)) {
      speaker1IntroPosition = { turnIndex: turnStartWords.length - 1, wordIndex: cumulativeWords, percentage: 0 };
    }
    if (linguabcPosition === null && lower.includes("linguabc")) {
      linguabcPosition = { turnIndex: turnStartWords.length - 1, wordIndex: cumulativeWords, percentage: 0 };
    }
    cumulativeWords += clean.split(/\s+/).filter(Boolean).length;
  }
  totalWords = cumulativeWords;

  const withPct = (pos: StructurePosition | null): StructurePosition | null =>
    pos && totalWords > 0 ? { ...pos, percentage: Math.round((pos.wordIndex / totalWords) * 1000) / 10 } : pos;
  speaker0IntroPosition = withPct(speaker0IntroPosition);
  speaker1IntroPosition = withPct(speaker1IntroPosition);
  linguabcPosition = withPct(linguabcPosition);

  const firstTurnText = output.turns[0] ? stripTags(output.turns[0].text).trim() : "";
  const hookPresent = firstTurnText.length > 0 && !FORBIDDEN_OPENERS.some((re) => re.test(firstTurnText));
  if (!hookPresent) issues.push("First turn reads like a generic greeting/announcement instead of a real hook.");

  // "Development" = at least one turn happens before the introduction
  // block starts -- the intro should never literally be the very first
  // line, per "HOOK -> reaction -> development -> ... -> introductions".
  const introTurnIndex = speaker0IntroPosition?.turnIndex ?? null;
  const developmentPresent = introTurnIndex !== null && introTurnIndex >= 1;
  if (introTurnIndex !== null && !developmentPresent) issues.push("Introduction happens on the very first turn -- no hook/development beat before it.");

  const introductionBlockPresent = speaker0IntroPosition !== null && speaker1IntroPosition !== null;
  if (!introductionBlockPresent) issues.push("Missing one or both 'I'm <name>' self-introductions entirely.");

  const firstIntroPositionValid = speaker0IntroPosition !== null && speaker0IntroPosition.percentage <= OPENING_WINDOW_PCT;
  if (speaker0IntroPosition && !firstIntroPositionValid) {
    issues.push(`${request.speaker0Name}'s introduction occurs at ${speaker0IntroPosition.percentage}% through the script -- must be within the first ${OPENING_WINDOW_PCT}%.`);
  }

  const secondIntroPositionValid =
    speaker1IntroPosition !== null &&
    speaker1IntroPosition.percentage <= OPENING_WINDOW_PCT + 10 &&
    speaker0IntroPosition !== null &&
    Math.abs(speaker1IntroPosition.turnIndex - speaker0IntroPosition.turnIndex) <= 4;
  if (speaker1IntroPosition && !secondIntroPositionValid) {
    issues.push(`${request.speaker1Name}'s introduction occurs at ${speaker1IntroPosition.percentage}% through the script or too far from ${request.speaker0Name}'s -- both introductions must be in the same opening block.`);
  }

  const linguabcPositionValid = linguabcPosition !== null && linguabcPosition.percentage <= OPENING_WINDOW_PCT + 15;
  if (linguabcPosition && !linguabcPositionValid) {
    issues.push(`LinguABC identity occurs at ${linguabcPosition.percentage}% through the script -- must occur in or immediately after the opening introduction block.`);
  }

  // The specific failure mode this whole check exists to catch: markers
  // present, but ONLY in the final 15-20% of the script (the sign-off),
  // never near the opening at all.
  const introductionBlockNotAtEnding =
    !(speaker0IntroPosition && speaker0IntroPosition.percentage >= ENDING_WINDOW_PCT) &&
    !(speaker1IntroPosition && speaker1IntroPosition.percentage >= ENDING_WINDOW_PCT);
  if (!introductionBlockNotAtEnding) {
    issues.push(`Introduction block found only in the final ${100 - ENDING_WINDOW_PCT}% of the script (the sign-off) -- it must be near the opening instead. This is exactly the Episode #004 defect.`);
  }

  const passed =
    hookPresent &&
    developmentPresent &&
    introductionBlockPresent &&
    firstIntroPositionValid &&
    secondIntroPositionValid &&
    linguabcPositionValid &&
    introductionBlockNotAtEnding;

  return {
    hookPresent,
    developmentPresent,
    introductionBlockPresent,
    speaker0IntroPosition,
    speaker1IntroPosition,
    linguabcPosition,
    firstIntroPositionValid,
    secondIntroPositionValid,
    linguabcPositionValid,
    introductionBlockNotAtEnding,
    passed,
    issues,
  };
}

/** Real, mechanical checks -- not a rubber stamp. Mirrors the same checks
 * used to hand-verify Episode #002 v2 (word count, multi-sentence turn
 * ratio, prosody density/placement, opening/ending shape) so a generated
 * script is held to the same bar a human-reviewed one was. */
export function validateGeneratedScript(output: ScriptGenerationOutput, request: ScriptGenerationRequest): ScriptValidationIssue[] {
  const issues: ScriptValidationIssue[] = [];
  const stripTags = (t: string) => t.replace(/\[[^\]]*\]/g, " ");

  // Soft sanity check only -- see cefrLevel.ts's doc comment. The model
  // was told exactly which level to write at; a mismatch here means it
  // ignored the instruction outright and should be retried. This is NOT
  // what makes the final published episode's level trustworthy -- that's
  // generateEnrichment()'s independent assessment, checked downstream by
  // publishing.ts's quality gate.
  if (output.cefrLevel !== request.cefrLevel) {
    issues.push({ message: `Requested CEFR level ${request.cefrLevel} but the model self-reported ${output.cefrLevel}.` });
  }

  // Calibrated against real measured Fish Audio speech rates across every
  // approved voice pair so far, which range ~2.72-2.95+ words/sec (e.g.
  // Sarah+Hannah: 832 words -> 306.18s = 2.72 wps; a later run measured
  // closer to 2.95 wps and produced only 294.7s from a sub-870-word
  // script). The pipeline's audio-duration gate is 300-360s, so at the
  // Three consecutive real generations at ~850-870 words produced
  // 283.3s, 294.7s, and 298.2s -- all just under the 300s floor, all
  // wasted after a real Fish Audio spend. The implied rate (~2.85-2.95
  // words/sec) means 850-870 words is simply not enough margin. Floor
  // raised to 920 -- still comfortably below the 970-990 words that would
  // risk the 360s ceiling at the SLOWEST observed rate (~2.72 wps).
  const wordCount = output.turns.reduce((sum, t) => sum + stripTags(t.text).split(/\s+/).filter(Boolean).length, 0);
  if (wordCount < 920 || wordCount > 990) {
    issues.push({ message: `Word count ${wordCount} is outside the acceptable 920-990 range (calibrated to land inside the pipeline's 300-360s audio-duration gate with real margin).` });
  }

  // Lower bound deliberately loose: natural multi-sentence turns (the
  // whole point of the turn-structure rule) mean FEWER, LONGER turns than
  // a more frequently-alternating episode -- a real 850-word script with
  // genuine 2-5 sentence turns can land around 20-25 turns and still be
  // excellent (verified against a real generated sample). The multi-
  // sentence-ratio and prosody checks below are the actual structure
  // signal; this just catches something structurally broken (e.g. 3 turns
  // for an 850-word episode).
  if (output.turns.length < 16 || output.turns.length > 100) {
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

  // Found in Episode #003's actual published transcript (*needed*,
  // *tried*, *do*, *why*) despite the prompt already asking for [emphasis]
  // instead -- Fish Audio has no markdown support and reads these
  // characters aloud literally. Hard-gated here so a repeat is rejected
  // and retried, never published.
  const markdownMarkers = output.turns.flatMap((t) => t.text.match(/\*[^*]+\*|_[^_]+_/g) ?? []);
  if (markdownMarkers.length > 0) {
    issues.push({ message: `Found markdown-style emphasis markers that would be read aloud literally (use [emphasis] instead): ${markdownMarkers.slice(0, 5).join(", ")}` });
  }

  // Security-audit finding (LOW): stripProsodyTags() (transcript.ts) only
  // strips well-formed [..] pairs -- an unclosed bracket from a malformed
  // turn would otherwise reach Fish Audio as literal text (spoken aloud,
  // e.g. "bracket emphasis") AND survive into the stored/reader-facing
  // transcript, since it never matches the strip regex. Caught here,
  // before the script is ever used for synthesis, so a malformed turn is
  // regenerated rather than published or spoken.
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

  // Security-audit finding (LOW): a cue the model meant as a bracket
  // direction but forgot to bracket (e.g. "Emphasis, I really thought..."
  // instead of "[emphasis] I really thought...") would be spoken aloud as
  // that literal word. Deliberately NARROW: only flags a fixed cue word
  // (or its no-brackets text) appearing as the very first word of a turn,
  // immediately followed by punctuation -- the exact shape a forgotten
  // bracket leaves behind. A normal sentence that happens to use one of
  // these words mid-turn ("I need a quick break before we continue") is
  // untouched; only the leak-shaped pattern is flagged.
  const bareCueWords = FIXED_PROSODY_TAGS.map((tag) => tag.slice(1, -1)).sort((a, b) => b.length - a.length);
  const bareCueRe = new RegExp(`^\\s*(${bareCueWords.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})\\s*[,.:]`, "i");
  const leakedCueTurns = output.turns.filter((t) => bareCueRe.test(stripTags(t.text)));
  if (leakedCueTurns.length > 0) {
    issues.push({
      message: `${leakedCueTurns.length} turn(s) start with what looks like a forgotten-bracket prosody cue spoken as literal dialogue (e.g. "${leakedCueTurns[0].text.slice(0, 40)}") -- wrap it in brackets (e.g. "[emphasis] ...") if it's a delivery direction.`,
    });
  }

  // Position-aware, not presence-only -- see checkOpeningStructure()'s doc
  // comment for exactly why the old "does the substring exist anywhere"
  // version of this check was insufficient (it passed Episode #004, whose
  // introductions were real but landed at the very end).
  const openingStructure = checkOpeningStructure(output, request);
  if (!openingStructure.passed) {
    issues.push(...openingStructure.issues.map((message) => ({ message })));
  }
  // Requires the SPECIFIC two-turn pattern the prompt mandates: one turn
  // ends with a dash and the very next turn begins with a dash -- not
  // just a dash appearing somewhere incidentally (which the earlier,
  // looser version of this check accepted and which turned out not to
  // reliably produce a real interruption).
  const endsWithDash = (t: string) => /[—-]\s*$/.test(t.trim());
  const startsWithDash = (t: string) => /^\s*[—-]/.test(t.trim());
  const hasInterruptionPattern = output.turns.some((turn, i) => i > 0 && endsWithDash(output.turns[i - 1].text) && startsWithDash(turn.text));
  if (!hasInterruptionPattern) {
    issues.push({ message: "No genuine interruption found -- need one turn ending with a dash immediately followed by the next turn starting with a dash (e.g. Speaker 0: '...we—' / Speaker 1: '—never finish that?')." });
  }

  return issues;
}

export interface ScriptGenerationResult {
  output: ScriptGenerationOutput;
  wordCount: number;
  attempts: number;
  /** Independently reportable -- the exact structural check that caught
   * Episode #004's defect, re-run against the script that actually passed
   * validation (guaranteed .passed === true here, since generateEpisodeScript
   * only returns a script once validateGeneratedScript found zero issues). */
  openingStructure: OpeningStructureCheck;
}

/**
 * Turns the previous attempt's validation issues into concise corrective
 * feedback appended to the NEXT attempt's prompt. Fixes the bug this
 * function replaces: generateEpisodeScript() used to retry with the
 * IDENTICAL prompt every time, so a model that missed the word-count
 * target once had no reason to land differently on the next try.
 *
 * A word-count issue additionally gets a narrower, harder target
 * (960-975, the middle of the accepted 920-990 range) than the base
 * prompt's original 940-980 guidance -- a retry needs a firmer push
 * toward the center, not a repeat of the instruction that already missed.
 * A CEFR-level issue (see checkGeneratedCefrLevel below) similarly gets a
 * concrete, actionable push rather than a repeat of the level name that
 * already failed to produce genuinely-B2+ text. A markdown-emphasis issue
 * gets the same treatment for the same reason: the base prompt already
 * forbids Markdown-style asterisk/underscore emphasis explicitly (see the
 * PROSODY section above), but before this fix a rejected attempt's
 * markdown violation was folded into the generic bullet list with no
 * extra insistence -- the model had already ignored that exact rule once,
 * so restating it in the same generic list gave it no stronger a signal
 * than the first time.
 */
export function buildRetryFeedback(issues: ScriptValidationIssue[]): string {
  const bullets = issues.map((issue) => `- ${issue.message}`).join("\n");
  const hasWordCountIssue = issues.some((issue) => /word count/i.test(issue.message));
  const hasCefrIssue = issues.some((issue) => /cefr/i.test(issue.message));
  const hasMarkdownIssue = issues.some((issue) => /markdown/i.test(issue.message));
  const wordCountGuidance = hasWordCountIssue
    ? "\nFor word count specifically, target approximately 960-975 spoken words this time -- aim for the middle of the accepted range, not its edge."
    : "";
  const cefrGuidance = hasCefrIssue
    ? "\nFor the CEFR level specifically, this draft read as easier than required. Raise vocabulary sophistication, use real conditional/subordinate-clause sentence structures throughout (not just when convenient), and discuss a genuinely complex or abstract angle of the topic instead of a simple personal anecdote -- do not just relabel the same simple script."
    : "";
  // Bracket wording deliberately does NOT use a closing/paired tag like
  // [/emphasis] -- the schema has never supported one (see PROSODY above
  // and validateGeneratedScript's unclosed/unmatched-bracket check), and
  // introducing one here would teach the model a convention nothing
  // downstream (Fish Audio, transcript.ts's stripProsodyTags) recognizes.
  const markdownGuidance = hasMarkdownIssue
    ? "\nRemove ALL Markdown emphasis markers such as *word* and **word**. They would be spoken literally, not interpreted as emphasis. Use the [emphasis] bracket cue placed directly before the word or phrase instead (e.g. \"[emphasis] really\", never \"*really*\") -- there is no closing tag in this schema, so never write [/emphasis]."
    : "";

  return `\n\n===================== PREVIOUS ATTEMPT REJECTED =====================\nYour previous draft was rejected for these reasons:\n${bullets}\nRewrite the script and fix ALL listed issues.${wordCountGuidance}${cefrGuidance}${markdownGuidance}`;
}

const CefrCheckOutputSchema = z.object({
  cefrLevelMin: z.enum(["A1", "A2", "B1", "B2", "C1", "C2"]),
  cefrLevelMax: z.enum(["A1", "A2", "B1", "B2", "C1", "C2"]),
});

/**
 * Grading rubric deliberately mirrors ai-processing.ts's buildPrompt()
 * cefrLevelMin/cefrLevelMax criteria IN SUBSTANCE, kept as an independent
 * copy here rather than an import -- same "by value, not import" posture
 * this codebase already uses for cross-module constants that must never
 * silently drift apart (see MIN_CATALOG_DURATION_SECONDS's doc comment in
 * queries.ts). ai-processing.ts is the generic, content-type-agnostic
 * Content Engine grader used for articles too; this check is intentionally
 * a separate, podcast-pipeline-scoped copy so a change to the generic
 * engine's prompt can never silently alter what this retry loop accepts
 * (or vice versa) without a reviewer seeing both.
 */
function buildCefrCheckPrompt(readerText: string): string {
  return `You are grading the CEFR difficulty of this English podcast transcript, honestly and strictly -- do not default to a flattering level. This grading uses the exact rubric a downstream content-quality gate will also apply, so an inaccurate grade here does not prevent a real rejection later, it only delays it.

Transcript:
"${readerText}"

Return cefrLevelMin (the LOWEST CEFR level at which a learner can independently understand approximately 70% of this content without extensive external help) and cefrLevelMax (the HIGHEST CEFR level this content still meaningfully serves), using this rubric: A1 = absolute beginner (very familiar basic words, present tense and 'be' verb only, zero unknown vocabulary); A2 = elementary (common everyday words, simple past, basic connectors like and/but/so, short sentences on familiar topics such as shopping or family); B1 = intermediate (everyday conversations and introduced abstract topics, some idioms and phrasal verbs, past/present/future used fluently); B2 = upper-intermediate (extended discussion of complex or abstract topics, conditional sentences, nuanced vocabulary, requires solid fluency); C1 = advanced (implicit meaning, irony, dense vocabulary, cultural references, spontaneous or technical language for near-fluent speakers); C2 = mastery (near-native level, highly abstract or technical or culturally embedded, essentially no simplification, only near-native speakers reach 70% independently).`;
}

/**
 * The real independent CEFR verification this project's own design already
 * calls for -- see cefrLevel.ts's doc comment: "a script generator asked
 * for B2 could still produce text that reads as B1, and simply trusting
 * its own self-report would be 'merely labeling'". Until this function
 * existed, that independent judgment only ever happened AFTER Fish Audio
 * synthesis, forced alignment, and audio upload had already run (real
 * paid spend, real compute) -- publishing.ts's quality gate was the sole
 * enforcement point, and a miss there discarded all of that work. This
 * runs the SAME kind of independent judgment here instead, while a miss
 * is still cheap to retry (bounded by generateEpisodeScript's existing
 * MAX_ATTEMPTS loop, same as any other validation failure) -- so the
 * metadata that eventually reaches the quality gate honestly reflects
 * content that has already cleared this bar, not a relabeled guess.
 *
 * Deliberately NOT the full generateEnrichment() call (which also
 * produces vocabulary/quiz/summary/etc.) -- that would spend real tokens
 * regenerating content this function never needs, on every attempt. Only
 * cefrLevelMin/cefrLevelMax are requested here; the real, full enrichment
 * is still generated exactly once, after a script has already passed this
 * check (dailyGenerate.ts's existing generateEnrichment() call, unchanged).
 */
export async function checkGeneratedCefrLevel(
  output: ScriptGenerationOutput,
  request: ScriptGenerationRequest,
): Promise<ScriptValidationIssue[]> {
  const readerText = buildReaderTranscript(toScriptLines(output, request))
    .map((segment) => `${segment.speaker}: ${segment.text}`)
    .join("\n");

  const graded = await generateStructuredJson({
    messages: [{ role: "user", content: buildCefrCheckPrompt(readerText) }],
    schema: CefrCheckOutputSchema,
    schemaName: "linguabc_podcast_script_cefr_check",
    retryPolicy: BATCH_RETRY_POLICY,
  });

  if (!isApprovedLinguAbcCefrLevel(graded.cefrLevelMin) || !isApprovedLinguAbcCefrLevel(graded.cefrLevelMax)) {
    return [
      {
        message: `Independent CEFR check graded this script as cefrLevelMin=${graded.cefrLevelMin}, cefrLevelMax=${graded.cefrLevelMax} -- LinguABC AI-generated podcasts must grade as B2, C1, or C2 (the same rubric publishing.ts's quality gate enforces on the published episode). Requested level was ${request.cefrLevel}.`,
      },
    ];
  }
  return [];
}

/** Generates and validates in a loop, bounded by MAX_ATTEMPTS. Throws
 * (never returns a script that failed validation) if every attempt fails
 * -- the caller must treat that as a failed generation, not publish
 * whatever the last attempt produced. A passing script has cleared BOTH
 * the structural checks (validateGeneratedScript) AND an independent CEFR
 * grading (checkGeneratedCefrLevel) -- not just the model's own
 * self-reported level -- so downstream metadata honestly reflects content
 * that has already been judged B2+, not merely labeled that way. */
export async function generateEpisodeScript(request: ScriptGenerationRequest): Promise<ScriptGenerationResult> {
  const basePrompt = buildPrompt(request);
  let lastIssues: ScriptValidationIssue[] = [];

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    // Attempt 1 stays exactly as before (clean prompt, no feedback block).
    // Attempts 2-6 append what the previous attempt got wrong.
    const prompt = attempt === 1 ? basePrompt : `${basePrompt}${buildRetryFeedback(lastIssues)}`;
    let output: ScriptGenerationOutput;
    try {
      output = await generateStructuredJson({
        messages: [{ role: "user", content: prompt }],
        schema: ScriptGenerationOutputSchema,
        schemaName: "linguabc_podcast_script",
        retryPolicy: BATCH_RETRY_POLICY,
        temperature: 0.9,
        maxTokens: SCRIPT_JSON_MAX_TOKENS,
      });
    } catch (error) {
      // A malformed/truncated JSON response or a schema mismatch is a
      // one-off model hiccup, not a reason to give up immediately -- retry
      // it exactly like a validation failure, bounded by the same
      // MAX_ATTEMPTS. Only the LAST attempt's error propagates.
      lastIssues = [{ message: error instanceof Error ? error.message : String(error) }];
      if (attempt === MAX_ATTEMPTS) {
        throw new Error(`Script generation failed after ${MAX_ATTEMPTS} attempts: ${lastIssues.map((i) => i.message).join("; ")}`);
      }
      // Observed in practice: OpenRouter occasionally returns HTTP 200
      // with finish_reason "error" and truncated content for this model —
      // not an HTTP-level failure generateStructuredJson's own retry
      // policy would catch, but genuinely transient (a following call
      // succeeded). A short backoff before the next attempt costs little
      // and matches this project's established backoff-before-retry
      // posture elsewhere (Fish Audio, OpenRouter's own 429/5xx handling).
      await sleep(3000 * attempt);
      continue;
    }

    const structuralIssues = validateGeneratedScript(output, request);
    // Independent CEFR grading only runs once the structural checks
    // already passed -- a script that's already going to be rejected for
    // e.g. word count or missing interruption pattern doesn't need a
    // second paid LLM call to also grade its reading level.
    let issues = structuralIssues;
    if (structuralIssues.length === 0) {
      try {
        issues = await checkGeneratedCefrLevel(output, request);
      } catch (error) {
        issues = [{ message: `CEFR-level check failed: ${error instanceof Error ? error.message : String(error)}` }];
      }
    }

    if (issues.length === 0) {
      const wordCount = output.turns.reduce((sum, t) => sum + t.text.replace(/\[[^\]]*\]/g, " ").split(/\s+/).filter(Boolean).length, 0);
      return { output, wordCount, attempts: attempt, openingStructure: checkOpeningStructure(output, request) };
    }
    lastIssues = issues;
  }

  throw new Error(
    `Script generation failed validation after ${MAX_ATTEMPTS} attempts: ${lastIssues.map((i) => i.message).join("; ")}`,
  );
}

/** Converts the model's structured turns into the ScriptLine[] shape the
 * existing pipeline (fishAudio.ts, transcript.ts, alignment.ts) already
 * consumes -- no parallel script representation. */
export function toScriptLines(output: ScriptGenerationOutput, request: ScriptGenerationRequest): ScriptLine[] {
  const names: [SpeakerName, SpeakerName] = [request.speaker0Name, request.speaker1Name];
  return output.turns.map((turn) => [names[turn.speaker], turn.text] as ScriptLine);
}
