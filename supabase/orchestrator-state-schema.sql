-- Orchestrator runtime state (Phase 7 — docs/learning-signal-specification.md's
-- sibling architecture docs; src/ai/learning-orchestrator)
--
-- Adds one column to the existing ai_conversation_memory table
-- (supabase/ai-conversation-memory-schema.sql) rather than a new table:
-- this state shares that table's exact lifecycle and key
-- (user_id, conversation_id) — it's the Orchestrator's live progress
-- through a LearningSessionPlan, session-scoped in exactly the same way
-- recent_messages/current_content already are. Kept as its own column
-- and its own type (OrchestratorRuntimeState, src/ai/data/conversation-repository.ts)
-- rather than folded into either existing one — "the Session Plan is
-- static, the Orchestrator is dynamic" is a real separation of
-- responsibility, not just a storage convenience.

alter table public.ai_conversation_memory
  add column if not exists orchestrator_state jsonb;
