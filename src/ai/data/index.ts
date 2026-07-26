/**
 * src/ai/data — the AI system's permanent data access layer. Every AI
 * tool/service depends on a repository interface from here, never on
 * Supabase (or any other store) directly, so "where the data actually
 * comes from" can change without touching src/ai/tools, src/ai/services,
 * or src/ai/prompts. Today that's one repository, ContentRepository; see
 * its doc comment in ./content-repository.ts for the convention future
 * repositories (Learner, Progress, Vocabulary, Mission) should follow
 * once something real needs to call them.
 */
export type { ContentRepository, AIArticleSummary, AIPodcastSummary, AITranscriptSegment, AIQuiz, AIQuizQuestion } from "./content-repository";
export { createContentRepository } from "./content-repository";
