/**
 * Hand-written from supabase-schema.sql + supabase/onboarding-fields.sql +
 * supabase/content-schema.sql + supabase/ai-conversation-memory-schema.sql +
 * supabase/learning-signals-schema.sql + supabase/orchestrator-state-schema.sql.
 * Regenerate this for real once the Supabase project is linked via the CLI:
 *
 *   npx supabase gen types typescript --project-id <ref> > src/types/supabase.ts
 *
 * Until then, keep this in sync by hand whenever those files change.
 */

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          user_id: string;
          username: string;
          avatar_url: string | null;
          level: number;
          xp: number;
          xp_to_next: number;
          streak: number;
          /** docs/domain-model.md §19 — supabase/progress-schema.sql. */
          longest_streak: number;
          last_study_date: string | null;
          /** Banked "streak shields" — see supabase/streak-shield-schema.sql. */
          streak_shields: number;
          total_minutes: number;
          tuto_name: string;
          /** CEFR code (A1-C2) collected by onboarding — see supabase/onboarding-fields.sql. */
          english_level: string | null;
          goal: string | null;
          daily_time_minutes: number | null;
          /** IELTS onboarding — see supabase/ielts-onboarding-fields.sql. Null band means "not known yet", never a default. */
          exam_type: string | null;
          current_band: number | null;
          target_band: number | null;
          exam_timeline: string | null;
          /** A booked exam date, when the learner has one — see supabase/exam-date.sql. Null falls back to exam_timeline, never to a derived guess. */
          exam_date: string | null;
          interests: string[];
          /** The wizard was answered. Gates every authenticated route. */
          onboarding_completed: boolean;
          /** The placement assessment was completed and a plan generated — see supabase/placement-assessment-flag.sql. */
          placement_completed: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          username?: string;
          avatar_url?: string | null;
          level?: number;
          xp?: number;
          xp_to_next?: number;
          streak?: number;
          longest_streak?: number;
          last_study_date?: string | null;
          streak_shields?: number;
          total_minutes?: number;
          tuto_name?: string;
          english_level?: string | null;
          goal?: string | null;
          daily_time_minutes?: number | null;
          exam_type?: string | null;
          current_band?: number | null;
          target_band?: number | null;
          exam_timeline?: string | null;
          exam_date?: string | null;
          interests?: string[];
          onboarding_completed?: boolean;
          placement_completed?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["profiles"]["Insert"]>;
        Relationships: [];
      };
      /** src/ai/data's ConversationRepository — Conversation Memory, see supabase/ai-conversation-memory-schema.sql. orchestrator_state added by supabase/orchestrator-state-schema.sql (Phase 7). */
      ai_conversation_memory: {
        Row: {
          user_id: string;
          conversation_id: string;
          recent_messages: Json;
          current_content: Json | null;
          orchestrator_state: Json | null;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          conversation_id: string;
          recent_messages?: Json;
          current_content?: Json | null;
          orchestrator_state?: Json | null;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["ai_conversation_memory"]["Insert"]>;
        Relationships: [];
      };
      /** src/ai/data's SignalRepository — append-only evidence log, see supabase/learning-signals-schema.sql. No Update type: signals are never mutated once written. */
      learning_signals: {
        Row: {
          id: string;
          user_id: string;
          type: string;
          topic: string | null;
          skill: string | null;
          evidence: Json;
          source: string;
          confidence: number | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          type: string;
          topic?: string | null;
          skill?: string | null;
          evidence?: Json;
          source: string;
          confidence?: number | null;
          created_at?: string;
        };
        Update: never;
        Relationships: [];
      };
      /** Product Intelligence Sprint — src/lib/analytics/events.ts is the source of truth for event_name/properties shapes. */
      ai_usage_events: {
        Row: {
          id: string;
          model: string;
          feature: string;
          input_tokens: number | null;
          output_tokens: number | null;
          total_tokens: number | null;
          latency_ms: number;
          estimated_cost_usd: number | null;
          ok: boolean;
          streamed: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          model: string;
          feature: string;
          input_tokens?: number | null;
          output_tokens?: number | null;
          total_tokens?: number | null;
          latency_ms: number;
          estimated_cost_usd?: number | null;
          ok?: boolean;
          streamed?: boolean;
          created_at?: string;
        };
        Update: never;
        Relationships: [];
      };
      analytics_events: {
        Row: {
          id: string;
          user_id: string;
          event_name: string;
          properties: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          event_name: string;
          properties?: Json;
          created_at?: string;
        };
        Update: never;
        Relationships: [];
      };
      content_items: {
        Row: {
          id: string;
          content_type: "podcast" | "article" | "story" | "video" | "news" | "conversation" | "challenge";
          title: string;
          description: string | null;
          cefr_level_min: string;
          cefr_level_max: string;
          topics: string[];
          skills: string[];
          goal_alignment: string[];
          tags: string[];
          estimated_time_minutes: number;
          thumbnail_url: string | null;
          status: "draft" | "published" | "coming_soon";
          featured: boolean;
          premium: boolean;
          published_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          content_type: Database["public"]["Tables"]["content_items"]["Row"]["content_type"];
          title: string;
          description?: string | null;
          cefr_level_min: string;
          cefr_level_max: string;
          topics?: string[];
          skills?: string[];
          goal_alignment?: string[];
          tags?: string[];
          estimated_time_minutes: number;
          thumbnail_url?: string | null;
          status?: Database["public"]["Tables"]["content_items"]["Row"]["status"];
          featured?: boolean;
          premium?: boolean;
          published_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["content_items"]["Insert"]>;
        Relationships: [];
      };
      podcast_details: {
        Row: {
          content_item_id: string;
          audio_url: string;
          duration_seconds: number;
          transcript: Json;
          /** Provenance + content-identity dedup — see supabase/podcast-provenance.sql. */
          source_url: string | null;
          licence: string | null;
          attribution: string | null;
          transcript_provenance: string | null;
          transcript_hash: string | null;
          summary: string | null;
          takeaways: Json;
          vocabulary: Json;
          quiz: Json;
          reflection: string | null;
        };
        Insert: {
          content_item_id: string;
          audio_url: string;
          duration_seconds: number;
          transcript?: Json;
          summary?: string | null;
          takeaways?: Json;
          vocabulary?: Json;
          quiz?: Json;
          reflection?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["podcast_details"]["Insert"]>;
        Relationships: [];
      };
      article_details: {
        Row: {
          content_item_id: string;
          body: string;
          source_url: string | null;
          author: string | null;
          reading_time_minutes: number;
          summary: string | null;
          takeaways: Json;
          vocabulary: Json;
          quiz: Json;
          reflection: string | null;
        };
        Insert: {
          content_item_id: string;
          body: string;
          source_url?: string | null;
          author?: string | null;
          reading_time_minutes: number;
          summary?: string | null;
          takeaways?: Json;
          vocabulary?: Json;
          quiz?: Json;
          reflection?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["article_details"]["Insert"]>;
        Relationships: [];
      };
      progress: {
        Row: {
          id: string;
          user_id: string;
          content_item_id: string;
          position_seconds: number;
          completed: boolean;
          xp_earned: number;
          quiz_score: number | null;
          quiz_total: number | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          content_item_id: string;
          position_seconds?: number;
          completed?: boolean;
          xp_earned?: number;
          quiz_score?: number | null;
          quiz_total?: number | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["progress"]["Insert"]>;
        Relationships: [];
      };
      notes: {
        Row: {
          id: string;
          user_id: string;
          content_item_id: string | null;
          content_item_title: string | null;
          content: string;
          timestamp_seconds: number | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          content_item_id?: string | null;
          content_item_title?: string | null;
          content: string;
          timestamp_seconds?: number | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["notes"]["Insert"]>;
        Relationships: [];
      };
      bookmarks: {
        Row: {
          id: string;
          user_id: string;
          content_item_id: string;
          content_item_title: string | null;
          position_seconds: number;
          label: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          content_item_id: string;
          content_item_title?: string | null;
          position_seconds: number;
          label?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["bookmarks"]["Insert"]>;
        Relationships: [];
      };
      /** Web Push subscriptions — see supabase/push-subscriptions-schema.sql. */
      push_subscriptions: {
        Row: {
          id: string;
          user_id: string;
          endpoint: string;
          p256dh: string;
          auth: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          endpoint: string;
          p256dh: string;
          auth: string;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["push_subscriptions"]["Insert"]>;
        Relationships: [];
      };
      vocabulary: {
        Row: {
          id: string;
          user_id: string;
          word: string;
          definition: string | null;
          phonetic: string | null;
          pos: string | null;
          translations: Json | null;
          example: string | null;
          source_content_item_id: string | null;
          created_at: string;
          /** Leitner box (1-5) — spaced-repetition review progress (supabase/vocabulary-review-schema.sql). */
          box: number;
          due_date: string;
          last_reviewed_at: string | null;
        };
        Insert: {
          id?: string;
          user_id: string;
          word: string;
          definition?: string | null;
          phonetic?: string | null;
          pos?: string | null;
          translations?: Json | null;
          example?: string | null;
          source_content_item_id?: string | null;
          created_at?: string;
          box?: number;
          due_date?: string;
          last_reviewed_at?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["vocabulary"]["Insert"]>;
        Relationships: [];
      };
      achievements: {
        Row: {
          id: string;
          user_id: string;
          achievement_id: string;
          earned_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          achievement_id: string;
          earned_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["achievements"]["Insert"]>;
        Relationships: [];
      };
      daily_missions: {
        Row: {
          user_id: string;
          mission_date: string;
          content_type: "article" | "podcast";
          content_item_id: string;
          is_resume: boolean;
          created_at: string;
        };
        Insert: {
          user_id: string;
          mission_date: string;
          content_type: "article" | "podcast";
          content_item_id: string;
          is_resume?: boolean;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["daily_missions"]["Insert"]>;
        Relationships: [];
      };
      content_sources: {
        Row: {
          id: string;
          provider_id: string;
          name: string;
          config: Json;
          enabled: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          provider_id: string;
          name: string;
          config?: Json;
          enabled?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["content_sources"]["Insert"]>;
        Relationships: [];
      };
      content_raw_items: {
        Row: {
          id: string;
          source_id: string;
          external_id: string;
          raw_payload: Json;
          /** The RawContentItem this row was staged from — lets an unfinished item be replayed without refetching. Null on rows written before the retry migration. */
          normalized_item: Json | null;
          fetched_at: string;
          processed_at: string | null;
          content_item_id: string | null;
          status:
            | "QUEUED"
            | "FETCHED"
            | "NORMALIZED"
            | "AI_ENRICHED"
            | "QUALITY_GATE_FAILED"
            | "PUBLISHED"
            | "FAILED"
            | "RETRY_PENDING"
            | "DUPLICATE";
          rejection_reason: string | null;
          quality_gate_reasons: Json | null;
          gemini_error: string | null;
          normalization_error: string | null;
          stage_updated_at: string;
          content_hash: string | null;
          canonical_url: string | null;
        };
        Insert: {
          id?: string;
          source_id: string;
          external_id: string;
          raw_payload: Json;
          normalized_item?: Json | null;
          fetched_at?: string;
          processed_at?: string | null;
          content_item_id?: string | null;
          status?: Database["public"]["Tables"]["content_raw_items"]["Row"]["status"];
          rejection_reason?: string | null;
          quality_gate_reasons?: Json | null;
          gemini_error?: string | null;
          normalization_error?: string | null;
          stage_updated_at?: string;
          content_hash?: string | null;
          canonical_url?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["content_raw_items"]["Insert"]>;
        Relationships: [];
      };
      content_ingestion_runs: {
        Row: {
          id: string;
          source_id: string;
          started_at: string;
          completed_at: string | null;
          items_fetched: number;
          items_published: number;
          items_rejected: number;
          status: "running" | "completed" | "failed";
          error: Json | null;
        };
        Insert: {
          id?: string;
          source_id: string;
          started_at?: string;
          completed_at?: string | null;
          items_fetched?: number;
          items_published?: number;
          items_rejected?: number;
          status?: "running" | "completed" | "failed";
          error?: Json | null;
        };
        Update: Partial<Database["public"]["Tables"]["content_ingestion_runs"]["Insert"]>;
        Relationships: [];
      };
    };
    Views: {
      leaderboard: {
        Row: {
          username: string;
          xp: number;
          level: number;
          streak: number;
          avatar_url: string | null;
          rank: number;
        };
        Relationships: [];
      };
    };
    Functions: Record<string, never>;
  };
}
