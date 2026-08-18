import { z } from "zod";
import { generateStructuredJson } from "@/ai/services/generate-structured-json";
import type { AIProviderMessage } from "@/ai/providers";
import { BATCH_RETRY_POLICY } from "@/ai/retry";
import { generateEnrichment } from "@/lib/content-engine/ai-processing";
import type { EnrichmentResult } from "@/lib/content-engine/types";
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
MANDATORY, NON-NEGOTIABLE: your dialogue MUST contain at least 930 spoken words (prosody cues in [brackets] do not count toward this) -- do not submit a draft under 930 words. This is a hard floor, checked mechanically by word count immediately after you respond, not a rough suggestion. Target 935-950 words specifically -- write to genuinely land in that range, not just barely above the floor.
MANDATORY, NON-NEGOTIABLE: do NOT exceed 965 words under any circumstances. A script over 965 words has already been rejected in real production for producing audio longer than the pipeline's hard 360-second limit -- going over the target range is exactly as invalid as falling short of it, not a safe direction to err toward.
A script under 920 words WILL BE REJECTED outright: multiple real generations at 830-870 words have already been rejected and wasted real synthesis cost for landing short, despite every OTHER rule in this prompt (turn structure, interruption, prosody, opening position) being satisfied -- satisfying those other rules does NOT excuse a short script; length is checked with exactly the same severity as every "MANDATORY, NON-NEGOTIABLE" rule below.
This should produce roughly 5-6 minutes of audio. A script that "feels finished" structurally at 850 words is NOT long enough -- extend the conversation with more genuine content (another follow-up question, a longer example, a deeper reaction, more of the callback) rather than stopping once the structural beats are covered.

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
MANDATORY, NON-NEGOTIABLE: target 4-6 meaningful cues per 100 words, spread across the WHOLE script. A script with a real prosody density below ~2 cues per 100 words WILL BE REJECTED outright, exactly like the other hard rules in this prompt -- this is checked mechanically by counting bracket cues after you respond, not judged loosely. The important thing is CONTRAST: the vocal energy should genuinely shift across the episode (calm -> curious -> amused -> energetic -> reflective -> quiet), not sit at one flat energy the whole time. Do not tag every single sentence -- but also do not add length to the script (more turns, more words) without proportionally adding more cues; a longer script needs MORE cues to hold the same density, not the same handful spread thinner.
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
 * ~965 words of dialogue (~1400 tokens) plus per-turn JSON overhead
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
  // script). The pipeline's audio-duration gate is 300-360s. Three
  // consecutive real generations at ~850-870 words produced 283.3s,
  // 294.7s, and 298.2s -- all just under the 300s floor, all wasted after
  // a real Fish Audio spend. The implied rate (~2.85-2.95 words/sec)
  // means 850-870 words is simply not enough margin. Floor raised to 920.
  //
  // CEILING: originally set to 990 on the theory that 990 words at the
  // slowest documented rate (2.72 wps) would merely "risk" the 360s
  // ceiling. That was wrong, not just optimistic -- 990/2.72 = 364.4s,
  // already PAST 360s, with no margin at all. A real linguabc-episode-006
  // run (Ben+Hannah, a DIFFERENT pair than the original 2.72 wps
  // measurement) passed this 920-990 gate and then produced 365.4s of
  // real, paid audio -- confirming the ceiling let through word counts
  // that cannot reliably stay under the audio gate at real, slow-pair
  // speech rates. Ceiling lowered to 965 (360s / 2.72 wps = 979.2 words
  // theoretical max; 965 keeps ~5s / ~14 words of real margin below that,
  // matching the same "real margin, not just the theoretical edge"
  // posture already used for the 920 floor above).
  const wordCount = output.turns.reduce((sum, t) => sum + stripTags(t.text).split(/\s+/).filter(Boolean).length, 0);
  if (wordCount < 920 || wordCount > 965) {
    issues.push({ message: `Word count ${wordCount} is outside the acceptable 920-965 range (calibrated to land inside the pipeline's 300-360s audio-duration gate with real margin, including at the slowest real Fish Audio rates observed).` });
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
  /**
   * The REAL, authoritative enrichment result -- generated exactly once,
   * here, via generateAndCheckEnrichment(), before any Fish Audio/
   * alignment spend. Its cefrLevelMin/cefrLevelMax are guaranteed B2/C1/C2
   * (that grading is what makes generateEpisodeScript() return at all --
   * see generateAndCheckEnrichment()'s doc comment). The caller MUST reuse
   * this object as-is for publishing (dailyGenerate.ts does) -- calling
   * generateEnrichment() again would spend tokens re-grading content
   * that's already been judged, and could theoretically re-introduce the
   * exact precheck/authoritative disagreement this design eliminates.
   */
  enrichment: EnrichmentResult;
}

