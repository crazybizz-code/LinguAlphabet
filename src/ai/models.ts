/**
 * Per-feature model routing.
 *
 * WHY THIS EXISTS. Every OpenRouter call used to inherit a single
 * OPENROUTER_MODEL, so a 200-token summariser and a full podcast script ran
 * on the same model. Gemini 2.5 Flash-Lite is 3x cheaper per input token and
 * 6.25x cheaper per output token than Flash (see src/ai/telemetry/pricing.ts),
 * which is worth having on workloads that genuinely do not need Flash.
 *
 * THE RULE. A feature that names a model gets that model. A feature that names
 * nothing falls back to OPENROUTER_MODEL, which remains the global default.
 * The low-level client never hardcodes a model name; it only resolves
 * `input.model ?? process.env.OPENROUTER_MODEL`.
 *
 * WHY QUALITY-CRITICAL FEATURES ARE PINNED RATHER THAN LEFT TO INHERIT.
 * Podcast, article and Tuto quality must not change because someone edits an
 * environment variable to save money. Pinning them makes the guarantee
 * explicit and auditable in code, and makes any future downgrade a reviewed
 * change rather than a config tweak.
 */

/** Slugs must match the keys in src/ai/telemetry/pricing.ts or cost rows price as null. */
export const FLASH = "google/gemini-2.5-flash";
export const FLASH_LITE = "google/gemini-2.5-flash-lite";

/**
 * The routing table. Each entry records the model AND why, so a future reader
 * can tell a deliberate quality decision from an unexamined default.
 */
export const MODEL_ROUTING = {
  /** Creative long-form at C1/C2. A weaker model fails CEFR grading more often, which triggers regeneration and costs more than it saves. */
  podcastScriptV2: FLASH,
  /** Gates the podcast retry loop. A cheaper grader that judges differently would change how often the loop runs; benchmark before switching. */
  enrichment: FLASH,
  /** Creative, learner-facing prose. */
  articleGeneration: FLASH,
  /** Core product surface. */
  tutoChat: FLASH,
  /** Tool selection degrades badly on weaker models, and a wrong tool call costs an extra round trip anyway. */
  tutoToolLoop: FLASH,

  /** temperature 0, fixed tiny schema, one label out. No reasoning required. */
  turnClassifier: FLASH_LITE,
  /** Capped at 200 output tokens; summarising text that is already written. */
  conversationSummariser: FLASH_LITE,
} as const;

/**
 * Output ceiling for the enrichment payload.
 *
 * Sized from the prompt's own limits rather than guessed: 3-5 key expressions,
 * 3-4 discussion questions, 3-5 modality notes, 1-3 topics, a 2-3 sentence
 * summary, 5-8 vocabulary entries (each with IPA and an Uzbek translation),
 * 3-4 quiz items with four options apiece, 2-4 takeaways and one reflection.
 * At the top of every range that is roughly 1,600 tokens of content, and JSON
 * structure plus non-Latin translations inflate it further.
 *
 * 4000 leaves well over 2x headroom deliberately. This is a SAFETY bound, not
 * a saving: output is billed on what is generated, not on the ceiling. Setting
 * it tight would risk truncation, and a truncated payload fails schema
 * validation, which in the podcast loop discards a whole script attempt — far
 * more expensive than the tokens a tighter cap would ever save.
 */
export const ENRICHMENT_MAX_TOKENS = 4000;

/**
 * Output ceilings for calls that previously sent none.
 *
 * Omitting `max_tokens` does not mean "unlimited" in a harmless way: the key is
 * dropped from the request body entirely, the provider substitutes the model's
 * own maximum (65,535 for Gemini 2.5 Flash), and OpenRouter pre-authorises
 * credit against THAT ceiling rather than against the expected output. A short
 * coaching reply was therefore reserving ~65k tokens of balance, which is what
 * produced "You requested up to 65535 tokens, but can only afford 15355".
 *
 * These are safety ceilings, not savings: output is billed on what is actually
 * generated. Each is sized well above the real payload so that a slightly
 * verbose reply is never truncated — truncation would fail schema validation
 * and cost a full regeneration, which is far more expensive than the headroom.
 */
export const MAX_TOKENS = {
  /**
   * A learner-facing chat reply, and the final answer of a tool loop. Typical
   * replies run a few hundred tokens; a detailed grammar explanation with
   * examples is the long tail. Also covers the structured features that share
   * the tool loop, the largest of which (vocabulary_explanation: meaning,
   * translation, pronunciation, collocations, synonyms, antonyms, common
   * mistakes, memory tips, examples, grammar notes) lands well under this.
   */
  tutoChat: 2000,
  /** assessment (2-3 sentences) + 2 strengths + 2 growth areas + 3 next-focus items: roughly 270 tokens of content. */
  tutoInsights: 1000,
  /** One encouragement line + exactly 3 tips of one to two sentences: roughly 175 tokens of content. */
  tutoCoaching: 800,
  /**
   * `{ outcome: enum, confidence: number }` and nothing else -- about 20
   * tokens of JSON. Capped despite being tiny because an omitted ceiling is
   * what triggers the 65k credit pre-authorisation, and this call fires on
   * every single Tuto turn.
   */
  turnClassifier: 100,
  /** Two to four short sentences summarising already-written conversation history. */
  conversationSummariser: 200,
} as const;
