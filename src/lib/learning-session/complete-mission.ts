"use server";

import { createClient } from "@/lib/supabase/server";
import { applyXp, computeXpEarned } from "./xp";
import { applyStreak } from "./streak";

export interface CompleteMissionResult {
  xpEarned: number;
  newLevel: number;
  leveledUp: boolean;
  newStreak: number;
  streakContinued: boolean;
  isMission: boolean;
}

/**
 * The one write path for "a learner finished a Learning Session" —
 * content-type agnostic (just a contentId + minutes + optional quiz
 * result), so a future Article/Story/Video session calls this exact same
 * action. Owns every real side effect docs/domain-user-flows.md's A6/A7
 * describe: marks Progress complete, awards XP (docs/domain-model.md
 * §20), and advances Streak only if this was today's guided Daily
 * Mission (§19) — a casual Explore completion still earns XP, just less,
 * and never touches the streak.
 */
export async function completeMission(params: {
  contentId: string;
  estimatedMinutes: number;
  correctAnswers: number;
  quizTotal: number;
}): Promise<CompleteMissionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const today = new Date().toISOString().slice(0, 10);
  const nowIso = new Date().toISOString();

  const [{ data: profile }, { data: missionRow }] = await Promise.all([
    supabase.from("profiles").select("*").eq("user_id", user.id).single(),
    supabase.from("daily_missions").select("*").eq("user_id", user.id).eq("mission_date", today).maybeSingle(),
  ]);

  const isMission = missionRow?.content_item_id === params.contentId;

  const xpEarned = computeXpEarned({ isMission, correctAnswers: params.correctAnswers });
  const xpResult = applyXp({
    currentXp: profile?.xp ?? 0,
    currentLevel: profile?.level ?? 1,
    currentXpToNext: profile?.xp_to_next ?? 300,
    xpEarned,
  });
  const streakResult = applyStreak({
    currentStreak: profile?.streak ?? 0,
    longestStreak: profile?.longest_streak ?? 0,
    lastStudyDate: profile?.last_study_date ?? null,
    isMission,
  });

  await Promise.all([
    supabase.from("progress").upsert(
      {
        user_id: user.id,
        content_item_id: params.contentId,
        completed: true,
        position_seconds: Math.round(params.estimatedMinutes * 60),
        updated_at: nowIso,
      },
      { onConflict: "user_id,content_item_id" },
    ),
    supabase
      .from("profiles")
      .update({
        xp: xpResult.newXp,
        level: xpResult.newLevel,
        xp_to_next: xpResult.newXpToNext,
        streak: streakResult.newStreak,
        longest_streak: streakResult.newLongestStreak,
        last_study_date: today,
        total_minutes: (profile?.total_minutes ?? 0) + Math.round(params.estimatedMinutes),
      })
      .eq("user_id", user.id),
  ]);

  return {
    xpEarned,
    newLevel: xpResult.newLevel,
    leveledUp: xpResult.leveledUp,
    newStreak: streakResult.newStreak,
    streakContinued: streakResult.streakContinued,
    isMission,
  };
}

/** Persists an optional free-text reflection into the existing `notes` table
 * (supabase-schema.sql) — no new schema needed, the Reflection step's answer
 * is just a note scoped to this content item. */
export async function saveReflection(params: { contentId: string; contentTitle: string; content: string }): Promise<void> {
  if (!params.content.trim()) return;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  await supabase.from("notes").insert({
    user_id: user.id,
    content_item_id: params.contentId,
    content_item_title: params.contentTitle,
    content: params.content.trim(),
  });
}