/**
 * Turns the previous attempt's validation issues into concise corrective
 * feedback appended to the NEXT attempt's prompt. Fixes the bug this
 * function replaces: generateEpisodeScript() used to retry with the
 * IDENTICAL prompt every time, so a model that missed the word-count
 * target once had no reason to land differently on the next try.
 *
 * A word-count issue gets a CONCRETE, deficit-based instruction computed
 * from the actual previous count (e.g. "Previous draft: 833 words...
 * Add approximately 102-117 spoken words"), not just an abstract target
 * restatement -- a model that has now undershot (or overshot) the range
 * multiple times in a row (see the LENGTH section's own note: 830-870-word
 * real generations, repeatedly, and separately several real overshoots)
 * needs to be told exactly how far off it was and by how much to
 * add/cut, not handed the same "aim higher/lower" phrasing that already
 * failed to move it. Falls back to the abstract 935-950 restatement only
 * if the previous count can't be parsed out of the issue message
 * (defensive; the message format is controlled by validateGeneratedScript
 * above and should always match).
 * A CEFR-level issue (see generateAndCheckEnrichment below) similarly gets a
 * concrete, actionable push rather than a repeat of the level name that
 * already failed to produce genuinely-B2+ text. A markdown-emphasis issue
 * gets the same treatment for the same reason: the base prompt already
 * forbids Markdown-style asterisk/underscore emphasis explicitly (see the
 * PROSODY section above), but before this fix a rejected attempt's
 * markdown violation was folded into the generic bullet list with no
 * extra insistence -- the model had already ignored that exact rule once,
 * so restating it in the same generic list gave it no stronger a signal
 * than the first time.
 *
 * A prosody-density issue and a missing-interruption issue get the SAME
 * dedicated treatment for the SAME reason -- both used to fall into the
 * generic bullet list with no extra insistence, exactly the gap that let
 * a real run land at 1181 words (fixed correctly, cut guidance already
 * worked) while STILL failing prosody density (1.61/100 words, well
 * under the ~2/100 hard floor) and the interruption pattern, because
 * nothing in the feedback told the model those two failures were just as
 * non-negotiable as the word count it had just overcorrected.
 *
 * checkOpeningStructure() issues (see buildOpeningStructureGuidance below)
 * get the SAME treatment for the SAME reason, closing the last gap of this
 * kind: a later run fixed word count and prosody while the introductions
 * and LinguABC mention drifted to 96.8-98.7% through the script -- folded
 * into the sign-off, unreinforced across all 6 attempts, because this was
 * the one recurring category that had never gotten issue-specific retry
 * guidance despite checkOpeningStructure() existing specifically to catch
 * exactly this (the Episode #004 defect).
 *
 * When two or more of these issues co-occur, an explicit combined-fix
 * sentence is prepended so fixing one (e.g. trimming length) is never
 * read as permission to ignore the others.
 */
const WORD_COUNT_ISSUE_RE = /word count (\d+) is outside/i;
const WORD_COUNT_TARGET_MIN = 935;
const WORD_COUNT_TARGET_MAX = 950;

/**
 * Mirrors validateGeneratedScript()'s own 965 hard ceiling, named here
 * ONLY so the near-ceiling formula below is self-documenting.
 * validateGeneratedScript()'s check above is left as a literal and is NOT
 * wired to this constant -- there is still exactly one authoritative
 * validation gate (unchanged), and this is a separately-named mirror of
 * its ceiling value used purely to compute retry guidance text.
 */
const WORD_COUNT_HARD_MAX = 965;

/**
 * Real overshoots have come in two very different shapes: large ones
 * (1032, 1087, 1181 words -- 67 to 216 words past the 965 ceiling), where
 * a full cut down to the 935-950 sub-target is the right ask, and a near
 * miss (1015 words -- only 50 past the ceiling, with every OTHER check
 * already passing), where that same "cut all the way to 935-950"
 * instruction demanded a 65-80-word cut when only ~55 words needed
 * removing to become compliant. Asking for a bigger edit than necessary
 * gives the model more surface area to under- or over-correct on --
 * exactly the failure a real run hit (SCRIPT_GENERATION failing after 6
 * attempts, final word count 1015).
 *
 * A previous count within this many words of the hard ceiling is treated
 * as a near miss and gets the smaller, ceiling-anchored cut below instead.
 * 60 is chosen from the real data on hand: it keeps the confirmed near
 * miss (1015, 50 over) on the modest path while keeping every confirmed
 * large overshoot (1032, 67 over; 1087; 1181) on the existing 935-950
 * path -- there is no observed real overshoot between 51 and 66 words to
 * calibrate a tighter boundary against.
 */
const NEAR_CEILING_OVERSHOOT_LIMIT = 60;

/**
 * Near-miss cut target: safely under the 965 hard ceiling with a small
 * margin (5-10 words), but deliberately NOT all the way down to the
 * 935-950 sub-target -- the point of this path is a smaller, more
 * executable edit for a draft that is already close to compliant.
 */
const NEAR_CEILING_TARGET_MAX = WORD_COUNT_HARD_MAX - 5; // 960
const NEAR_CEILING_TARGET_MIN = WORD_COUNT_HARD_MAX - 10; // 955

/**
 * Builds the word-count-specific retry line. Given the actual previous
 * count (parsed from validateGeneratedScript's own message, never
 * guessed), computes a real add/cut range so the model is told a concrete
 * number instead of an abstract target it has already ignored. Undershoot
 * and overshoot are both handled -- both have now been observed in real
 * generations (initially only undershoot, later several real overshoots
 * up to 1181 words, then 1087, then a near-miss at 1015, most recently a
 * script that passed the OLD 920-990 gate outright and still produced
 * 365.4s of real audio).
 *
 * The sub-target itself moved from 960-975 to 935-950 when
 * validateGeneratedScript()'s hard ceiling was recalibrated from 990 to
 * 965 (see that function's doc comment for the real-data derivation) --
 * the old 960-975 band no longer fit entirely inside the corrected hard
 * range, so it shifted down with it, keeping the same 15-word width and
 * the same real margin on both sides of the true 920-965 range.
 *
 * The overshoot branch has two paths (see NEAR_CEILING_OVERSHOOT_LIMIT's
 * doc comment for why): a near-miss draft gets a smaller cut anchored just
 * under the hard ceiling; a large overshoot keeps the original, more
 * emphatic "cut all the way to 935-950" treatment, restating the hard
 * ceiling and asking the model to recount before returning. Undershoot
 * guidance is untouched by this or either prior fix.
 */
