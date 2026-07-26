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

export interface ConversationMemory {
  recentMessages: ConversationMemoryMessage[];
  /** Whatever content the learner was engaged with when this memory was last saved — lets a resumed conversation reference "that article" without the learner re-establishing it. */
  currentContent: ConversationCurrentContent | null;
}

/**
 * Conversation Memory — scoped to a single ongoing conversation, never the
 * learner's durable history (that's LearnerRepository, a deliberately
 * separate system — see docs/ai-coach-audit.md's Phase 2 model). Exists
 * purely to optimize continuity of *this* interaction: recent messages
 * plus what content was in view. Nothing here is meant to outlive or
 * summarize a learner's whole relationship with Tuto.
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
      .select("recent_messages, current_content")
      .eq("user_id", this.userId)
      .eq("conversation_id", conversationId)
      .maybeSingle();

    if (!data) return null;

    return {
      recentMessages: (data.recent_messages ?? []) as unknown as ConversationMemoryMessage[],
      currentContent: (data.current_content ?? null) as unknown as ConversationCurrentContent | null,
    };
  }

  async save(conversationId: string, memory: ConversationMemory): Promise<void> {
    await this.supabase.from("ai_conversation_memory").upsert(
      {
        user_id: this.userId,
        conversation_id: conversationId,
        recent_messages: memory.recentMessages.slice(-MAX_REMEMBERED_MESSAGES) as unknown as Json,
        current_content: memory.currentContent as unknown as Json | null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,conversation_id" },
    );
  }
}

export function createConversationRepository(supabase: SupabaseClient<Database>, userId: string): ConversationRepository {
  return new SupabaseConversationRepository(supabase, userId);
}
