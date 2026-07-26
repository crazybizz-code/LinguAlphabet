import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";
import { createContentRepository, type ContentRepository } from "./content-repository";
import { createConversationRepository, type ConversationRepository } from "./conversation-repository";
import { createLearnerRepository, type LearnerRepository } from "./learner-repository";

/**
 * The single bundle every AI service/tool-loop/tool call site depends on
 * — introduced now, while ContentRepository was still the only
 * repository, specifically so adding a fourth (Progress, Vocabulary,
 * Mission) is one new field here plus one line in createAIDependencies(),
 * never a signature change to generateResponse()/runToolLoop()/
 * ToolExecutionContext or any route that already calls them.
 */
export interface AIDependencies {
  contentRepository: ContentRepository;
  conversationRepository: ConversationRepository;
  learnerRepository: LearnerRepository;
}

/**
 * The one place every AI route builds its repositories. Requires a real
 * userId (resolved server-side from the authenticated session — never
 * accepted as a client-supplied value) because ConversationRepository and
 * LearnerRepository both scope their reads/writes to a specific learner;
 * ContentRepository doesn't need one, content isn't per-user.
 */
export function createAIDependencies(supabase: SupabaseClient<Database>, userId: string): AIDependencies {
  return {
    contentRepository: createContentRepository(supabase),
    conversationRepository: createConversationRepository(supabase, userId),
    learnerRepository: createLearnerRepository(supabase, userId),
  };
}