function buildWordCountGuidance(issues: ScriptValidationIssue[]): string {
  const match = issues.map((issue) => issue.message.match(WORD_COUNT_ISSUE_RE)).find((m): m is RegExpMatchArray => m !== null);
  if (!match) {
    // Defensive fallback -- should not normally happen, see doc comment above.
    return "\nFor word count specifically, target approximately 935-950 spoken words this time -- aim for the middle of the accepted range, not its edge.";
  }

  const previousCount = Number(match[1]);
  if (previousCount < WORD_COUNT_TARGET_MIN) {
    const addMin = WORD_COUNT_TARGET_MIN - previousCount;
    const addMax = WORD_COUNT_TARGET_MAX - previousCount;
    return `\nPrevious draft: ${previousCount} words. Required: 920-965. Add approximately ${addMin}-${addMax} spoken words while preserving the existing structure, turn variety, and every other rule above -- do not pad with filler; extend real dialogue (a longer story, an extra follow-up question, a deeper reaction, more of the callback). Target 935-950 words total.`;
  }
  if (previousCount > WORD_COUNT_TARGET_MAX) {
    const overshoot = previousCount - WORD_COUNT_HARD_MAX;
    if (overshoot > 0 && overshoot <= NEAR_CEILING_OVERSHOOT_LIMIT) {
      const cutMin = previousCount - NEAR_CEILING_TARGET_MAX;
      const cutMax = previousCount - NEAR_CEILING_TARGET_MIN;
      return `\nPrevious draft: ${previousCount} words. Required: 920-965, hard maximum 965 -- this draft already exceeds it, but only by ${overshoot} word(s), so a full cut down to 935-950 is unnecessary. Do NOT rewrite or expand the draft. This is a CUT operation, not a generation target: the revised draft MUST be SHORTER than the previous ${previousCount}-word draft. Cut approximately ${cutMin}-${cutMax} spoken words from the EXISTING dialogue -- trim sentences and phrases within turns, don't just delete whole turns, and do not add replacement paragraphs or new content to compensate for what you cut. Preserve the existing opening block, interruption, prosody cues, and CEFR-level content exactly as they already are -- only cut. Target ${NEAR_CEILING_TARGET_MIN}-${NEAR_CEILING_TARGET_MAX} words total, safely under the 965 hard maximum with a small margin -- you do NOT need to reach all the way down to 935-950. Before returning your answer, mentally recount the final spoken word total (excluding bracket cues) -- if it is still above 965, cut more.`;
    }
    const cutMin = previousCount - WORD_COUNT_TARGET_MAX;
    const cutMax = previousCount - WORD_COUNT_TARGET_MIN;
    return `\nPrevious draft: ${previousCount} words. Required: 920-965, hard maximum 965 -- this draft already exceeds it. Do NOT rewrite or expand the draft. This is a CUT operation, not a generation target: the revised draft MUST be SHORTER than the previous ${previousCount}-word draft. Cut approximately ${cutMin}-${cutMax} spoken words from the EXISTING dialogue -- trim sentences and phrases within turns, don't just delete whole turns, and do not add replacement paragraphs or new content to compensate for what you cut. Preserve the existing opening block, interruption, prosody cues, and CEFR-level content exactly as they already are -- only cut. Target 935-950 words total, and it MUST NOT exceed 965. Before returning your answer, mentally recount the final spoken word total (excluding bracket cues) -- if it is still above 965, cut more.`;
  }
  // previousCount is inside 935-950 but the issue still fired, which can
  // only mean the message format changed underneath this parser.
  return "\nFor word count specifically, target approximately 935-950 spoken words this time -- aim for the middle of the accepted range, not its edge.";
}

const PROSODY_DENSITY_ISSUE_RE = /Prosody density ([\d.]+)\/100 words/i;

/**
 * Builds the prosody-specific retry line. Parses the actual measured
 * density from validateGeneratedScript's own message when present (never
 * guessed), states it plainly against the 4-6/100 target, and tells the
 * model to spread cues throughout the WHOLE dialogue -- not add a cue-spam
 * pass, and not let a longer script (a word-count fix) dilute density by
 * adding words without proportionally more cues. Also covers the
 * separate "every cue is turn-initial" placement issue, which can fire
 * independently of density.
 */
function buildProsodyGuidance(issues: ScriptValidationIssue[]): string {
  const densityMatch = issues.map((issue) => issue.message.match(PROSODY_DENSITY_ISSUE_RE)).find((m): m is RegExpMatchArray => m !== null);
  const hasMidSentenceIssue = issues.some((issue) => /every cue is turn-initial/i.test(issue.message));
  if (!densityMatch && !hasMidSentenceIssue) return "";

  const densityLine = densityMatch
    ? `Current prosody density: ${densityMatch[1]}/100 words. Required: approximately 4-6/100 words.`
    : "Prosody cue placement needs work.";
  const placementLine = hasMidSentenceIssue
    ? " At least some cues must sit INSIDE a turn, mid-sentence, right before the word or phrase whose delivery changes -- not only at the very start of a turn."
    : "";

  return `\n${densityLine} Add natural bracket prosody cues (the SAME existing tags/format already described in the PROSODY section above -- e.g. [emphasis], [thoughtful], [break] -- placed directly before the affected word or phrase) spread THROUGHOUT the entire dialogue, not clustered in only a few turns or added as a handful of isolated markers.${placementLine} Do not cue every single sentence either -- this is about even, natural distribution across the whole script, not maximum cue count. If you also need to change the length, keep density proportional: more words requires proportionally more cues, not the same handful spread thinner.`;
}

/**
 * Builds the interruption-specific retry line. Restates the EXACT
 * two-turn, dash-linked pattern validateGeneratedScript() checks for
 * (mirroring the base prompt's own MANDATORY block), and explicitly rules
 * out the common near-miss: a dash appearing somewhere inside a turn's
 * dialogue is NOT the same as one turn ending on a dash and the next
 * turn starting on one.
 */
function buildInterruptionGuidance(issues: ScriptValidationIssue[]): string {
  const hasInterruptionIssue = issues.some((issue) => /no genuine interruption found/i.test(issue.message));
  if (!hasInterruptionIssue) return "";

  return `\nA genuine interruption is still missing and is structurally REQUIRED. You must include the EXACT pattern: one speaker's turn ends mid-sentence with an em dash "—", and the very next turn (the OTHER speaker) begins with an em dash "—" and completes or talks over that thought -- this is TWO separate turns, not a dash placed anywhere inside a single turn's dialogue. Merely including a dash somewhere in the script does NOT satisfy this rule. Required pattern: Speaker 0: "...and honestly I think the whole point is that we—" / Speaker 1: "—never actually finish that argument? Yeah, I've noticed."`;
}

