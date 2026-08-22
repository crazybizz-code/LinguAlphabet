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
 *
 * CEFR guidance word-count-preservation constraint (see buildCefrGuidance()
 * below): closes a DIFFERENT kind of gap than the ones above -- not a
 * missing category, but two existing, individually-correct mechanisms
 * (word-count correction and CEFR-grading retry) undoing each other. A
 * real diagnostic run showed a script pass structural validation at 964
 * words, fail ONLY the authoritative CEFR grading, then get rewritten by
 * the (previously length-unaware) CEFR guidance into a 1269-word draft --
 * erasing several attempts' worth of word-count-correction progress in one
 * step and causing the whole run to exhaust MAX_ATTEMPTS still over the
 * ceiling. buildCefrGuidance() now tells the model explicitly not to let
 * that happen, but only when the previous draft's word count was already
 * inside or close to 920-965 -- see its own doc comment.
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
 * Mirrors validateGeneratedScript()'s own 920 floor literal, exactly like
 * WORD_COUNT_HARD_MAX mirrors its 965 ceiling above -- used only to decide
 * whether buildCefrGuidance()'s word-count-preservation constraint should
 * fire, never wired to the actual validation gate.
 */
const WORD_COUNT_HARD_MIN = 920;

/**
 * How close to the 920-965 range a previous draft's word count must be
 * before buildCefrGuidance() adds its word-count-preservation constraint.
 * See that function's doc comment for why this exists. 40 comfortably
 * covers the exact real case this fix was built for -- a script that had
 * ALREADY cleared structural validation, including word count, before
 * failing ONLY the authoritative CEFR grading (meaning its word count was,
 * by construction, already inside 920-965 at that point) -- while also
 * covering a script that's merely close (e.g. it failed word count by a
 * small margin at the same time its CEFR self-report was wrong), where the
 * same "don't let raising sophistication add length" caution still
 * usefully applies.
 */
const CEFR_GUIDANCE_NEAR_RANGE_MARGIN = 40;

function isInOrNearWordCountRange(wordCount: number | undefined): boolean {
  if (wordCount === undefined) return false;
  return wordCount >= WORD_COUNT_HARD_MIN - CEFR_GUIDANCE_NEAR_RANGE_MARGIN && wordCount <= WORD_COUNT_HARD_MAX + CEFR_GUIDANCE_NEAR_RANGE_MARGIN;
}

/**
 * Shared "how to cut" instruction, reused by both the outer-revision
 * large-overshoot guidance (buildWordCountGuidance below) and the
 * dedicated word-count-correction message (buildWordCountCorrectionMessage
 * further down) -- the two places a word-count cut is ever requested.
 *
 * Root cause this fixes: a real diagnostic run captured the FULL script
 * text at every attempt of a real 6-attempt failure and diffed them. Every
 * single cut across the whole run -- large and small alike -- was a
 * cosmetic word/phrase trim ("at the time" removed, "completely" removed,
 * "or anything" removed); zero turns or sentences were ever deleted, even
 * when 100-300+ words still needed removing. The single longest turn in
 * the script (a ~110-word personal anecdote, explicitly one OPTIONAL
 * conversational feature per the base prompt, not a mandated element)
 * survived completely untouched through all 15 real drafts, including the
 * final failing one. The old instruction ("trim sentences and phrases
 * within turns, don't just delete whole turns") is reasonable advice for a
 * SMALL cut, but for a large one it reliably produced repeated 5-15 word
 * cosmetic trims that never closed the gap, no matter how many times the
 * same request was retried.
 *
 * For a genuinely large cut (see NEAR_CEILING_OVERSHOOT_LIMIT for the
 * exact boundary, reused unchanged from the pre-existing near-miss
 * classification), the model is now told directly to find and
 * substantially shorten or remove ONE existing non-essential turn -- a
 * personal example, story, extended explanation, or aside, explicitly
 * NEVER the hook, introductions, LinguABC mention, or interruption pair --
 * then use smaller trims only for the remainder. A small cut (near-ceiling
 * overshoot, or the undershoot/add-words path elsewhere, both untouched by
 * this fix) keeps the original phrase-trim-only instruction, which already
 * works fine at that size and does not need a whole turn removed.
 */
function buildCutMethodGuidance(isLargeCut: boolean): string {
  return isLargeCut
    ? "This cut is TOO LARGE to reach through word- and phrase-level trims alone -- that approach has repeatedly produced cuts of only 5-15 words per attempt in real generations, far short of what a cut this size requires, no matter how many times it is retried. Instead: find the SINGLE longest turn in the script that is a personal example, story, extended explanation, or other non-essential aside (never the hook, the self-introductions, the LinguABC mention, or the interruption pair) and cut it substantially -- remove at least half of it, or cut it entirely if the conversation still flows naturally without it. That one structural cut should account for a large share of the total; use smaller word- and phrase-level trims elsewhere in the script only for the remainder."
    : "Trim sentences and phrases within turns, don't just delete whole turns -- a cut this small does not require it.";
}

/** A single turn, deterministically identified as the safe target for a
 * large cut -- see selectLargeCutTarget()'s doc comment. */
export interface LargeCutTarget {
  turnIndex: number;
  speakerName: SpeakerName;
  text: string;
  wordCount: number;
}

/**
 * DETERMINISTIC LARGE-CUT TARGET SELECTION (word-count convergence fix,
 * correction pass only -- see buildDeterministicLargeCutInstruction()'s
 * call site in buildWordCountCorrectionMessage()).
 *
 * Root cause this fixes: a real diagnostic run captured every message sent
 * during a large-cut failure and confirmed the classification, cut-range
 * arithmetic, and instruction text were all correct -- the model was
 * explicitly, repeatedly told to "find the SINGLE longest turn... that is
 * a personal example, story, extended explanation, or other non-essential
 * aside" and cut it substantially. It never reliably did. The one real
 * edit in that entire run trimmed a single sentence off an unrelated turn,
 * not the longest eligible one; two genuinely eligible candidate turns
 * (including one with zero structural protection) went untouched across
 * 12 consecutive attempts. The instruction's WEAKEST link was never the
 * cut size or the "don't just trim words" framing -- it was asking the
 * model to perform an open-ended SEARCH ("find the single longest turn
 * that is...") over the whole script as a discrete step, every single
 * retry, with no state carried over from prior failed searches.
 *
 * This function removes that search from the model's job entirely and
 * replaces it with the same kind of deterministic, position-based logic
 * this file ALREADY uses for structural checks -- it does not invent a new
 * classification mechanism (no LLM call, no keyword/topic classifier).
 * "Eligible" is defined negatively, by REUSING existing structural signals
 * unmodified: reuses checkOpeningStructure() (already exported, already
 * the authoritative source for where the hook, both self-introductions,
 * and the LinguABC mention land) for the opening-block indices, and
 * reuses the SAME em-dash regexes validateGeneratedScript()'s own
 * interruption check already uses (copied here only because that function
 * returns a boolean, not indices -- the regex definitions themselves are
 * not duplicated logic, they are the single existing definition of "what
 * counts as an interruption dash" reapplied to find WHICH turns matched).
 * The final turn is also excluded as a conservative closing/sign-off
 * margin: the correction contract does not name a separate "closing" item
 * the way it names the opening block, but removing the episode's only
 * sign-off turn entirely would still contradict the base prompt's ENDING
 * section, and excluding one additional turn costs nothing in a
 * typically 16-100-turn script.
 *
 * Among every turn NOT in that protected set, the LONGEST one (by the
 * same countSpokenWords() word-counting formula used everywhere else in
 * this file) is returned as the designated target -- ties broken by
 * earliest turnIndex, for determinism. A longer turn is not a proof of
 * being "a personal example/story/aside" (there is no such semantic
 * label in the schema, and requirement 5 of this fix explicitly forbids
 * adding an LLM classifier just to create one), but it is the same,
 * already-observed real-world correlation the original prompt text itself
 * relied on ("find the SINGLE LONGEST turn that is...") -- this function
 * computes the "longest" half of that instruction exactly and
 * deterministically; the model is still the one performing the actual
 * rewrite, and still receives the same "personal example/story/aside"
 * framing as context for HOW to shorten the designated turn, not for
 * WHICH turn to pick.
 *
 * Returns null when no eligible turn exists (e.g., a very short or
 * unusually heavily-protected script) -- callers MUST fall back to the
 * existing, unmodified buildCutMethodGuidance(true) text in that case
 * rather than inventing a fallback target (see
 * buildDeterministicLargeCutInstruction()).
 */
