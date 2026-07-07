/**
 * Hand-written from supabase-schema.sql — covers every table currently
 * defined there. Regenerate this for real once the Supabase project is
 * linked via the CLI:
 *
 *   npx supabase gen types typescript --project-id <ref> > src/types/supabase.ts
 *
 * Until then, keep this in sync by hand whenever supabase-schema.sql
 * changes.
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
          last_study_date: string | null;
          total_minutes: number;
          tuto_name: string;
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
          last_study_date?: string | null;
          total_minutes?: number;
          tuto_name?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["profiles"]["Insert"]>;
      };
      progress: {
        Row: {
          id: string;
          user_id: string;
          podcast_id: string;
          position_seconds: number;
          completed: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          podcast_id: string;
          position_seconds?: number;
          completed?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["progress"]["Insert"]>;
      };
      notes: {
        Row: {
          id: string;
          user_id: string;
          podcast_id: string | null;
          podcast_title: string | null;
          content: string;
          timestamp_seconds: number | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          podcast_id?: string | null;
          podcast_title?: string | null;
          content: string;
          timestamp_seconds?: number | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["notes"]["Insert"]>;
      };
      bookmarks: {
        Row: {
          id: string;
          user_id: string;
          podcast_id: string;
          podcast_title: string | null;
          position_seconds: number;
          label: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          podcast_id: string;
          podcast_title?: string | null;
          position_seconds: number;
          label?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["bookmarks"]["Insert"]>;
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
          source_podcast_id: string | null;
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
          source_podcast_id?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["vocabulary"]["Insert"]>;
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
      };
    };
  };
}