// Match checkOpeningStructure()'s own issue message shapes exactly --
// never guessed -- so names/percentages can be pulled straight out of the
// real validation result instead of restated generically.
const HOOK_MISSING_RE = /reads like a generic greeting\/announcement instead of a real hook/i;
const NO_DEVELOPMENT_RE = /no hook\/development beat before it/i;
const MISSING_INTROS_RE = /Missing one or both .*self-introductions entirely/i;
const FIRST_INTRO_LATE_RE = /^(.+?)'s introduction occurs at ([\d.]+)% through the script -- must be within the first/i;
const SECOND_INTRO_LATE_RE = /^(.+?)'s introduction occurs at ([\d.]+)% through the script or too far from (.+?)'s/i;
const LINGUABC_LATE_RE = /^LinguABC identity occurs at ([\d.]+)% through the script/i;
const ENDING_ONLY_RE = /Introduction block found only in the final \d+% of the script \(the sign-off\)/i;

/**
 * Builds the opening-structure-specific retry line -- the gap this fix
 * closes. checkOpeningStructure() (and validateGeneratedScript(), which
 * folds its issues in) has always produced fully specific messages
 * ("Ben's introduction occurs at 98.7% through the script..."), but
 * before this fix those messages only ever reached the generic bullet
 * list, with none of the escalating, issue-specific reinforcement every
 * OTHER recurring category (word count, prosody, interruption, CEFR,
 * markdown) already gets. That gap let a real run fail 6/6 attempts with
 * introductions and the LinguABC mention landing at 96.8-98.7% through
 * the script -- restated unchanged in the bullet list every retry, never
 * reinforced. This mirrors that exact pattern: pull the real names and
 * percentages out of the actual issue messages (never guessed) and give
 * the model the concrete, ordered structure it must follow instead.
 */
function buildOpeningStructureGuidance(issues: ScriptValidationIssue[]): string {
  const hookMissing = issues.some((issue) => HOOK_MISSING_RE.test(issue.message));
  const noDevelopment = issues.some((issue) => NO_DEVELOPMENT_RE.test(issue.message));
  const missingIntros = issues.some((issue) => MISSING_INTROS_RE.test(issue.message));
  const firstIntroLate = issues.map((issue) => issue.message.match(FIRST_INTRO_LATE_RE)).find((m): m is RegExpMatchArray => m !== null);
  const secondIntroLate = issues.map((issue) => issue.message.match(SECOND_INTRO_LATE_RE)).find((m): m is RegExpMatchArray => m !== null);
  const linguabcLate = issues.map((issue) => issue.message.match(LINGUABC_LATE_RE)).find((m): m is RegExpMatchArray => m !== null);
  const endingOnly = issues.some((issue) => ENDING_ONLY_RE.test(issue.message));

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

  return `\nThe opening block is still wrong: ${specifics.join("; ")}. The REQUIRED order, every time, with nothing else in between, is: (1) the hook, (2) one brief reaction/development beat, (3) Speaker 0 introduces himself ("I'm <name>"), (4) Speaker 1 introduces herself in that SAME opening block ("And I'm <name>"), (5) a brief LinguABC mention immediately after the introductions, (6) THEN the main topic conversation begins. The introductions and the LinguABC identity must NOT first appear in the closing sign-off -- the sign-off may mention LinguABC again naturally, but that later mention does not satisfy this requirement. The FIRST LinguABC mention and BOTH introductions must land within roughly the first quarter of the script, immediately after the hook and its one reaction beat.`;
}

export function buildRetryFeedback(issues: ScriptValidationIssue[]): string {
  const bullets = issues.map((issue) => `- ${issue.message}`).join("\n");
  const hasWordCountIssue = issues.some((issue) => /word count/i.test(issue.message));
  const hasCefrIssue = issues.some((issue) => /cefr/i.test(issue.message));
  const hasMarkdownIssue = issues.some((issue) => /markdown/i.test(issue.message));
  const wordCountGuidance = hasWordCountIssue ? buildWordCountGuidance(issues) : "";
  const cefrGuidance = hasCefrIssue
    ? "\nFor the CEFR level specifically: this draft was independently graded BELOW the required B2+ standard by the same authoritative grading the published episode will be checked against -- this is not a labeling mistake, the actual vocabulary and sentence complexity were too simple. Raise vocabulary sophistication, use real conditional/subordinate-clause sentence structures throughout (not just when convenient), and discuss a genuinely complex or abstract angle of the topic instead of a simple personal anecdote. Genuinely rewrite the language -- do not just relabel the same simple script or change the self-reported level field."
    : "";
  // Bracket wording deliberately does NOT use a closing/paired tag like
  // [/emphasis] -- the schema has never supported one (see PROSODY above
  // and validateGeneratedScript's unclosed/unmatched-bracket check), and
  // introducing one here would teach the model a convention nothing
  // downstream (Fish Audio, transcript.ts's stripProsodyTags) recognizes.
  const markdownGuidance = hasMarkdownIssue
    ? "\nRemove ALL Markdown emphasis markers such as *word* and **word**. They would be spoken literally, not interpreted as emphasis. Use the [emphasis] bracket cue placed directly before the word or phrase instead (e.g. \"[emphasis] really\", never \"*really*\") -- there is no closing tag in this schema, so never write [/emphasis]."
    : "";
  const prosodyGuidance = buildProsodyGuidance(issues);
  const interruptionGuidance = buildInterruptionGuidance(issues);
  const openingGuidance = buildOpeningStructureGuidance(issues);

  // When two or more of the specific corrections above are active at
  // once, fixing one must never read as permission to let another slide
  // -- exactly what happened when a word-count fix (1181 words) shipped
  // with prosody density still at 1.61/100 and no interruption pattern,
  // and again when a later run fixed length/prosody while the entire
  // opening block (both introductions + LinguABC mention) drifted to
  // 96.8-98.7% through the script.
  const activeCorrectionCount = [hasWordCountIssue, hasCefrIssue, hasMarkdownIssue, !!prosodyGuidance, !!interruptionGuidance, !!openingGuidance].filter(Boolean).length;
  const combinedGuidance =
    activeCorrectionCount > 1
      ? "\nThese issues must ALL be fixed together in the SAME rewrite. Fixing one (e.g. cutting word count) must never come at the expense of another (e.g. losing prosody cues, the interruption pattern, or the opening block's position) -- every specific instruction below applies simultaneously, not as alternatives."
      : "";

  return `\n\n===================== PREVIOUS ATTEMPT REJECTED =====================\nYour previous draft was rejected for these reasons:\n${bullets}\nRewrite the script and fix ALL listed issues.${combinedGuidance}${wordCountGuidance}${prosodyGuidance}${interruptionGuidance}${openingGuidance}${cefrGuidance}${markdownGuidance}`;
}