export function selectLargeCutTarget(output: ScriptGenerationOutput, request: ScriptGenerationRequest): LargeCutTarget | null {
  const protectedIndices = new Set<number>();
  if (output.turns.length > 0) protectedIndices.add(0); // the hook
  protectedIndices.add(output.turns.length - 1); // conservative closing/sign-off margin -- see doc comment

  const opening = checkOpeningStructure(output, request);
  if (opening.speaker0IntroPosition) protectedIndices.add(opening.speaker0IntroPosition.turnIndex);
  if (opening.speaker1IntroPosition) protectedIndices.add(opening.speaker1IntroPosition.turnIndex);
  if (opening.linguabcPosition) protectedIndices.add(opening.linguabcPosition.turnIndex);

  // Same em-dash definitions validateGeneratedScript()'s own interruption
  // check uses -- reapplied here to recover WHICH turn indices matched,
  // since that function only returns whether a match exists anywhere.
  const endsWithDash = (t: string) => /[—-]\s*$/.test(t.trim());
  const startsWithDash = (t: string) => /^\s*[—-]/.test(t.trim());
  for (let i = 1; i < output.turns.length; i++) {
    if (endsWithDash(output.turns[i - 1].text) && startsWithDash(output.turns[i].text)) {
      protectedIndices.add(i - 1);
      protectedIndices.add(i);
    }
  }

  let best: LargeCutTarget | null = null;
  for (let i = 0; i < output.turns.length; i++) {
    if (protectedIndices.has(i)) continue;
    const turn = output.turns[i];
    const wordCount = turn.text.replace(/\[[^\]]*\]/g, " ").split(/\s+/).filter(Boolean).length;
    if (!best || wordCount > best.wordCount) {
      best = { turnIndex: i, speakerName: turn.speaker === 0 ? request.speaker0Name : request.speaker1Name, text: turn.text, wordCount };
    }
  }
  return best;
}

/**
 * Truncates a turn's text for display in the correction prompt without
 * cutting in the middle of a bracket prosody cue (e.g. "...[emph" instead
 * of "...[emphasis]") -- a plain slice(0, maxLen) can land inside a "[...]"
 * pair, showing the model a visibly malformed preview. If the naive cut
 * point falls inside an unclosed bracket, backs up to just before that
 * bracket instead.
 */
function truncatePreview(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  let cut = text.slice(0, maxLen);
  const lastOpen = cut.lastIndexOf("[");
  const lastClose = cut.lastIndexOf("]");
  if (lastOpen > lastClose) cut = cut.slice(0, lastOpen);
  return `${cut.trimEnd()}...`;
}

/**
 * Builds the large-cut instruction text using the deterministic target
 * selectLargeCutTarget() found, if any. When a target exists, the model is
 * told EXACTLY which turn to cut -- no search required -- but still
 * performs the actual rewrite (shorten substantially, or remove it
 * entirely), and still receives the same content-type framing (personal
 * example/story/aside) as guidance for HOW to edit it. When no eligible
 * target exists, falls back to the ORIGINAL, unmodified
 * buildCutMethodGuidance(true) text -- existing behavior preserved exactly,
 * per this fix's explicit "do not invent a fallback target" requirement.
 */
function buildDeterministicLargeCutInstruction(target: LargeCutTarget | null): string {
  if (!target) return buildCutMethodGuidance(true);
  const preview = truncatePreview(target.text, 140);
  return `The cut target has ALREADY BEEN IDENTIFIED for you -- you do not need to search the script for it. Turn #${target.turnIndex} (${target.speakerName}, ${target.wordCount} words) is the designated cut target: "${preview}" This is the kind of content (a personal example, story, extended explanation, or non-essential aside) that this cut should come from. Substantially shorten this turn -- remove at least half of it -- or remove it entirely if the conversation still flows naturally without it. Do not select a different turn instead. That one structural cut should account for a large share of the total; use smaller word- and phrase-level trims elsewhere in the script only for the remainder.`;
}

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
 * guidance is untouched by this or either prior fix. Both branches now
 * route their "how to cut" sentence through buildCutMethodGuidance() above
 * instead of a hardcoded phrase-trim-only instruction -- see its doc
 * comment for why.
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
      return `\nPrevious draft: ${previousCount} words. Required: 920-965, hard maximum 965 -- this draft already exceeds it, but only by ${overshoot} word(s), so a full cut down to 935-950 is unnecessary. Do NOT rewrite or expand the draft. This is a CUT operation, not a generation target: the revised draft MUST be SHORTER than the previous ${previousCount}-word draft. Cut approximately ${cutMin}-${cutMax} spoken words from the EXISTING dialogue. ${buildCutMethodGuidance(false)} Do not add replacement paragraphs or new content to compensate for what you cut. Preserve the existing opening block, interruption, prosody cues, and CEFR-level content exactly as they already are -- only cut. Target ${NEAR_CEILING_TARGET_MIN}-${NEAR_CEILING_TARGET_MAX} words total, safely under the 965 hard maximum with a small margin -- you do NOT need to reach all the way down to 935-950. Before returning your answer, mentally recount the final spoken word total (excluding bracket cues) -- if it is still above 965, cut more.`;
    }
    const cutMin = previousCount - WORD_COUNT_TARGET_MAX;
    const cutMax = previousCount - WORD_COUNT_TARGET_MIN;
    return `\nPrevious draft: ${previousCount} words. Required: 920-965, hard maximum 965 -- this draft already exceeds it. Do NOT rewrite or expand the draft. This is a CUT operation, not a generation target: the revised draft MUST be SHORTER than the previous ${previousCount}-word draft. Cut approximately ${cutMin}-${cutMax} spoken words from the EXISTING dialogue. ${buildCutMethodGuidance(true)} Do not add replacement paragraphs or new content to compensate for what you cut. Preserve the existing opening block, interruption, prosody cues, and CEFR-level content exactly as they already are -- only cut. Target 935-950 words total, and it MUST NOT exceed 965. Before returning your answer, mentally recount the final spoken word total (excluding bracket cues) -- if it is still above 965, cut more.`;
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

/**
 * Builds the CEFR-grading-specific retry line. The base guidance (raise
 * vocabulary sophistication, use real subordinate-clause structures,
 * discuss a more complex angle) is unchanged from before this fix.
 *
 * WORD-COUNT-PRESERVATION CONSTRAINT (added by this fix): a real
 * diagnostic run showed that when a script had ALREADY cleared structural
 * validation -- including landing inside 920-965 -- and then failed ONLY
 * the authoritative CEFR grading, the base guidance below (with no length
 * constraint attached) reliably produced a MUCH longer draft: a real run
 * went 964 words -> 1269 words in a single rewrite, wiping out several
 * attempts' worth of word-count-correction progress and causing the whole
 * run to fail after MAX_ATTEMPTS that would otherwise have published. The
 * model was satisfying "more sophisticated" by adding hedges, subordinate
 * clauses, and formal near-synonyms of already-adequate phrasing -- length
 * as a side effect, never a constraint it was asked to respect DURING that
 * specific rewrite.
 *
 * Deliberately narrow: fires only when the PREVIOUS draft's word count
 * (passed in by the caller, computed from the real previous output --
 * never guessed) is already inside or close to 920-965, per
 * isInOrNearWordCountRange(). A draft that's still far from the range
 * (e.g. a fresh 1113-word initial attempt that also has a CEFR self-report
 * mismatch) keeps the original, unconstrained guidance -- forcing a length
 * constraint onto a draft that isn't close yet would just recreate the
 * exact tension runWordCountCorrection() already exists to avoid.
 */
function buildCefrGuidance(previousWordCount?: number): string {
  const base =
    "\nFor the CEFR level specifically: this draft was independently graded BELOW the required B2+ standard by the same authoritative grading the published episode will be checked against -- this is not a labeling mistake, the actual vocabulary and sentence complexity were too simple. Raise vocabulary sophistication, use real conditional/subordinate-clause sentence structures throughout (not just when convenient), and discuss a genuinely complex or abstract angle of the topic instead of a simple personal anecdote. Genuinely rewrite the language -- do not just relabel the same simple script or change the self-reported level field.";

  if (!isInOrNearWordCountRange(previousWordCount)) return base;

  return `${base} This draft's word count (${previousWordCount}) is already inside or close to the required 920-965 range -- the rewrite above must NOT be allowed to push it back out. Improve CEFR sophistication through vocabulary CHOICE and sentence-level syntax variety, NOT by adding length: do not add new content, new turns, new examples, or new explanations. If a rewritten sentence becomes longer because it now uses a genuinely more sophisticated structure, cut an equivalent number of words elsewhere in the SAME revision to compensate. Preserve the existing script's structure and meaning -- this is still the same episode, only its language is being upgraded. Treat the 920-965 word count as a HARD constraint during this CEFR revision, exactly as strict as the CEFR requirement itself, not a secondary concern to fix on a later attempt.`;
}

