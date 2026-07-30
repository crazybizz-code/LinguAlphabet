"use server";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";
import { createClient } from "@/lib/supabase/server";
import { createSignalRepository, type LearningSignal } from "@/ai/data";
import { recordEvent } from "@/lib/analytics/record";
import { applyXp, computeXpEarned } from "./xp";
import { applyStreak } from "./streak";

export type StreakStatus = "started" | "grew" | "same" | "reset";

export interface CompleteMissionResult {
  xpEarned: number;
  newLevel: number;
  leveledUp: boolean;
  newStreak: number;
  streakContinued: boolean;
  isMission: boolean;
  /** True only when the learner had zero completed sessions before this one — the whole product's very first "you did it" moment. */
  isFirstSession: boolean;
  /**
   * Sprint Learning Polish 1 ("Streak Truth"): purely derived from numbers
   * already computed by applyStreak — no new data, no new mechanic. Lets
   * the Complete screen say what actually happened instead of showing the
   * same bare number whether the streak grew, stayed flat, or reset.
   */
  streakStatus: StreakStatus;
  /** Execution Sprint P1 — see src/lib/learning-session/streak.ts's Streak Shield doc comment. */
  shieldEarned: boolean;
  shieldUsed: boolean;
}

/** Honest classification of what a streak update actually did — see StreakStatus. */
function deriveStreakStatus(params: { previousStreak: number; newStreak: number; streakContinued: boolean }): StreakStatus {
  if (params.streakContinued) return params.previousStreak === 0 ? "started" : "grew";
  if (params.newStreak === 1 && params.previousStreak > 1) return "reset";
  return "same";
}

/**
 * Objective, evidence-based signals (Phase 3): a session genuinely
 * finishing, and — when a quiz ran — the real score, are exactly the kind
 * of mechanical fact this phase's signal taxonomy is for. `confidence` is
 * null on every one of these: they're facts, not estimates. Best-effort —
 * a signal-write failure must never turn a real completion into a
 * reported failure for the learner.
 */
async function recordCompletionSignals(
  supabase: SupabaseClient<Database>,
  userId: string,
  params: { contentId: string; contentType: "article" | "podcast"; estimatedMinutes: number; correctAnswers: number; quizTotal: number },
): Promise<void> {
  const signalRepository = createSignalRepository(supabase, userId);
  const completionEvidence = { contentId: params.contentId, estimatedMinutes: params.estimatedMinutes };

  const signals: Omit<LearningSignal, "createdAt">[] = [
    {
      type: params.contentType === "podcast" ? "podcast_completed" : "article_completed",
      topic: null,
      skill: params.contentType === "podcast" ? "listening" : "reading",
      evidence: completionEvidence,
      source: "content_session",
      confidence: null,
    },
  ];

  if (params.quizTotal > 0) {
    signals.push({
      type: "quiz_completed",
      topic: null,
      skill: null,
      evidence: { contentId: params.contentId, correctAnswers: params.correctAnswers, quizTotal: params.quizTotal },
      source: "content_session",
      confidence: null,
    });
  }

  try {
    await Promise.all(signals.map((signal) => signalRepository.record(signal)));
  } catch {
    // Best-effort — see doc comment above.
  }
}

/**
 * Product Intelligence Sprint — the analytics counterpart to
 * recordCompletionSignals above: lesson_completed always, plus whichever
 * of streak_reset/streak_shield_earned/streak_shield_used actually
 * happened this completion (deriveStreakStatus/applyStreak's booleans
 * are mutually exclusive per call, so at most one of the three fires).
 */