/**
 * Result of a single generateEnrichment() call: either it graded B2/C1/C2
 * (the script is done, and this IS the enrichment that will be published
 * -- never regenerated), or it graded B1 or below (a validation issue,
 * same shape every other check returns, so it feeds the existing retry
 * loop with no special-casing there).
 */
type EnrichmentGradingResult = { enrichment: EnrichmentResult } | { issues: ScriptValidationIssue[] };

/**
 * Runs the REAL, authoritative enrichment grading -- the exact same
 * generateEnrichment() (ai-processing.ts) call that used to run a SECOND
 * time, later, in dailyGenerate.ts, after Fish Audio synthesis, forced
 * alignment, and audio upload had already spent real money and compute.
 *
 * This replaces an earlier design (a separate, hand-written CEFR-only
 * precheck prompt) that was cheaper per retry attempt but could disagree
 * with the authoritative grader -- a real GitHub Actions run proved it:
 * the precheck passed a script the real generateEnrichment() call then
 * graded cefrLevelMin=B1/cefrLevelMax=B2, because the two prompts weren't
 * actually the same task (different framing, and CEFR was 2 of ~10
 * simultaneous fields in the authoritative call vs. the precheck's sole
 * focus). Calling the REAL function here, once per script-generation
 * attempt instead of once per whole pipeline run, makes that class of
 * disagreement architecturally impossible: there is exactly one CEFR
 * judgment, computed before any TTS spend, and it IS what gets published
 * -- not a hand-copied approximation of it.
 *
 * A miss here is still cheap to retry, bounded by generateEpisodeScript's
 * existing MAX_ATTEMPTS loop, same as any other validation failure.
 */
async function generateAndCheckEnrichment(
  output: ScriptGenerationOutput,
  request: ScriptGenerationRequest,
): Promise<EnrichmentGradingResult> {
  const readerText = buildReaderTranscript(toScriptLines(output, request))
    .map((segment) => `${segment.speaker}: ${segment.text}`)
    .join("\n");

  const enrichment = await generateEnrichment(output.title, readerText, "audio");

  if (!isApprovedLinguAbcCefrLevel(enrichment.cefrLevelMin) || !isApprovedLinguAbcCefrLevel(enrichment.cefrLevelMax)) {
    return {
      issues: [
        {
          message: `Authoritative enrichment graded this script as cefrLevelMin=${enrichment.cefrLevelMin}, cefrLevelMax=${enrichment.cefrLevelMax} -- LinguABC AI-generated podcasts must grade as B2, C1, or C2. This is the SAME grading publishing.ts's quality gate would apply to the published episode, run here instead of after Fish Audio spend. Requested level was ${request.cefrLevel}.`,
        },
      ],
    };
  }
  return { enrichment };
}

/**
 * Frames the previous attempt's raw JSON as an actual conversation turn to
 * revise, not a rewrite prompt. Fixes the root cause behind four straight
 * "prompt-only" iterations (833 words -> 1181 words+prosody/interruption ->
 * 1055 words+prosody/opening/interruption -> 1032 words+prosody): the retry
 * loop NEVER carried the previous draft forward -- only the validation
 * issue TEXT survived between attempts (see lastIssues below), while the
 * actual `output` object was discarded every time. Every "retry" was
 * therefore a full blind regeneration from the unchanged base prompt plus
 * an ever-growing feedback paragraph, asking the model to reconstruct an
 * entire ~950-word, multi-constraint conversation from nothing and
 * simultaneously hit every numeric/structural target at once -- exactly
 * the shape of failure observed (fixing word count would cost prosody
 * density, or vice versa, because nothing was actually being preserved
 * between attempts, only re-imagined).
 *
 * This preamble is followed, in the SAME user turn, by buildRetryFeedback()'s
 * existing (unchanged) issue list and per-category corrective guidance --
 * reused as-is rather than duplicated, since that content ("what's wrong,
 * how to fix it concretely") is equally valid whether the model is
 * rewriting from scratch or revising a specific draft. Only the framing
 * around it changes.
 */
export function buildRevisionPreamble(): string {
  return "The assistant message directly above is the EXACT script you wrote last time, as the same JSON structure you must return again. Do NOT discard it and write a new script from scratch -- REVISE that exact draft. Make the smallest possible targeted edits that fix every issue listed below, and leave every turn, line, joke, example, and structural element that was NOT flagged completely unchanged: same topic, same hook, same personalities, same wording wherever it already worked, same opening block and interruption if they already passed. You must still return the FULL script (every turn, not a diff or a summary of changes) -- but it should read as a lightly-edited version of your previous draft, not a different episode.";
}

/**
 * Shared word-counting formula -- byte-for-byte the same arithmetic
 * validateGeneratedScript() uses internally (strip [bracket] cues, split
 * on whitespace, count non-empty tokens), extracted here as a standalone
 * helper so the word-count correction pass and trajectory diagnostics
 * below can compute it without re-parsing it out of an issue message
 * string. validateGeneratedScript() itself is deliberately left untouched
 * and does NOT call this -- its own internal computation is unchanged.
 */
function countSpokenWords(output: ScriptGenerationOutput): number {
  return output.turns.reduce((sum, t) => sum + t.text.replace(/\[[^\]]*\]/g, " ").split(/\s+/).filter(Boolean).length, 0);
}