export function buildRetryFeedback(issues: ScriptValidationIssue[], previousWordCount?: number): string {
  const bullets = issues.map((issue) => `- ${issue.message}`).join("\n");
  const hasWordCountIssue = issues.some((issue) => /word count/i.test(issue.message));
  const hasCefrIssue = issues.some((issue) => /cefr/i.test(issue.message));
  const hasMarkdownIssue = issues.some((issue) => /markdown/i.test(issue.message));
  const wordCountGuidance = hasWordCountIssue ? buildWordCountGuidance(issues) : "";
  // A PURE CEFR mismatch already gets its own dedicated, self-contained
  // preamble (buildCefrOnlyRevisionPreamble(), selected by the caller via
  // isPureCefrMismatch()) -- this generic block must NOT also be appended
  // in that case (Fix #7's root-cause finding): buildCefrGuidance()'s base
  // text says to "discuss a genuinely complex or abstract angle of the
  // topic instead of a simple personal anecdote," which directly
  // contradicts the dedicated preamble's "preserve the facts, topic,
  // meaning... do NOT add any new facts, examples, explanations... content
  // of any kind" -- a real, reproduced 952->989-word CEFR-only revision
  // received BOTH blocks stacked in the same message. Every OTHER CEFR
  // scenario (combined with word count, opening, etc. -- i.e. NOT a pure
  // mismatch) keeps this exactly as before; isPureCefrMismatch() itself is
  // untouched.
  const cefrGuidance = hasCefrIssue && !isPureCefrMismatch(issues) ? buildCefrGuidance(previousWordCount) : "";
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
 *
 * largeCutNeeded (word-count-convergence fix): this preamble's own "leave
 * every turn, line, joke, example... completely unchanged" framing
 * directly fights buildCutMethodGuidance()'s large-cut instruction below
 * it in the SAME message -- a real diagnostic run showed exactly this
 * combination reach the outer revision path (a 1094-word initial draft
 * with multiple issues went to "revision" carrying a word-count issue
 * requiring a 130+ word cut) and produce only an 8-10 word cosmetic trim,
 * the same failure buildCutMethodGuidance() exists to fix. When the
 * previous attempt's issues include a large word-count overshoot (see
 * NEAR_CEILING_OVERSHOOT_LIMIT), an explicit exception is appended stating
 * that substantially shortening or removing the ONE turn identified in the
 * word-count guidance is REQUIRED here, not a violation of "smallest
 * possible targeted edits" -- every other unflagged element still must
 * stay unchanged. Defaults to false, so every existing caller/test that
 * calls this with no argument gets byte-identical output to before this
 * fix; a small or near-ceiling cut, or any other issue category alone,
 * never triggers it.
 */
export function buildRevisionPreamble(largeCutNeeded: boolean = false): string {
  const base =
    "The assistant message directly above is the EXACT script you wrote last time, as the same JSON structure you must return again. Do NOT discard it and write a new script from scratch -- REVISE that exact draft. Make the smallest possible targeted edits that fix every issue listed below, and leave every turn, line, joke, example, and structural element that was NOT flagged completely unchanged: same topic, same hook, same personalities, same wording wherever it already worked, same opening block and interruption if they already passed. You must still return the FULL script (every turn, not a diff or a summary of changes) -- but it should read as a lightly-edited version of your previous draft, not a different episode.";

  if (!largeCutNeeded) return base;

  return `${base} EXCEPTION for this revision: the word-count issue below requires a LARGE cut that "leave every example unchanged" cannot satisfy on its own. For the ONE turn identified in the word-count guidance below (a personal example, story, extended explanation, or aside), substantially shortening or removing it is REQUIRED here -- that is not a violation of "smallest possible targeted edits," it is what this specific revision needs. Every other unflagged turn, line, and structural element -- including the opening block and interruption if they already passed -- must still stay unchanged.`;
}

/**
 * Decides buildRevisionPreamble()'s largeCutNeeded argument: true whenever
 * ANY issue in the previous attempt's list is a word-count overshoot past
 * NEAR_CEILING_OVERSHOOT_LIMIT -- regardless of what else co-occurs with
 * it, since the preamble conflict this exists to avoid applies equally
 * whether the large cut is the only issue or one of several. Reuses the
 * same regex and threshold buildWordCountGuidance() and
 * buildWordCountCorrectionMessage() already use, never a second copy of
 * the classification logic.
 */
function isLargeWordCountCutNeeded(issues: ScriptValidationIssue[]): boolean {
  const match = issues.map((issue) => issue.message.match(WORD_COUNT_ISSUE_RE)).find((m): m is RegExpMatchArray => m !== null);
  if (!match) return false;
  const previousCount = Number(match[1]);
  return previousCount - WORD_COUNT_HARD_MAX > NEAR_CEILING_OVERSHOOT_LIMIT;
}

/**
 * True when CEFR mismatch is the ONLY issue in the previous attempt's
 * list -- covers both shapes buildRetryFeedback()'s hasCefrIssue already
 * treats identically: the authoritative-grading failure
 * (generateAndCheckEnrichment, always exactly one issue on its own, since
 * enrichment only runs once structural validation is already clean) and
 * the rarer structural self-report mismatch (validateGeneratedScript's own
 * "Requested CEFR level X but the model self-reported Y" check, which CAN
 * co-occur with other structural issues like word count). Deliberately
 * `issues.length === 1`, not just "contains a CEFR issue" -- see
 * buildCefrOnlyRevisionPreamble()'s doc comment for why a pure mismatch
 * needs fundamentally different framing than a combined failure, where the
 * existing word-count/other-category machinery must keep handling things
 * exactly as it already does.
 */
function isPureCefrMismatch(issues: ScriptValidationIssue[]): boolean {
  return issues.length === 1 && /cefr/i.test(issues[0].message);
}

/**
 * Dedicated preamble for a PURE CEFR mismatch revision -- used INSTEAD of
 * buildRevisionPreamble() only when isPureCefrMismatch() is true, never
 * composed with it. Root cause this fixes: a real diagnostic run captured
 * the exact message sent for this scenario and found a direct, live
 * contradiction inside it -- buildRevisionPreamble()'s own "leave every
 * turn, line, joke, example, and structural element that was NOT flagged
 * completely unchanged... same wording wherever it already worked"
 * sitting immediately next to buildCefrGuidance()'s "Genuinely rewrite the
 * language -- do not just relabel the same simple script." A CEFR
 * mismatch is a GLOBAL property of the text (there is no per-turn "CEFR
 * flag" the way there is for a specific prosody or interruption issue), so
 * satisfying it legitimately requires touching most sentences' wording --
 * exactly what the minimal-edit preamble tells the model not to do. The
 * real observed result: a 960-word passing draft, failing ONLY CEFR
 * grading, revised into a 994-word draft where nearly every turn was
 * rewritten with more Latinate/nominalized vocabulary for the SAME ideas
 * ("asking for forgiveness" -> "an appeal for forbearance"; "Something
 * like, 'How can I make this right?'" -> "Something along the lines of,
 * 'How might I endeavor to ameliorate this?'") -- no new content anywhere,
 * just systematically less word-efficient phrasing, net +34 words.
 *
 * This preamble resolves the contradiction by removing it rather than by
 * telling the model to ignore one side or the other: wording is
 * explicitly UNPROTECTED (the opposite of buildRevisionPreamble()'s
 * stance) so there is nothing left to contradict "genuinely rewrite the
 * language," while CONTENT (facts, topic, meaning, structure,
 * personalities, examples) and the 920-965 word count are both explicitly
 * protected instead -- reframing the whole task as substitution/
 * compression, never expansion, and naming the exact failure mode
 * (nominalized, longer-for-no-reason phrasing) so the model has a concrete
 * bar to avoid, not just an abstract "don't add length."
 *
 * Deliberately narrow via isPureCefrMismatch(): a CEFR mismatch combined
 * with ANY other issue (most commonly word count) falls through to the
 * existing buildRevisionPreamble(isLargeWordCountCutNeeded(...)) path,
 * completely unchanged -- that machinery already handles word-count/
 * prosody/interruption/opening/markdown correctly and this fix must not
 * alter it.
 *
 * FIX #7 (CEFR REVISION WORD-COUNT REGRESSION): a second real reproduction
 * (952 -> 989 words, still failing structurally afterward) confirmed this
 * preamble's existing anti-expansion language was not concrete enough to
 * reliably stop it on its own, and also surfaced a real CONTRADICTION this
 * fix removes at the call site (see buildRetryFeedback()'s comment):
 * buildCefrGuidance() -- meant for a CEFR mismatch COMBINED with other
 * issues -- was ALSO being appended after this preamble for the PURE case,
 * and its base text ("discuss a genuinely complex or abstract angle of the
 * topic instead of a simple personal anecdote") directly contradicts this
 * preamble's own "do NOT add any new... content of any kind." That
 * contamination is now suppressed for the pure case at the source.
 *
 * This preamble itself is also strengthened with the SPECIFIC failure
 * pattern the second reproduction exhibited, verbatim from the real
 * output ("feel... empty" -> "feel... ineffectual"; "I know exactly what
 * you mean" -> "I comprehend precisely what you signify"; "I get that" ->
 * "I apprehend that distinction") -- naming nominalization and periphrastic
 * expansion explicitly, by name and by counter-example, rather than only
 * the previous fix's more abstract "longer academic or nominalized
 * phrasing." Also adds: concrete positive technique guidance (precise word
 * choice, sentence-level structure, natural higher-level grammar --
 * anything BUT length), an explicit same-length-or-shorter preference with
 * a numeric compensation rule, a threshold (CEFR_REVISION_NEAR_CEILING_THRESHOLD)
 * that shifts the instruction to "substitution only, no expansion anywhere"
 * once the previous draft is already close to the 965 ceiling, and an
 * explicit final self-recount instruction (previously implicit).
 *
 * A second adversarial review of this fix caught four further real issues,
 * all fixed here: (1) the original "feel... empty" -> "feel... ineffectual"
 * worked example was itself a borderline MEANING change (emotional vacancy
 * vs. incompetence), undermining the exact distinction it was meant to
 * illustrate -- replaced with "really good" -> "excellent" (unambiguously
 * shorter, same meaning, more precise); (2) the compensation rule ("shorten
 * a different sentence... by at least N words") gave no guidance on HOW to
 * shorten, inviting a new failure mode -- cutting real content to pay a
 * word debt, contradicting "no content changes" -- now explicit: word-level
 * tightening only, never cutting a fact/example/turn; (3) "at least N
 * words" had no upper bound, risking systematically undershooting the 920
 * floor with no floor-side guidance to match the ceiling-side note -- now
 * "approximately N... not significantly more" plus an explicit "both the
 * 920 floor and the 965 ceiling are equally hard limits" statement; (4) the
 * near-ceiling override note could read as merely ADDITIONAL to the general
 * compensation allowance rather than replacing it -- now explicitly states
 * "this OVERRIDES the compensation allowance above."
 *
 * One review finding was deliberately NOT acted on: if a revision still
 * overshoots despite this preamble, the next attempt's issues array is no
 * longer length-1 (now CEFR + word count), so isPureCefrMismatch() is
 * false and the NEXT retry falls through to the existing, unchanged
 * buildCefrGuidance()/buildRevisionPreamble() combined-issue machinery --
 * exactly as requirement 10 of this fix requires ("must NOT change
 * behavior for a CEFR mismatch combined with any other issue"). Closing
 * that loop further would mean touching the combined path, which this fix
 * is explicitly scoped not to do.
 */
