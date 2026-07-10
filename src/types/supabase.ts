/**
 * Hand-written from supabase-schema.sql + supabase/onboarding-fields.sql +
 * supabase/content-schema.sql. Regenerate this for real once the Supabase
 * project is linked via the CLI:
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
          total_minutes: number;
          tuto_name: string;
          /** CEFR code (A1-C2) collected by onboarding — see supabase/onboarding-fields.sql. */
          english_level: string | null;
          goal: string | null;
          daily_time_minutes: number | null;
          interests: string[];
          onboarding_completed: boolean;
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
          total_minutes?: number;
          tuto_name?: string;
          english_level?: string | null;
          goal?: string | null;
          daily_time_minutes?: number | null;
          interests?: string[];
          onboarding_completed?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["profiles"]["Insert"]>;
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
          content_item_id: string;
          is_resume: boolean;
          created_at: string;
        };
        Insert: {
          user_id: string;
          mission_date: string;
          content_item_id: string;
          is_resume?: boolean;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["daily_missions"]["Insert"]>;
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