/**
 * How many dedicated correction calls a single word-count-overshoot-only
 * failure may spend before falling back to the normal multi-category
 * revision mechanism. Deliberately small and separate from MAX_ATTEMPTS --
 * this pass has exactly one job, so it either resolves quickly or it
 * doesn't; there is no reason to let it consume as many tries as the full
 * generation loop, and it must never become an unbounded loop of its own.
 */
const WORD_COUNT_CORRECTION_MAX_ATTEMPTS = 2;

/**
 * Reuses the SAME near-ceiling vs. large-overshoot classification and
 * numeric constants buildWordCountGuidance() uses (see its doc comment) --
 * no duplicated thresholds. A near-miss overshoot still only needs to
 * clear the ceiling with a small margin; a large overshoot still needs
 * the fuller cut toward the 935-950 sub-target.
 */
function wordCountCorrectionTarget(previousCount: number): { min: number; max: number } {
  const overshoot = previousCount - WORD_COUNT_HARD_MAX;
  if (overshoot > 0 && overshoot <= NEAR_CEILING_OVERSHOOT_LIMIT) {
    return { min: NEAR_CEILING_TARGET_MIN, max: NEAR_CEILING_TARGET_MAX };
  }
  return { min: WORD_COUNT_TARGET_MIN, max: WORD_COUNT_TARGET_MAX };
}

/**
 * A single, narrow, standalone user message -- deliberately NOT the full
 * multi-category buildRetryFeedback() text and NOT the assistant-turn
 * revision conversation shape. The whole point of this pass (see
 * runWordCountCorrection()'s doc comment) is a model call with exactly one
 * job and no other competing instructions to juggle, so it embeds the
 * current script directly rather than referencing an earlier turn, and
 * says nothing about prosody, opening structure, interruption, or CEFR
 * beyond "preserve wherever possible" -- softer than the main overshoot
 * guidance's "preserve ... exactly as they already are", because a cut
 * this size may genuinely require touching one of them, and getting the
 * word count right is this pass's one job, not a secondary goal.
 */
function buildWordCountCorrectionMessage(output: ScriptGenerationOutput, previousCount: number): string {
  const { min, max } = wordCountCorrectionTarget(previousCount);
  const cutMin = previousCount - max;
  const cutMax = previousCount - min;
  return `This is a DEDICATED WORD-COUNT CORRECTION pass, separate from normal script revision. Your ONLY job is to shorten the script below -- do not rewrite the episode, do not change the topic, and do not add any new content.

Current spoken word count: ${previousCount}. Required range: 920-965 words. Target for this correction: ${min}-${max} words.

CUT ONLY. Cut approximately ${cutMin}-${cutMax} spoken words from the EXISTING dialogue below by trimming sentences and phrases within turns -- do not just delete whole turns. Do NOT add replacement paragraphs or new content to compensate for what you cut. Preserve the meaning, the two speakers and their personalities, the opening block (the hook, both self-introductions, and the LinguABC mention), the interruption pair, the prosody cues, and the CEFR-level vocabulary and complexity wherever possible -- but making the word count correct is this pass's one job, so a cut of this size may require trimming some of these too if there is no other way to reach the range. Return the COMPLETE script as the same JSON structure (title, topic, topicTags, cefrLevel, turns) -- not a diff, not a partial script, not a summary of changes. Before returning, mentally recount the final spoken word total (excluding bracket prosody cues) and confirm it falls within 920-965.

Here is the exact script to shorten, as JSON:
${JSON.stringify(output)}`;
}

/** One successfully-parsed generation call's outcome, kept ONLY for the
 * word-count trajectory diagnostics below -- attemptNumber is a running
 * count of successfully-parsed calls across the WHOLE run (initial +
 * revision + word-count correction combined), separate from the outer
 * MAX_ATTEMPTS loop counter, since a correction pass can add extra
 * entries without consuming an outer attempt. issues is stored only to
 * be summarized into short category labels (see summarizeIssueCategories)
 * -- never rendered as raw text, since a few validateGeneratedScript
 * issue messages embed short snippets of the generated script itself
 * (e.g. the markdown/bracket/leaked-cue checks), which must never reach a
 * log or thrown error. */
interface WordCountTrajectoryEntry {
  attemptNumber: number;
  phase: "initial" | "revision" | "word-count correction";
  wordCount: number;
  issues: ScriptValidationIssue[];
}

/** Maps issues to short, fixed-vocabulary category labels ONLY --
 * deliberately never echoes issue.message itself, for the same
 * content-leak reason documented on WordCountTrajectoryEntry above. */
function summarizeIssueCategories(issues: ScriptValidationIssue[]): string {
  if (issues.length === 0) return "PASS";
  const categories = new Set<string>();
  for (const issue of issues) {
    const msg = issue.message;
    if (/word count/i.test(msg)) categories.add("word count");
    else if (/prosody/i.test(msg) || /cue is turn-initial/i.test(msg)) categories.add("prosody");
    else if (/turn count/i.test(msg)) categories.add("turn count");
    else if (/2\+ sentences/i.test(msg)) categories.add("turn structure");
    else if (/markdown/i.test(msg)) categories.add("markdown");
    else if (/bracket/i.test(msg)) categories.add("formatting");
    else if (/interruption/i.test(msg)) categories.add("interruption");
    else if (/introduction|hook|linguabc|opening/i.test(msg)) categories.add("opening");
    else if (/cefr|enrichment/i.test(msg)) categories.add("CEFR");
    else categories.add("other");
  }
  return [...categories].join(", ");
}

/** Renders the trajectory as compact, content-free lines, e.g.:
 *   attempt 1 [initial]: 1180 words -- word count, prosody
 *   attempt 2 [revision]: 1172 words -- word count
 *   attempt 3 [word-count correction]: 951 words -- PASS
 * Appended to generateEpisodeScript()'s two final-failure throws so a
 * real GitHub Actions failure shows the whole run's shape, not just the
 * last attempt. */
