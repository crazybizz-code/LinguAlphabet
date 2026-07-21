/**
 * Scaffolding only (Sprint 1 rule: no memory implementation). Defines the
 * contract a future memory store — short-term conversation summarization,
 * long-term learner-profile facts, etc. — will implement, so the AI
 * Service can be written against this interface today and a real
 * implementation dropped in later without touching call sites. See
 * docs/ai-architecture.md's "How memory will work" section.
 */
export interface MemoryStore {
  get(conversationId: string): Promise<string | null>;
  set(conversationId: string, summary: string): Promise<void>;
}