async function recordCompletionAnalytics(
  supabase: SupabaseClient<Database>,
  userId: string,
  params: {
    contentId: string;
    contentType: "article" | "podcast";
    isMission: boolean;
    xpEarned: number;
    quizScore: number;
    quizTotal: number;
    estimatedMinutes: number;
    streakStatus: StreakStatus;
    streakResult: ReturnType<typeof applyStreak>;
    previousStreak: number;
  },
): Promise<void> {
  await recordEvent(supabase, userId, {
    name: "lesson_completed",
    properties: {
      contentId: params.contentId,
      contentType: params.contentType,
      isMission: params.isMission,
      xpEarned: params.xpEarned,
      quizScore: params.quizScore,
      quizTotal: params.quizTotal,
      durationMinutes: Math.round(params.estimatedMinutes),
      streakAfter: params.streakResult.newStreak,
    },
  });

  if (params.streakStatus === "reset") {
    await recordEvent(supabase, userId, {
      name: "streak_reset",
      properties: { previousStreak: params.previousStreak, longestStreak: params.streakResult.newLongestStreak },
    });
  }
  if (params.streakResult.shieldEarned) {
    await recordEvent(supabase, userId, { name: "streak_shield_earned", properties: {} });
  }
  if (params.streakResult.shieldUsed) {
    await recordEvent(supabase, userId, { name: "streak_shield_used", properties: { streakAfter: params.streakResult.newStreak } });
  }
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
 *
 * xp_earned/quiz_score/quiz_total are persisted onto the same progress row
 * (supabase/daily-activity-schema.sql) so the Learning Calendar's Daily
 * Activity panel can show real per-completion numbers instead of recomputing
 * or guessing them later.
 *
 * Also the one place article_completed/podcast_completed/quiz_completed
 * signals (Phase 3 — docs/ai-coach-audit.md) get recorded: this action
 * already has the real evidence (which content, whether a quiz ran, the
 * actual score) the moment a session genuinely finishes, so no separate
 * instrumentation is needed. `contentType` is required only to label
 * which completion signal to write — everything else about the function
 * is unchanged.
 */
export async function completeMission(params: {
  contentId: string;
  contentType: "article" | "podcast";
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

  const [{ data: profile }, { data: missionRows }, { data: priorCompletedRows }] = await Promise.all([
    supabase.from("profiles").select("*").eq("user_id", user.id).single(),
    supabase.from("daily_missions").select("*").eq("user_id", user.id).eq("mission_date", today),
    // Same "progress" table + "completed" filter the Progress page already
    // counts from (src/app/(app)/progress/page.tsx) — read here, before
    // this session's own upsert, purely to know whether this is the
    // learner's first-ever completion.
    supabase.from("progress").select("content_item_id").eq("user_id", user.id).eq("completed", true),
  ]);

  // Today's Mission is a finite daily plan of two independent slots
  // (article + podcast, docs/content-lifecycle.md §5) — completing either
  // one counts as "today's guided mission" for streak/XP purposes.
  const isMission = (missionRows ?? []).some((row) => row.content_item_id === params.contentId);
  const isFirstSession = (priorCompletedRows ?? []).length === 0;

  const xpEarned = computeXpEarned({ isMission, correctAnswers: params.correctAnswers });
  const xpResult = applyXp({
    currentXp: profile?.xp ?? 0,
    currentLevel: profile?.level ?? 1,
    currentXpToNext: profile?.xp_to_next ?? 300,
    xpEarned,
  });
  const previousStreak = profile?.streak ?? 0;
  const streakResult = applyStreak({
    currentStreak: previousStreak,
    longestStreak: profile?.longest_streak ?? 0,
    lastStudyDate: profile?.last_study_date ?? null,
    isMission,
    shields: profile?.streak_shields ?? 0,
  });
  const streakStatus = deriveStreakStatus({
    previousStreak,
    newStreak: streakResult.newStreak,
    streakContinued: streakResult.streakContinued,
  });

  await Promise.all([
    supabase.from("progress").upsert(
      {
        user_id: user.id,
        content_item_id: params.contentId,
        completed: true,
        position_seconds: Math.round(params.estimatedMinutes * 60),
        xp_earned: xpEarned,
        quiz_score: params.quizTotal > 0 ? params.correctAnswers : null,
        quiz_total: params.quizTotal > 0 ? params.quizTotal : null,
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
        streak_shields: streakResult.newShields,
        // Bug fix (Execution Sprint P1): this used to write `today`
        // unconditionally, even for a casual (non-mission) completion —
        // which silently let a casual-only day count as "consecutive" for
        // a *future* mission completion's streak math, exactly the
        // casual-inflation the mission-gating above exists to prevent.
        // Only a real mission completion should ever advance this.
        ...(isMission ? { last_study_date: today } : {}),
        total_minutes: (profile?.total_minutes ?? 0) + Math.round(params.estimatedMinutes),
      })
      .eq("user_id", user.id),
  ]);

  await recordCompletionSignals(supabase, user.id, params);
  await recordCompletionAnalytics(supabase, user.id, {
    contentId: params.contentId,
    contentType: params.contentType,
    isMission,
    xpEarned,
    quizScore: params.correctAnswers,
    quizTotal: params.quizTotal,
    estimatedMinutes: params.estimatedMinutes,
    streakStatus,
    streakResult,
    previousStreak,
  });

  return {
    xpEarned,
    newLevel: xpResult.newLevel,
    leveledUp: xpResult.leveledUp,
    newStreak: streakResult.newStreak,
    streakContinued: streakResult.streakContinued,
    isMission,
    isFirstSession,
    streakStatus,
    shieldEarned: streakResult.shieldEarned,
    shieldUsed: streakResult.shieldUsed,
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