function formatTrajectory(trajectory: WordCountTrajectoryEntry[]): string {
  return trajectory
    .map((entry) => `attempt ${entry.attemptNumber} [${entry.phase}]: ${entry.wordCount} words -- ${summarizeIssueCategories(entry.issues)}`)
    .join("\n");
}

interface WordCountCorrectionOutcome {
  output: ScriptGenerationOutput;
  issues: ScriptValidationIssue[];
  entries: WordCountTrajectoryEntry[];
}

/**
 * The dedicated, narrow correction pass this fix adds. Triggered ONLY
 * when a successfully-parsed attempt's structural validation failed for
 * EXACTLY one reason -- word count over the 965 hard ceiling -- so this
 * call never has to juggle prosody/opening/interruption/CEFR feedback at
 * the same time buildRetryFeedback()'s full multi-category prompt would.
 *
 * Addresses the real 1180-word failure this fix was built for: asking the
 * SAME multi-constraint revision prompt ("lightly-edited... nothing else
 * changes" alongside "cut 230+ words" alongside preserving four other
 * categories "exactly as they already are") to make a large cut is a
 * genuine tension -- see the investigation this fix implements. This pass
 * removes that tension for the specific case it's narrow enough to solve:
 * a single user message, the current script embedded directly, one job
 * (cut to range), phrased with "preserve wherever possible" instead of
 * "preserve exactly", and nothing else competing for the model's edits.
 *
 * Bounded by WORD_COUNT_CORRECTION_MAX_ATTEMPTS, reusing generateStructuredJson()
 * (never a duplicate implementation) and validateGeneratedScript() (never
 * weakened or reimplemented) on each sub-attempt. Stops early once a
 * sub-attempt's word count is back in range, even if another issue
 * remains -- that remaining issue is exactly what the normal revision
 * mechanism the caller falls back to already exists to handle (see test
 * "E" in the corresponding test file). A sub-attempt that fails to parse
 * simply consumes one of the bounded tries and is not retried with
 * different framing, matching generateStructuredJson()'s own "fails
 * closed, not retried" posture for a wrong-shape response.
 *
 * If every sub-attempt is spent without clearing the word-count issue,
 * this returns the LAST attempt's (still-imperfect but likely closer)
 * output/issues -- the caller's normal MAX_ATTEMPTS loop then picks that
 * up as the new previousOutput/lastIssues for its next revision attempt,
 * exactly the same "fall back honestly" path a plain validation failure
 * already takes. Nothing here fabricates, deletes, or post-processes
 * generated text in code -- every edit is still produced by the model.
 */
async function runWordCountCorrection(
  output: ScriptGenerationOutput,
  previousCount: number,
  request: ScriptGenerationRequest,
  startingAttemptNumber: number,
): Promise<WordCountCorrectionOutcome> {
  const entries: WordCountTrajectoryEntry[] = [];
  let currentOutput = output;
  let currentCount = previousCount;
  let currentIssues: ScriptValidationIssue[] = [
    { message: `Word count ${previousCount} is outside the acceptable 920-965 range.` },
  ];

  for (let i = 0; i < WORD_COUNT_CORRECTION_MAX_ATTEMPTS; i++) {
    let corrected: ScriptGenerationOutput;
    try {
      corrected = await generateStructuredJson({
        messages: [{ role: "user", content: buildWordCountCorrectionMessage(currentOutput, currentCount) }],
        schema: ScriptGenerationOutputSchema,
        schemaName: "linguabc_podcast_script_word_count_correction",
        retryPolicy: BATCH_RETRY_POLICY,
        temperature: 0.9,
        maxTokens: SCRIPT_JSON_MAX_TOKENS,
      });
    } catch {
      continue;
    }

    const wordCount = countSpokenWords(corrected);
    const issues = validateGeneratedScript(corrected, request);
    currentOutput = corrected;
    currentCount = wordCount;
    currentIssues = issues;
    entries.push({ attemptNumber: startingAttemptNumber + entries.length, phase: "word-count correction", wordCount, issues });

    const stillWordCountIssue = issues.some((issue) => WORD_COUNT_ISSUE_RE.test(issue.message));
    if (!stillWordCountIssue) break;
  }

  return { output: currentOutput, issues: currentIssues, entries };
}

/** Generates and validates in a loop, bounded by MAX_ATTEMPTS. Throws
 * (never returns a script that failed validation) if every attempt fails
 * -- the caller must treat that as a failed generation, not publish
 * whatever the last attempt produced. A passing script has cleared BOTH
 * the structural checks (validateGeneratedScript) AND the REAL, authoritative
 * generateEnrichment() grading (generateAndCheckEnrichment) -- not just the
 * model's own self-reported level -- so the returned enrichment honestly
 * reflects content that has already been judged B2+, not merely labeled
 * that way, and is the SAME object the caller must publish, never re-graded.
 *
 * Attempt 1 is unchanged: a single clean user message, no history. Attempts
 * 2-6, when a previous draft actually parsed (previousOutput is set), send
 * a real 3-turn conversation instead of one ever-growing prompt string:
 * the original instructions, the model's own previous JSON answer as a
 * genuine assistant turn, then a revision instruction referencing it --
 * see buildRevisionPreamble()'s doc comment for why. If no draft has ever
 * successfully parsed yet (e.g. every attempt so far threw on malformed
 * JSON), there is nothing to revise, so that attempt falls back to the
 * same single-message full-generation shape attempt 1 uses. */
