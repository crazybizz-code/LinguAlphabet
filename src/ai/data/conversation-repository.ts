import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/types/supabase";

/** Bounded so a rehydrated conversation stays a recap, not a full transcript replayed into every future prompt. */
export const MAX_REMEMBERED_MESSAGES = 12;

export interface ConversationMemoryMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ConversationCurrentContent {
  contentType: "article" | "podcast";
  id: string;
  title: string;
}

/**
 * Session-scoped runtime progress through a LearningSessionPlan (Phase 7
 * — src/ai/learning-orchestrator) — which step the live lesson is on,
 * how many exchanges have happened on it, which review points have
 * already been raised. Defined here, in the data layer, rather than in
 * src/ai/learning-orchestrator, so the dependency points the same
 * direction as everywhere else in src/ai: higher-level engines import
 * shapes FROM src/ai/data, this module never imports from them.
 *
 * Stored alongside recentMessages/currentContent because it shares the
 * exact same lifecycle and key (one row per conversation) — but kept as
 * its own field, never blended into either of theirs, since "the Session
 * Plan is static, the Orchestrator is dynamic" (Phase 7) is a real
 * separation of responsibility, not just a storage convenience.
 */
export interface OrchestratorRuntimeState {
  currentStepIndex: number;
  exchangesOnCurrentStep: number;
  /** Indexes into the originating LearningSessionPlan.reviewPoints array — which ones this conversation has already surfaced, so none gets raised twice. */
  reviewPointsRaised: number[];
}

export const INITIAL_ORCHESTRATOR_STATE: OrchestratorRuntimeState = {
  currentStepIndex: 0,
  exchangesOnCurrentStep: 0,
  reviewPointsRaised: [],
};

export interface ConversationMemory {
  recentMessages: ConversationMemoryMessage[];
  /** Whatever content the learner was engaged with when this memory was last saved — lets a resumed conversation reference "that article" without the learner re-establishing it. */
  currentContent: ConversationCurrentContent | null;
  /** Null until a Learning Session Plan's first turn runs — see INITIAL_ORCHESTRATOR_STATE. */
  orchestratorState: OrchestratorRuntimeState | null;
}

/**
 * Conversation Memory — scoped to a single ongoing conversation, never the
 * learner's durable history (that's LearnerRepository, a deliberately
 * separate system — see docs/ai-coach-audit.md's Phase 2 model). Exists
 * purely to optimize continuity of *this* interaction: recent messages,
 * what content was in view, and (Phase 7) how far the live lesson has
 * progressed. Nothing here is meant to outlive or summarize a learner's
 * whole relationship with Tuto.
 */
export interface ConversationRepository {
  get(conversationId: string): Promise<ConversationMemory | null>;
  save(conversationId: string, memory: ConversationMemory): Promise<void>;
}

class SupabaseConversationRepository implements ConversationRepository {
  constructor(
    private readonly supabase: SupabaseClient<Database>,
    private readonly userId: string,
  ) {}

  async get(conversationId: string): Promise<ConversationMemory | null> {
    const { data } = await this.supabase
      .from("ai_conversation_memory")
      .select("recent_messages, current_content, orchestrator_state")
      .eq("user_id", this.userId)
      .eq("conversation_id", conversationId)
      .maybeSingle();

    if (!data) return null;

    return {
      recentMessages: (data.recent_messages ?? []) as unknown as ConversationMemoryMessage[],
      currentContent: (data.current_content ?? null) as unknown as ConversationCurrentContent | null,
      orchestratorState: (data.orchestrator_state ?? null) as unknown as OrchestratorRuntimeState | null,
    };
  }

  async save(conversationId: string, memory: ConversationMemory): Promise<void> {
    await this.supabase.from("ai_conversation_memory").upsert(
      {
        user_id: this.userId,
        conversation_id: conversationId,
        recent_messages: memory.recentMessages.slice(-MAX_REMEMBERED_MESSAGES) as unknown as Json,
        current_content: memory.currentContent as unknown as Json | null,
        orchestrator_state: memory.orchestratorState as unknown as Json | null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,conversation_id" },
    );
  }
}

export function createConversationRepository(supabase: SupabaseClient<Database>, userId: string): ConversationRepository {
  return new SupabaseConversationRepository(supabase, userId);
}