const CEFR_REVISION_NEAR_CEILING_THRESHOLD = 940;

export function buildCefrOnlyRevisionPreamble(previousWordCount?: number): string {
  const nearCeiling = previousWordCount !== undefined && previousWordCount > CEFR_REVISION_NEAR_CEILING_THRESHOLD;
  const ceilingNote = nearCeiling
    ? ` This draft is already at ${previousWordCount} words, close to the 965 ceiling -- this OVERRIDES the compensation allowance above: do NOT expand ANYWHERE in this revision, even by one or two words per sentence and even if you plan to compensate elsewhere; every register change here must be same-length-or-shorter, no exceptions.`
    : "";

  return `The assistant message directly above is the EXACT script you wrote last time, as the same JSON structure you must return again. This revision failed ONLY the authoritative CEFR grading -- every structural rule (word count, turn structure, prosody, opening block, interruption) already passed and must keep passing. Preserve the facts, topic, meaning, structure, speaker personalities, and existing examples exactly as they are -- do NOT add any new facts, examples, explanations, turns, or content of any kind, and do NOT reframe the discussion toward a "more complex" or "more abstract" angle -- the topic and what is actually said about it must stay the same. UNLIKE a normal minimal-edit revision, wording is NOT protected here: you are REQUIRED to rewrite existing sentences to genuinely reach the required CEFR register, not just relabel them.

Treat this as SUBSTITUTION and COMPRESSION, not expansion. Raise the register ONLY through: more precise or specific word choice (a more exact word, not a longer one), better sentence-level structure (subordinate or relative clauses, varied sentence openings), and natural higher-level grammar (conditionals, passive voice where it reads naturally, more sophisticated connectors) -- never through raw length.

STRICTLY FORBIDDEN, because "longer" is never evidence of "more advanced": (1) nominalization -- turning a verb or adjective into an abstract noun for its own sake (e.g. "really good" -> "excellent" is fine: shorter, same meaning, more precise; "feel... empty" -> "experience a sense of hollowness" is NOT, because it is longer AND changes the meaning); (2) periphrastic expansion -- using more words to express the same idea (the REAL, observed failure this fix addresses: "I know exactly what you mean" -> "I comprehend precisely what you signify", and "I get that" -> "I apprehend that distinction" -- both longer, more Latinate, and no more precise than the original); (3) any synonym swap that adds length without adding real meaning or level, or that changes what is actually being said.

Strongly prefer substitutions that are the SAME LENGTH or SHORTER than what they replace. If one rewritten sentence must become longer by N words to correctly express the required register, shorten a different existing sentence elsewhere in this SAME revision by approximately N words (not significantly more -- overcorrecting below 920 is exactly as wrong as overshooting 965) to compensate -- the net word-count change from register changes alone should be zero or slightly negative. Compensate by tightening WORDING ONLY -- removing filler, a redundant modifier, or a repeated phrase -- never by cutting a fact, an example, or a turn to pay the difference; that would violate the "no content changes" rule above.${ceilingNote} The revised script MUST remain inside the existing 920-965 word range -- both the 920 floor and the 965 ceiling are equally hard limits.

Do not merge, shorten, or remove the required LinguABC branding, the self-introductions, the opening hook, or the interruption pair merely to save words -- those structural elements must stay intact even while other sentences are rewritten for register. You must still return the FULL script (every turn, not a diff or a summary of changes). Before returning, mentally recount the final spoken word total (excluding bracket prosody cues) and confirm it is between 920 and 965 -- the final draft must satisfy BOTH the CEFR requirement and the 920-965 word count simultaneously, neither is a secondary concern to fix on a later attempt.`;
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
 * Structural equality check used ONLY by runWordCountCorrection()'s no-op
 * detection below -- true when two drafts have identical turns (same
 * speaker + exact text) in the same order. Deliberately ignores
 * title/topic/topicTags/cefrLevel: the correction pass's whole job is
 * shortening dialogue, so what matters for "did this attempt actually
 * change anything" is the turns themselves.
 */
function isSameScript(a: ScriptGenerationOutput, b: ScriptGenerationOutput): boolean {
  if (a.turns.length !== b.turns.length) return false;
  for (let i = 0; i < a.turns.length; i++) {
    if (a.turns[i].speaker !== b.turns[i].speaker || a.turns[i].text !== b.turns[i].text) return false;
  }
  return true;
}

/**
 * Boundary (in words past the 965 ceiling) below which the DEDICATED
 * correction pass (buildWordCountCorrectionMessage(), runWordCountCorrection())
 * treats an overshoot as "small" rather than "meaningful" -- see
 * classifyCorrectionCutMagnitude(). Scoped ONLY to those two functions;
 * does NOT affect buildWordCountGuidance() (the outer revision path) or
 * buildCutMethodGuidance(), both byte-for-byte unchanged by this fix.
 *
 * 10 is taken directly from the real evidence this fix addresses: two
 * confirmed real no-ops (966->966, 969->969, both byte-identical output)
 * were 1- and 4-word overshoots -- comfortably inside this band -- where
 * the previous generic "trim sentences and phrases... a cut this small
 * does not require [deleting whole turns]" phrasing gave the model no
 * concrete target to aim at and, in these two real instances, the model
 * returned the input completely unchanged.
 */
const WORD_COUNT_SMALL_OVERSHOOT_LIMIT = 10;

type CorrectionCutMagnitude = "small" | "meaningful" | "large";

/**
 * Classifies an ALREADY-COMPUTED overshoot (words past the 965 ceiling) for
 * the DEDICATED correction pass ONLY. Takes the overshoot itself, not
 * previousCount, so the one subtraction lives in exactly one place
 * (buildWordCountCorrectionMessage() computes it once and reuses it for
 * both classification and the displayed "words over" figure -- no
 * duplicated arithmetic that could silently drift out of sync). Only ever
 * called when previousCount > WORD_COUNT_HARD_MAX (i.e. overshoot > 0),
 * matching runWordCountCorrection()'s entry guard AND its own
 * `wordCount <= WORD_COUNT_HARD_MAX` early-exit -- the loop no longer calls
 * this (indirectly, via buildWordCountCorrectionMessage()) with a
 * previousCount that isn't still a genuine overshoot.
 *
 * The "large" boundary is intentionally the SAME constant
 * (NEAR_CEILING_OVERSHOOT_LIMIT) wordCountCorrectionTarget() and
 * buildCutMethodGuidance() already use -- the large-cut sub-target
 * (935-950) and the large-cut instruction text are completely unchanged by
 * this fix; only the previously-undifferentiated near-ceiling band (1-60
 * words over) is now split into "small" (1-10) and "meaningful" (11-60),
 * each with its own, more concrete instruction (see
 * buildWordCountCorrectionMessage()).
 */
function classifyCorrectionCutMagnitude(overshoot: number): CorrectionCutMagnitude {
  if (overshoot <= WORD_COUNT_SMALL_OVERSHOOT_LIMIT) return "small";
  if (overshoot <= NEAR_CEILING_OVERSHOOT_LIMIT) return "meaningful";
  return "large";
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
 * How far below WORD_COUNT_HARD_MAX the "small"/final-boundary band's
 * target range floor sits (FINAL-BOUNDARY CONVERGENCE FIX). Deliberately
 * tiny -- this band is 1-WORD_COUNT_SMALL_OVERSHOOT_LIMIT words over, so the
 * fix is "remove that many words," not a bigger safety cut. Before this
 * fix, the small band silently inherited the "meaningful" band's
 * NEAR_CEILING_TARGET_MIN/MAX (955-960) here, while
 * buildFinalBoundaryCorrectionInstruction() separately told the model to
 * remove only the exact deficit (e.g. 2 words for a 967-word script) --
 * two DIFFERENT cut sizes in the same prompt (the shared "Cut approximately
 * X-Y spoken words" line above cutMethod said 7-12; the final-boundary
 * instruction said 2). This margin makes both lines agree: for previousCount
 * 966-975, cutMin below always equals the exact overshoot exactly.
 */
const FINAL_BOUNDARY_TARGET_MARGIN = 2;

/**
 * Reuses classifyCorrectionCutMagnitude() itself (not a second copy of its
 * threshold logic -- an adversarial review of this fix caught an earlier
 * version that reimplemented the same small/meaningful/large boundaries
 * inline here, which would have silently drifted out of sync with that
 * function if its thresholds ever changed) to pick a target range per band:
 * "small"/final-boundary gets its own tight range (FINAL_BOUNDARY_TARGET_MARGIN),
 * which buildWordCountGuidance() has no equivalent of; "meaningful" and
 * "large" reuse the SAME near-ceiling/large-overshoot numeric constants
 * buildWordCountGuidance() uses (see its doc comment) -- no duplicated
 * numbers. Only ever called with previousCount > WORD_COUNT_HARD_MAX, the
 * same invariant classifyCorrectionCutMagnitude() itself documents.
 */
function wordCountCorrectionTarget(previousCount: number): { min: number; max: number } {
  const overshoot = previousCount - WORD_COUNT_HARD_MAX;
  if (overshoot <= 0) return { min: WORD_COUNT_TARGET_MIN, max: WORD_COUNT_TARGET_MAX }; // not actually an overshoot -- preserves the original fallback for this invariant-violating input; see classifyCorrectionCutMagnitude()'s own "only called when overshoot > 0" doc note
  const magnitude = classifyCorrectionCutMagnitude(overshoot);
  if (magnitude === "small") {
    return { min: WORD_COUNT_HARD_MAX - FINAL_BOUNDARY_TARGET_MARGIN, max: WORD_COUNT_HARD_MAX };
  }
  if (magnitude === "meaningful") {
    return { min: NEAR_CEILING_TARGET_MIN, max: NEAR_CEILING_TARGET_MAX };
  }
  return { min: WORD_COUNT_TARGET_MIN, max: WORD_COUNT_TARGET_MAX };
}

/**
 * Builds the final-boundary ("small", 1-WORD_COUNT_SMALL_OVERSHOOT_LIMIT
 * over) branch's cut-method text -- see the FINAL-BOUNDARY CONVERGENCE FIX
 * note on buildWordCountCorrectionMessage() below for the real trajectory
 * this addresses. Deliberately numeric and narrow: states the exact word
 * count to remove (never a range, since a cut this small has no reason to
 * overshoot), forbids any edit that could add length or hold it steady, and
 * names a concrete method (delete one redundant phrase/sentence, or shorten
 * one existing phrase) instead of an open-ended "make an edit." This is
 * intentionally NOT a rewrite instruction -- the goal for a 967-word script
 * is removing 2 words, not restructuring turns.
 *
 * previousAttemptWasNoOp gets its OWN stronger escalation here, replacing
 * (not stacking with) the generic noOpWarning every other magnitude still
 * uses unchanged -- see buildWordCountCorrectionMessage()'s call site.
 *
 * An adversarial review of this fix caught an earlier version's "(a couple
 * more is fine; fewer will not cross the boundary)" wording actively
 * inviting a bigger cut than necessary, contradicting this same
 * instruction's own "SMALLEST edit" framing and the real requirement that
 * a 967-word script's fix is removing exactly 2 words, not more. Reworded
 * to state the exact deficit as the smallest sufficient cut without
 * inviting extra trimming.
 */
function buildFinalBoundaryCorrectionInstruction(exactWordsOver: number, previousAttemptWasNoOp: boolean): string {
  const escalation = previousAttemptWasNoOp
    ? ` YOUR PREVIOUS ATTEMPT AT THIS FINAL BOUNDARY MADE NO PROGRESS -- it returned the same word count, a HIGHER word count, or a script identical to the one you were given. That is not acceptable this close to the limit. This time you MUST actually delete words: pick ONE short redundant phrase, filler aside, or repeated idea and remove it entirely (or shorten one existing sentence), then recount before responding.`
    : "";
  return `You are exactly ${exactWordsOver} word(s) over the ${WORD_COUNT_HARD_MAX}-word hard maximum. This is the FINAL boundary correction -- the goal is one small, surgical edit, not a rewrite. Remove at least ${exactWordsOver} word(s) from the EXISTING dialogue below -- ${exactWordsOver} is the smallest cut that actually crosses the boundary; removing fewer will not cross it, and removing significantly more is a bigger edit than this fix calls for. Do NOT add, expand, or rephrase any content in a way that could increase the total length -- a same-length paraphrase or a longer "improved" sentence does not satisfy this. Prefer deleting one genuinely redundant short phrase, filler aside, or repeated idea, or shortening one existing phrase -- do not delete or rewrite an entire turn for a cut this small, and do not touch the hook, the self-introductions, the LinguABC mention, or the interruption pair. Make the SMALLEST edit that actually gets the script to ${WORD_COUNT_HARD_MAX} words or fewer, then recount the final spoken word total (excluding bracket prosody cues) before returning your answer.${escalation}`;
}

/**
 * MEANINGFUL-BAND CONVERGENCE FIX (Fix #6): a real daily-generation run got
 * stuck at 982 words (17 over the 965 ceiling -- squarely in the
 * "meaningful", 11-NEAR_CEILING_OVERSHOOT_LIMIT-over band) and produced
 * repeated no-op correction sub-attempts EVEN WITH the existing generic
 * no-op escalation already firing on the second sub-attempt of each pass --
 * the SAME class of failure Fix #5 found and fixed for the "small" band,
 * one band up. The old meaningful text ("Prefer removing a redundant
 * phrase... compress within existing turns instead") asked the model to
 * find its own candidate across the whole script -- exactly the open-ended-
 * search failure mode Fix #4 already diagnosed and fixed for "large" cuts.
 *
 * Per this fix's own explicit direction, the answer is NOT more vague
 * prompt wording: this reuses selectLargeCutTarget() UNCHANGED (never
 * modified by this fix -- Fix #4's large-cut mechanism is untouched) to
 * deterministically name the SAME safe, longest-eligible, non-essential
 * turn as a compression candidate here too. The instruction is COMPRESS,
 * never cut-substantially-or-remove: a cut this size (11-60 words) does not
 * justify deleting a whole turn, so the model is told to trim redundant
 * phrasing WITHIN the named turn instead, and explicitly forbidden from
 * adding content or raising vocabulary/grammar sophistication while doing
 * it (a compression edit drifting toward more "advanced" phrasing would be
 * a regression of its own). Falls back to the ORIGINAL, unmodified
 * meaningful text when no eligible turn exists, same "never invent a
 * fallback target" rule Fix #4 established -- with its own light escalation
 * appended so a no-op is still met with an explicit callout even without a
 * named turn to point at.
 *
 * Gets its own no-op escalation (like Fix #5's small-band one), replacing
 * the generic noOpWarning for this band -- see
 * buildWordCountCorrectionMessage()'s call site.
 *
 * An adversarial review of this fix caught three real issues, all fixed
 * here: (1) the no-target fallback never stated the exact deficit at all,
 * failing this fix's own "calculate exact deficit" requirement in exactly
 * the case determinism matters most; (2) "you are exactly N word(s) over"
 * and the shared template's separate "cut approximately cutMin-cutMax"
 * line (a WIDER range, deliberately cut past the bare ceiling for margin --
 * same relationship the "large" and "small" bands already have) could read
 * as two competing targets, risking a model anchoring on the narrower N and
 * landing with zero margin right back at the fragile boundary this whole
 * effort exists to avoid -- now stated together, in one sentence, with the
 * wider range explicitly framed as the real target; (3) near the TOP of
 * this band (up to 60 over), a single ~30-40-word turn cannot supply the
 * full cutMax on its own while also being forbidden from full deletion --
 * selectSecondCompressionTarget() below deterministically names a SECOND
 * candidate turn (by re-running selectLargeCutTarget() on a copy with the
 * first candidate's text blanked out -- never modifying selectLargeCutTarget()
 * itself) whenever the primary doesn't hold at least DOUBLE the cut ceiling
 * (not just barely more than it -- a second review of this fix pointed out
 * that "just enough raw words" would require compressing nearly the entire
 * turn, in tension with "do not delete the entire turn"), replacing the old
 * vague "apply the same trim to one or two other turns" escape hatch with a
 * second named turn instead, plus a bounded last-resort allowance (a few
 * words each from OTHER turns) for the rare case where even two named
 * turns' realistic compression still falls short.
 */
/**
 * Blanking the primary's text to "" is safe -- selectLargeCutTarget()'s own
 * word-count formula (`text.replace(bracketRe, " ").split(/\s+/).filter(Boolean).length`)
 * gives an empty string exactly 0 words, via the trailing filter(Boolean),
 * not 1 -- so it can never tie with (and therefore never be re-selected
 * over) any turn that has genuine spoken content, including a real
 * one-word backchannel turn like "Right." (1 word). A second adversarial
 * review specifically checked this against the real formula rather than
 * assuming a naive split().length.
 */
function selectSecondCompressionTarget(output: ScriptGenerationOutput, request: ScriptGenerationRequest, primary: LargeCutTarget): LargeCutTarget | null {
  const withoutPrimary: ScriptGenerationOutput = {
    ...output,
    turns: output.turns.map((t, i) => (i === primary.turnIndex ? { ...t, text: "" } : t)),
  };
  return selectLargeCutTarget(withoutPrimary, request);
}

function buildMeaningfulCompressionInstruction(
  output: ScriptGenerationOutput,
  request: ScriptGenerationRequest,
  target: LargeCutTarget | null,
  exactWordsOver: number,
  cutMax: number,
  previousAttemptWasNoOp: boolean,
): string {
  const deficitContext = `The script needs approximately ${cutMax} word(s) removed at most to reach a safe margin below the ${WORD_COUNT_HARD_MAX}-word hard maximum (it is currently ${exactWordsOver} word(s) past that maximum) -- this needs a deliberate structural compression, not scattered single-word edits.`;
  if (!target) {
    const fallback = `Prefer removing a redundant phrase, a repeated explanation, or a full sentence that restates something already said elsewhere in the script -- not scattered single-word edits spread across many turns. Do not delete an entire turn for a cut this size (that strategy is reserved for much larger overages); compress within existing turns instead.`;
    const fallbackEscalation = previousAttemptWasNoOp
      ? ` YOUR PREVIOUS ATTEMPT MADE NO PROGRESS -- it returned the same word count, a HIGHER word count, or a script identical to the one you were given. This time you MUST make a real, verifiable cut, then recount before responding.`
      : "";
    return `${deficitContext} ${fallback}${fallbackEscalation}`;
  }
  const preview = truncatePreview(target.text, 140);
  // Near the top of this band, one turn's worth of redundant phrasing may
  // not be able to supply the whole cut while staying short of a full
  // deletion -- name a second deterministic candidate instead of an
  // open-ended "other turns" escape hatch when that looks likely. A bare
  // `target.wordCount < cutMax` comparison (an earlier version of this
  // fix) treated "just barely enough raw words" as sufficient, which would
  // require compressing nearly the ENTIRE turn -- close to the very "full
  // deletion" this instruction forbids. Requiring the turn to hold at
  // least DOUBLE the cut (the same "remove at least half" ceiling the
  // large-cut instruction already uses as its own compression assumption)
  // is a more realistic bar for "genuinely sufficient alone."
  const second = target.wordCount < cutMax * 2 ? selectSecondCompressionTarget(output, request, target) : null;
  const secondPreview = second ? truncatePreview(second.text, 140) : null;
  const secondCandidateSentence = second
    ? ` If Turn #${target.turnIndex} alone cannot supply the full cut, Turn #${second.turnIndex} (${second.speakerName}, ${second.wordCount} words) is the second candidate: "${secondPreview}" -- apply the same kind of compression there too. If these two turns together still cannot reach the target after genuine compression, you may lightly trim (a few words each) from one or two other turns as a last resort -- but the two named turns should supply most of the cut.`
    : ` If this turn alone cannot supply the full cut, apply the same kind of redundant-phrase/repeated-explanation trim to it more aggressively before considering any other turn.`;
  const escalation = previousAttemptWasNoOp
    ? second
      ? ` YOUR PREVIOUS ATTEMPT AT THIS COMPRESSION MADE NO PROGRESS -- it returned the same word count, a HIGHER word count, or a script identical to the one you were given. That is not acceptable. This time you MUST actually shorten BOTH Turn #${target.turnIndex} and Turn #${second.turnIndex}: cut a specific redundant phrase or sentence from each, then recount before responding.`
      : ` YOUR PREVIOUS ATTEMPT AT THIS COMPRESSION MADE NO PROGRESS -- it returned the same word count, a HIGHER word count, or a script identical to the one you were given. That is not acceptable. This time you MUST actually shorten Turn #${target.turnIndex}: cut a specific redundant phrase or sentence from it, then recount before responding.`
    : "";
  return `${deficitContext} Turn #${target.turnIndex} (${target.speakerName}, ${target.wordCount} words) is a good compression candidate: "${preview}" COMPRESS this turn -- remove a redundant phrase, a repeated explanation, or one low-value sentence from it. Do NOT delete the entire turn (this cut is not large enough to justify that), and do NOT rewrite the rest of the script beyond the candidate turn(s) named here.${secondCandidateSentence} Do not add any new content, and do not increase vocabulary or grammatical sophistication while compressing -- keep the same CEFR-level complexity. Recount the final spoken word total (excluding bracket prosody cues) before returning your answer; it must be <=${WORD_COUNT_HARD_MAX}.${escalation}`;
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
 *
 * NEAR-CEILING RELIABILITY FIX: the cut-method sentence now uses
 * classifyCorrectionCutMagnitude() to distinguish THREE cases, not two.
 * The previously-undifferentiated near-ceiling band (1-60 over, phrased
 * identically regardless of exact magnitude) is split into "small" (1-10
 * over) and "meaningful" (11-60 over), each now with its own deterministic-
 * target-based instruction -- see buildFinalBoundaryCorrectionInstruction()
 * and buildMeaningfulCompressionInstruction()'s own doc comments for the
 * real evidence each addresses. Neither is a whole-turn deletion (that
 * stays reserved for "large").
 *
 * NO-OP ESCALATION: previousAttemptWasNoOp (passed by
 * runWordCountCorrection() from the immediately preceding sub-attempt's
 * own outcome, never guessed) appends an explicit, blunt callout when the
 * last correction call failed to make progress -- returned the same OR a
 * greater word count, or a byte-identical script -- directly addressing
 * the confirmed real no-op pattern rather than hoping the same phrasing
 * works better on a second try. Defaults to
 * false so the very first sub-attempt of any correction pass is
 * unaffected. For the "small"/final-boundary and "meaningful"/compression
 * branches specifically, this generic escalation text is REPLACED by their
 * own stronger, band-specific ones -- see
 * buildFinalBoundaryCorrectionInstruction()'s and
 * buildMeaningfulCompressionInstruction()'s doc comments. Only "large"
 * still uses this generic text, unchanged since before Fix #5.
 *
 * FINAL-BOUNDARY CONVERGENCE FIX: a real daily-generation run got a script
 * all the way down to 967 words (2 over the 965 ceiling) and then produced
 * TWO consecutive no-op correction sub-attempts, exhausting the run without
 * ever crossing the boundary or reaching CEFR grading. The "small" text
 * above ("Make a deliberate edit... pick one specific phrase or short
 * clause") already asked for a concrete edit but left room for the model to
 * return a same-length paraphrase, a slightly LONGER "improvement," or an
 * unrelated rewrite -- none of which the old phrasing explicitly ruled out.
 * buildFinalBoundaryCorrectionInstruction() replaces that branch's text
 * with an explicit, numeric, single-purpose instruction (exact word count
 * to remove, a hard <=965 requirement, an explicit ban on any edit that
 * could add or hold length steady, and a concrete "delete one redundant
 * phrase/sentence, or shorten one existing phrase" method) plus its own
 * stronger no-op escalation when the previous sub-attempt made no
 * progress. This is deliberately the SAME 1-WORD_COUNT_SMALL_OVERSHOOT_LIMIT
 * range the "small" classification already used -- no new threshold, no
 * change to classifyCorrectionCutMagnitude() or wordCountCorrectionTarget().
 *
 * DETERMINISTIC LARGE-CUT TARGET SELECTION: the "large" branch (>60 over)
 * no longer asks the model to SEARCH the script for "the single longest
 * turn that is a personal example/story/aside" -- a real diagnostic run
 * confirmed classification and cut-range arithmetic were already correct,
 * and the search itself was the failure point (see
 * selectLargeCutTarget()'s doc comment for the full evidence). The target
 * turn is now computed deterministically in code and named explicitly via
 * buildDeterministicLargeCutInstruction(); the model still performs the
 * actual rewrite. Falls back to the ORIGINAL buildCutMethodGuidance(true)
 * text, unmodified, when no eligible turn exists.
 */
function buildWordCountCorrectionMessage(output: ScriptGenerationOutput, previousCount: number, request: ScriptGenerationRequest, previousAttemptWasNoOp: boolean = false): string {
  const { min, max } = wordCountCorrectionTarget(previousCount);
  const cutMin = previousCount - max;
  const cutMax = previousCount - min;
  const exactWordsOver = previousCount - WORD_COUNT_HARD_MAX;
  const magnitude = classifyCorrectionCutMagnitude(exactWordsOver);

  const cutMethod =
    magnitude === "small"
      ? buildFinalBoundaryCorrectionInstruction(exactWordsOver, previousAttemptWasNoOp)
      : magnitude === "meaningful"
        ? buildMeaningfulCompressionInstruction(output, request, selectLargeCutTarget(output, request), exactWordsOver, cutMax, previousAttemptWasNoOp)
        : buildDeterministicLargeCutInstruction(selectLargeCutTarget(output, request));

  // Both "small"/final-boundary and "meaningful"/compression carry their
  // OWN stronger no-op escalation (embedded in cutMethod above) instead of
  // this generic one -- stacking both would be redundant. Only "large" is
  // still unaffected, unchanged since Fix #4.
  const noOpWarning = previousAttemptWasNoOp && magnitude === "large"
    ? ` YOUR PREVIOUS ATTEMPT FAILED TO MAKE A MEANINGFUL CHANGE: it returned the same word count, or a script identical to the one you were given. That is not an acceptable response. This time you MUST make a real edit -- identify a specific phrase, clause, or sentence, remove it, and confirm the new word count is actually lower than ${previousCount} before returning your answer.`
    : "";

  return `This is a DEDICATED WORD-COUNT CORRECTION pass, separate from normal script revision. Your ONLY job is to shorten the script below -- do not rewrite the episode, do not change the topic, and do not add any new content.

Current spoken word count: ${previousCount}. Required range: 920-965 words. Target for this correction: ${min}-${max} words.

CUT ONLY. Cut approximately ${cutMin}-${cutMax} spoken words from the EXISTING dialogue below. ${cutMethod}${noOpWarning} Do not add replacement paragraphs or new content to compensate for what you cut. Preserve the meaning, the two speakers and their personalities, the opening block (the hook, both self-introductions, and the LinguABC mention), the interruption pair, the prosody cues, and the CEFR-level vocabulary and complexity wherever possible -- but making the word count correct is this pass's one job, so a cut of this size may require trimming some of these too if there is no other way to reach the range. Return the COMPLETE script as the same JSON structure (title, topic, topicTags, cefrLevel, turns) -- not a diff, not a partial script, not a summary of changes. Before returning, mentally recount the final spoken word total (excluding bracket prosody cues) and confirm it falls within 920-965.

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
 *
 * NO-OP ESCALATION (near-ceiling reliability fix): tracks whether the
 * immediately preceding sub-attempt failed to make progress -- its output
 * word count was the same as OR GREATER than its input word count (this is
 * a CUT-only pass; an increase is a worse failure than a stall, not a
 * lesser one, so it gets the same escalation), or its output was
 * structurally identical to its input (isSameScript(), which a >= check
 * alone can miss only in the impossible case of identical text producing a
 * different count) -- and passes that as
 * buildWordCountCorrectionMessage()'s previousAttemptWasNoOp argument for
 * the NEXT sub-attempt only. With WORD_COUNT_CORRECTION_MAX_ATTEMPTS still
 * at 2 (unchanged), this can only ever affect sub-attempt 2, reflecting
 * sub-attempt 1's real, observed outcome -- never guessed, never carried
 * over from a different correction-pass invocation or outer attempt.
 *
 * BOUNDARY FIX: stops the loop as soon as `wordCount <= WORD_COUNT_HARD_MAX`
 * -- deliberately NOT the same condition as "no word-count issue is
 * flagged" (validateGeneratedScript's word-count message fires for BOTH
 * over 965 and under 920, so that check alone can't tell an overshoot from
 * an undershoot). Without this, a sub-attempt that overcorrects below 920
 * would still show "a word-count issue" and the loop would call
 * buildWordCountCorrectionMessage() again with a previousCount that is no
 * longer an overshoot at all -- producing a negative "words over" figure
 * and a negative cut range on the wasted final sub-attempt. An undershoot
 * belongs to the outer revision path's separate add-words guidance, never
 * to a second call inside this pass.
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
  let previousAttemptWasNoOp = false;

  for (let i = 0; i < WORD_COUNT_CORRECTION_MAX_ATTEMPTS; i++) {
    const inputOutput = currentOutput;
    const inputCount = currentCount;
    let corrected: ScriptGenerationOutput;
    try {
      corrected = await generateStructuredJson({
        messages: [{ role: "user", content: buildWordCountCorrectionMessage(inputOutput, inputCount, request, previousAttemptWasNoOp) }],
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
    previousAttemptWasNoOp = wordCount >= inputCount || isSameScript(inputOutput, corrected);
    currentOutput = corrected;
    currentCount = wordCount;
    currentIssues = issues;
    entries.push({ attemptNumber: startingAttemptNumber + entries.length, phase: "word-count correction", wordCount, issues });

    // Stop as soon as the overshoot itself is resolved, whether the result
    // landed in range OR undershot -- NOT merely "no word-count issue is
    // flagged" (validateGeneratedScript's word-count message covers BOTH
    // over 965 and under 920, so that alone can't distinguish them). This
    // pass's one job is cutting an overshoot; an undershoot belongs to the
    // outer revision path's separate add-words guidance, never to a second
    // call here with a previousCount that is no longer actually an
    // overshoot (which would otherwise compute a nonsensical negative
    // "words over" figure and a negative cut range on the next sub-attempt).
    if (wordCount <= WORD_COUNT_HARD_MAX) break;
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
 * same single-message full-generation shape attempt 1 uses.
 *
 * FIX #8 (CEFR-REGROWTH RETRY-BUDGET FIX): a real run reached 961 words
 * (structural PASS), failed ONLY authoritative CEFR grading, and Fix #7's
 * dedicated CEFR-only revision correctly improved the register -- but the
 * model still returned 1210 words (+249), a large overshoot. The EXISTING
 * mechanism already routes that draft into the dedicated
 * runWordCountCorrection() pass immediately (see the WORD_COUNT_ISSUE_RE
 * check below) -- that part already worked. The gap: a 249-word overshoot
 * routinely needs more than WORD_COUNT_CORRECTION_MAX_ATTEMPTS (2, UNCHANGED
 * by this fix) sub-attempts to fully resolve, and once that bound is
 * exhausted, the NEXT outer attempt fell back to the generic
 * buildRevisionPreamble()/buildWordCountGuidance() path -- which uses the
 * OLDER, non-deterministic "find the SINGLE longest turn..." large-cut
 * instruction (buildCutMethodGuidance(true) directly, never
 * selectLargeCutTarget()), not Fix #4's deterministic mechanism, since that
 * upgrade was deliberately scoped only to the dedicated correction pass.
 * The real run alternated between this weaker generic revision and the
 * correction pass for the rest of MAX_ATTEMPTS (1210->1156->1139 [correction,
 * exhausted] ->1110 [generic revision] ->1106->1104 [correction, exhausted]
 * ->1043 [generic revision] ->...) and never recovered.
 *
 * cefrRecoveryPending (declared below, scoped to this function only) tracks
 * whether the CURRENT unresolved state is a plain word-count OVERSHOOT that
 * the dedicated correction pass just ran on THIS iteration and did not
 * fully resolve within its own bounded WORD_COUNT_CORRECTION_MAX_ATTEMPTS.
 * While true, the NEXT outer attempt skips the generic revision call
 * ENTIRELY and calls the SAME, UNMODIFIED runWordCountCorrection() again
 * directly on the existing draft -- reusing Fix #4/#5/#6's deterministic
 * mechanisms repeatedly instead of spending an outer attempt on the weaker
 * generic large-cut path, so more of the bounded MAX_ATTEMPTS budget goes
 * toward the correction mechanism that is actually capable of resolving it.
 * It clears itself the moment the state stops being a plain overshoot (full
 * recovery, an undershoot, or any other/combined issue), and once
 * structural validation clears, the EXISTING, unconditional "grade if zero
 * issues" check below reruns CEFR grading exactly as it always has -- there
 * is nothing to specially "remember" about a CEFR mismatch, only the
 * ordinary, stateless "are there zero structural issues right now" check.
 *
 * FIX #9 (GENERALIZED CONTINUATION -- ORIGIN-INDEPENDENT): originally (Fix
 * #8) this flag could only ever seed from a genuine pure-CEFR-mismatch
 * revision (isPureCefrMismatch()), deliberately excluding a normal
 * overshoot from a fresh initial draft or from an unrelated resolved issue
 * (e.g. the interruption pattern). A real GitHub Actions failure (word-count
 * trajectory 1226->1245->1230->1207->1197->1191->1155->1135->1110->1084->
 * 1076->1062->1039->1039->1017->996, exhausting all 6 outer attempts, final
 * failure at 996 words) proved that exclusion was too narrow: the SAME
 * weaker-generic-revision-path regression Fix #8 fixed for CEFR also
 * happens for a plain overshoot with no CEFR involvement anywhere in the
 * run -- there the overshoot originated from a resolved "interruption"
 * structural issue (attempt 1 failed on `word count, interruption`
 * together; the attempt-2 revision fixed the interruption but left a pure
 * word-count overshoot), so cefrRecoveryPending never activated and every
 * correction-pass exhaustion fell back to the weaker
 * buildCutMethodGuidance(true) path, which alternated with the correction
 * pass at roughly 1/5th its effectiveness across that real run (mean -21.1
 * words/correction-call vs -3.8 words/generic-revision-call, including one
 * generic-revision call that made the overshoot WORSE (+19) and one true
 * no-op (0)).
 *
 * The seed condition is now ORIGIN-INDEPENDENT (see the assignment below):
 * it depends only on THIS iteration's actual resulting state -- whether
 * that state came from the continuation branch or from the else branch's
 * inline correction call -- being a lone word-count overshoot, never on
 * what triggered the correction pass to run. isPureCefrMismatch() and
 * wasPureCefrMismatch are UNCHANGED and still used, unchanged, to select
 * buildCefrOnlyRevisionPreamble() above -- this fix only removes
 * wasPureCefrMismatch from cefrRecoveryPending's OWN seed clause, since the
 * three conjuncts below already fully and correctly describe "the
 * correction pass just ran and left a lone overshoot," regardless of what
 * caused that correction call. Fix #8's own CEFR-triggered cases are a
 * strict subset of this wider condition and are completely unaffected --
 * every case that used to set this flag still does (see tests A-F in the
 * corresponding test file); only the previously-excluded non-CEFR cases
 * (test G, and the pre-existing "dedicated word-count correction pass"
 * test D, both updated by this fix) now also continue instead of falling
 * back to the generic revision.
 */
export async function generateEpisodeScript(request: ScriptGenerationRequest): Promise<ScriptGenerationResult> {
  const basePrompt = buildPrompt(request);
  let lastIssues: ScriptValidationIssue[] = [];
  let previousOutput: ScriptGenerationOutput | undefined;
  // Tracks the shape of the LAST attempt made, purely for the diagnostic
  // tag on the two throws below -- never fed back into lastIssues or
  // buildRetryFeedback(), so it cannot change what the model sees.
  let lastAttemptWasRevision = false;
  // Fix #8/#9 -- see this function's doc comment. Starts false; origin-
  // independent since Fix #9 (a plain overshoot's correction-pass
  // exhaustion seeds it regardless of whether it arose from CEFR, a
  // resolved unrelated issue, or a fresh initial draft).
  let cefrRecoveryPending = false;
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

    // A PURE CEFR mismatch (see isPureCefrMismatch()'s doc comment) uses
    // its own dedicated preamble instead of buildRevisionPreamble() -- any
    // other issue, or a CEFR mismatch combined with anything else (most
    // commonly word count), keeps the existing preamble/large-cut logic
    // completely unchanged. Captured here, before any reuse below, since
    // Fix #8's cefrRecoveryPending update at the end of this iteration
    // needs to know whether THIS iteration's input state was a genuine
    // pure CEFR mismatch, independent of which branch actually runs.
    const wasPureCefrMismatch = isPureCefrMismatch(lastIssues);

    let attemptOutput: ScriptGenerationOutput;
    let structuralIssues: ScriptValidationIssue[];

    if (cefrRecoveryPending && previousOutput !== undefined) {
      // FIX #8: the current state is a plain word-count overshoot that
      // started with a pure-CEFR-mismatch revision, and a previous
      // correction-pass invocation didn't fully resolve it within its own
      // bounded WORD_COUNT_CORRECTION_MAX_ATTEMPTS (UNCHANGED). Skip the
      // generic revision call ENTIRELY this outer attempt -- no new draft
      // is generated via buildRevisionPreamble()/buildWordCountGuidance()
      // -- and go straight back into the SAME, unmodified
      // runWordCountCorrection() on the existing draft instead, so this
      // outer attempt is spent on the mechanism that can actually resolve
      // a large overshoot deterministically, not the weaker generic
      // large-cut fallback.
      const previousCount = countSpokenWords(previousOutput);
      const correction = await runWordCountCorrection(previousOutput, previousCount, request, trajectory.length + 1);
      trajectory.push(...correction.entries);
      attemptOutput = correction.output;
      structuralIssues = correction.issues;
      previousOutput = correction.output;
    } else {
      const revisionPreamble = wasPureCefrMismatch
        ? buildCefrOnlyRevisionPreamble(previousOutput ? countSpokenWords(previousOutput) : undefined)
        : buildRevisionPreamble(isLargeWordCountCutNeeded(lastIssues));
      const messages: AIProviderMessage[] = previousOutput
        ? [
            { role: "user", content: basePrompt },
            { role: "assistant", content: JSON.stringify(previousOutput) },
            { role: "user", content: `${revisionPreamble}${buildRetryFeedback(lastIssues, countSpokenWords(previousOutput))}` },
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

      structuralIssues = validateGeneratedScript(output, request);
      // attemptOutput is the script THIS attempt ultimately produces --
      // either `output` as-is, or a word-count-corrected replacement below.
      // Kept separate from `output` so the correction pass never has to
      // mutate the variable the catch block above already closed over.
      attemptOutput = output;
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
    }

    // FIX #8/#9: decide whether the NEXT outer attempt (if this one doesn't
    // already succeed below) should skip the generic revision path and go
    // straight back into runWordCountCorrection() -- true whenever the
    // CURRENT state (i.e. whatever this iteration's work -- the
    // continuation branch above, or the else branch's inline correction
    // call below -- actually produced) is a plain word-count OVERSHOOT
    // (never an undershoot; runWordCountCorrection() itself is only ever
    // entered for previousCount > WORD_COUNT_HARD_MAX, matching its
    // existing entry guard above). Any other outcome -- full recovery
    // (structuralIssues now empty), an undershoot, or a different/combined
    // issue -- clears it, falling through to ordinary handling next time.
    // The trailing `> WORD_COUNT_HARD_MAX` conjunct is load-bearing, not
    // decorative: it is the ONLY thing keeping this branch from ever firing
    // on an undershoot (WORD_COUNT_ISSUE_RE alone matches both directions);
    // do not simplify this condition to drop it.
    //
    // FIX #9 (ORIGIN-INDEPENDENT GENERALIZATION): Fix #8 originally gated
    // this seed on `wasPureCefrMismatch || cefrRecoveryPending` -- it could
    // only ever activate immediately after a genuine pure-CEFR-mismatch
    // revision, deliberately excluding a plain overshoot from a fresh
    // initial draft or from any other resolved issue. A real GitHub Actions
    // failure (word-count trajectory 1226->1245->1230->1207->1197->...->996,
    // exhausting all 6 outer attempts) proved that exclusion was too
    // narrow: that run's overshoot originated from a resolved
    // "interruption" structural issue, not CEFR, so this flag never
    // activated and every correction-pass exhaustion fell back to the
    // weaker generic buildCutMethodGuidance(true) path -- the SAME
    // regression Fix #8 fixed for CEFR, just reached through a different
    // trigger. The origin gate is removed entirely: the three conjuncts
    // below already fully and correctly describe "the correction pass just
    // ran (either branch above) and left the script a lone word-count
    // overshoot," regardless of what caused that correction pass to run.
    // The old `wasPureCefrMismatch ||` disjunct is also no longer needed to
    // let the flag persist across a MULTI-attempt recovery chain -- unlike
    // the old formula (whose seed term went false again the very next
    // iteration once lastIssues stopped being a pure CEFR issue, requiring
    // `|| cefrRecoveryPending` to carry it forward), this condition is
    // recomputed fresh from THIS iteration's actual output/issues every
    // time, so it is naturally self-sustaining for as long as the state
    // keeps being a lone overshoot, with no history to carry. Fix #8's own
    // CEFR-triggered cases (isPureCefrMismatch(), still unmodified, still
    // used above to select buildCefrOnlyRevisionPreamble()) are an
    // unaffected strict subset of this wider condition -- every case that
    // used to set this flag still does.
    //
    // Deliberately no stall/progress detection across repeated recovery
    // iterations (per Fix #8's adversarial review, unchanged by Fix #9):
    // once this flag is true, every subsequent outer attempt keeps calling
    // runWordCountCorrection() again for as long as the result stays a lone
    // overshoot, even if consecutive calls stop making meaningful progress
    // -- it never "gives up" and falls back to the generic path mid-chain.
    // MAX_ATTEMPTS already bounds the total cost.
    cefrRecoveryPending =
      structuralIssues.length === 1 &&
      WORD_COUNT_ISSUE_RE.test(structuralIssues[0].message) &&
      countSpokenWords(attemptOutput) > WORD_COUNT_HARD_MAX;

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