export async function generateEpisodeScript(request: ScriptGenerationRequest): Promise<ScriptGenerationResult> {
  const basePrompt = buildPrompt(request);
  let lastIssues: ScriptValidationIssue[] = [];
  let previousOutput: ScriptGenerationOutput | undefined;
  // Tracks the shape of the LAST attempt made, purely for the diagnostic
  // tag on the two throws below -- never fed back into lastIssues or
  // buildRetryFeedback(), so it cannot change what the model sees.
  let lastAttemptWasRevision = false;
  // Word-count trajectory across the WHOLE run (initial + revision +
  // word-count correction, in the order they actually happened) -- see
  // WordCountTrajectoryEntry's doc comment. Purely diagnostic: read by
  // formatTrajectory() for the two final-failure throws below, never fed
  // back into lastIssues or buildRetryFeedback().
  const trajectory: WordCountTrajectoryEntry[] = [];

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    // Whether THIS attempt used the single-message full-generation shape
    // or the 3-turn revision conversation -- decided by whether any prior
    // attempt has ever successfully parsed, exactly like the messages
    // ternary below. Captured before messages are built so it still
    // reflects this attempt even if generateStructuredJson throws.
    const isRevisionAttempt = previousOutput !== undefined;
    lastAttemptWasRevision = isRevisionAttempt;

    const messages: AIProviderMessage[] = isRevisionAttempt
      ? [
          { role: "user", content: basePrompt },
          { role: "assistant", content: JSON.stringify(previousOutput) },
          { role: "user", content: `${buildRevisionPreamble()}${buildRetryFeedback(lastIssues)}` },
        ]
      : [{ role: "user", content: basePrompt }];

    let output: ScriptGenerationOutput;
    try {
      output = await generateStructuredJson({
        messages,
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
      // previousOutput is deliberately left untouched here -- there is no
      // new draft to revise from a throw, so the NEXT attempt should still
      // revise the last successfully-parsed one, if any, rather than lose it.
      lastIssues = [{ message: error instanceof Error ? error.message : String(error) }];
      if (attempt === MAX_ATTEMPTS) {
        // The attempt number and shape are appended to the thrown message
        // ONLY -- never folded into lastIssues, so buildRetryFeedback()'s
        // model-facing text is completely unaffected. This is what makes
        // it possible to tell, from a real GitHub Actions failure alone,
        // whether every attempt failed to parse (isRevisionAttempt false
        // even on attempt 6 -- no draft ever successfully parsed) or
        // whether earlier attempts drafted fine and only a later revision
        // attempt broke (isRevisionAttempt true) -- see this function's
        // own doc comment and generate-structured-json.ts's parse-error
        // diagnostics for the investigation this closes the gap on.
        throw new Error(
          `Script generation failed after ${MAX_ATTEMPTS} attempts (final failure: attempt ${attempt}/${MAX_ATTEMPTS}, ${isRevisionAttempt ? "revision" : "initial single-message"} generation): ${lastIssues.map((i) => i.message).join("; ")}${trajectory.length > 0 ? `\n\nWord-count trajectory:\n${formatTrajectory(trajectory)}` : ""}`,
        );
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

    previousOutput = output;

    let structuralIssues = validateGeneratedScript(output, request);
    // attemptOutput is the script THIS attempt ultimately produces --
    // either `output` as-is, or a word-count-corrected replacement below.
    // Kept separate from `output` so the correction pass never has to
    // mutate the variable the catch block above already closed over.
    let attemptOutput = output;
    trajectory.push({
      attemptNumber: trajectory.length + 1,
      phase: isRevisionAttempt ? "revision" : "initial",
      wordCount: countSpokenWords(output),
      issues: structuralIssues,
    });

    // Word-count-overshoot-only failures get a dedicated, narrow
    // correction pass BEFORE falling through to the normal multi-category
    // revision mechanism below -- see runWordCountCorrection()'s doc
    // comment for why. Undershoot (too few words) and any failure that
    // co-occurs with another issue are deliberately left to the existing
    // revision mechanism, unchanged -- this pass has exactly one job.
    if (structuralIssues.length === 1 && WORD_COUNT_ISSUE_RE.test(structuralIssues[0].message)) {
      const previousCount = countSpokenWords(output);
      if (previousCount > WORD_COUNT_HARD_MAX) {
        const correction = await runWordCountCorrection(output, previousCount, request, trajectory.length + 1);
        trajectory.push(...correction.entries);
        attemptOutput = correction.output;
        structuralIssues = correction.issues;
        // If the corrected draft still needs another revision pass, the
        // NEXT outer attempt must revise the corrected draft, not the
        // original overshoot -- same reasoning as previousOutput = output
        // above.
        previousOutput = correction.output;
      }
    }

    // The real enrichment grading only runs once the structural checks
    // already passed -- a script that's already going to be rejected for
    // e.g. word count or missing interruption pattern doesn't need a
    // second paid LLM call (generateEnrichment produces vocabulary/quiz/
    // summary/etc. too, not just the CEFR fields) to also grade it.
    let issues = structuralIssues;
    let enrichment: EnrichmentResult | undefined;
    if (structuralIssues.length === 0) {
      try {
        const graded = await generateAndCheckEnrichment(attemptOutput, request);
        if ("enrichment" in graded) {
          enrichment = graded.enrichment;
        } else {
          issues = graded.issues;
        }
      } catch (error) {
        issues = [{ message: `Enrichment/CEFR grading failed: ${error instanceof Error ? error.message : String(error)}` }];
      }
    }

    if (issues.length === 0 && enrichment) {
      const wordCount = countSpokenWords(attemptOutput);
      return { output: attemptOutput, wordCount, attempts: attempt, openingStructure: checkOpeningStructure(attemptOutput, request), enrichment };
    }
    lastIssues = issues;
  }

  throw new Error(
    `Script generation failed validation after ${MAX_ATTEMPTS} attempts (final failure: attempt ${MAX_ATTEMPTS}/${MAX_ATTEMPTS}, ${lastAttemptWasRevision ? "revision" : "initial single-message"} generation): ${lastIssues.map((i) => i.message).join("; ")}\n\nWord-count trajectory:\n${formatTrajectory(trajectory)}`,
  );
}

/** Converts the model's structured turns into the ScriptLine[] shape the
 * existing pipeline (fishAudio.ts, transcript.ts, alignment.ts) already
 * consumes -- no parallel script representation. */
export function toScriptLines(output: ScriptGenerationOutput, request: ScriptGenerationRequest): ScriptLine[] {
  const names: [SpeakerName, SpeakerName] = [request.speaker0Name, request.speaker1Name];
  return output.turns.map((turn) => [names[turn.speaker], turn.text] as ScriptLine);
}
