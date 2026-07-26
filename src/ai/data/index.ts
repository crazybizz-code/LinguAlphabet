/**
 * src/ai/data — the AI system's permanent data access layer. Every AI
 * tool/service depends on a repository interface from here, never on
 * Supabase (or any other store) directly, so "where the data actually
 * comes from" can change without touching src/ai/tools, src/ai/services,
 * or src/ai/prompts.
 *
 * Four repositories today, bundled as one AIDependencies object
 * (./dependencies.ts) so a caller threads a single field through the
 * service/tool-loop/tool layers rather than one optional param per
 * repository:
 *  - ContentRepository — real article/podcast/quiz content.
 *  - ConversationRepository — session-scoped Conversation Memory (recent
 *    messages, current content) — see its own doc comment for why this is
 *    deliberately never mixed with LearnerRepository.
 *  - SignalRepository — the append-only evidence log (Phase 3): every
 *    objective learner interaction records zero or more signals here.
 *    Repositories store signals, never conclusions.
 *  - LearnerRepository — persistent, cross-session Learner Memory. Never
 *    stores its own conclusions either — it summarizes SignalRepository's
 *    signals into a LearnerProfile, on read.
 *
 * Adding a fifth (Progress, Vocabulary, Mission) follows the same shape:
 * one new `<domain>-repository.ts`, one new field on AIDependencies, one
 * line in createAIDependencies() — see docs/ai-coach-audit.md for why
 * this codebase deliberately doesn't pre-build repositories ahead of a
 * real caller needing them.
 */
export type { ContentRepository, AIArticleSummary, AIPodcastSummary, AITranscriptSegment, AIQuiz, AIQuizQuestion, AIAvailableContentSummary } from "./content-repository";
export { createContentRepository } from "./content-repository";

export type { ConversationRepository, ConversationMemory, ConversationMemoryMessage, ConversationCurrentContent } from "./conversation-repository";
export { createConversationRepository, MAX_REMEMBERED_MESSAGES } from "./conversation-repository";

export type { SignalRepository, LearningSignal, SignalType, SignalSkill, SignalSource, ListRecentSignalsOptions } from "./signal-repository";
export { createSignalRepository, SIGNAL_TYPES } from "./signal-repository";

export type { LearnerRepository } from "./learner-repository";
export { createLearnerRepository } from "./learner-repository";

export type { AIDependencies } from "./dependencies";
export { createAIDependencies } from "./dependencies";
