import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient, getAuthenticatedUser } from "@/lib/supabase/server";
import { getPublishedPodcasts, getPublishedArticles } from "@/lib/content/queries";
import { buildLastWeekSummary, buildWeeklyMinutes, startOfWeek } from "@/lib/content/home";
import { buildMonthActivity, buildRecentActivity, buildWeekActivity } from "@/lib/content/progress";
import { buildDailyActivityIndex } from "@/lib/content/daily-activity";
import { computeEarnedAchievementIds } from "@/lib/achievements/catalog";
import { buildTutoNote } from "@/lib/tuto/messages";
import { getCachedLearnerProfile } from "@/ai/data";
import { ProgressView } from "@/components/progress/ProgressView";
import { buildMetadata } from "@/lib/seo/metadata";

const DEFAULT_DAILY_MINUTES = 20;
const RECENT_COMPLETION_WINDOW_MS = 6 * 60 * 60 * 1000;

export const metadata: Metadata = buildMetadata({
  title: "Progress",
  description: "Track your weekly learning minutes, streaks, and English learning activity over time.",
  path: "/progress",
  index: false,
});

export default async function ProgressPage() {
  const [supabase, user] = await Promise.all([createClient(), getAuthenticatedUser()]);
  if (!user) redirect("/login");

  const [{ data: profile }, learnerProfile, podcasts, articles, { data: progressRows }, { data: vocabularyRows }, { data: noteRows }] = await Promise.all([
    supabase.from("profiles").select("level, xp_to_next, last_study_date, daily_time_minutes, onboarding_completed").eq("user_id", user.id).single(),
    // streak/xp/longestStreak come from LearnerRepository (src/ai/data,
    // frozen) — the same repository Tuto's own system prompt reads
    // (ai-service.ts's resolveMemory()) and the Dashboard now reads too, so
    // Progress can never independently drift on what these numbers mean.
    // getCachedLearnerProfile shares the React.cache result with the layout.
    getCachedLearnerProfile(supabase, user.id),
    // Full catalog (not getCachedPublishedPodcasts/Articles): buildDailyActivityIndex
    // reads podcast.vocabulary.length for the "flashcards completed" metric in the
    // Daily Activity panel — the lean cached versions omit vocabulary and would
    // always display 0.
    getPublishedPodcasts(supabase),
    getPublishedArticles(supabase),
    supabase.from("progress").select("*").eq("user_id", user.id),
    supabase.from("vocabulary").select("*").eq("user_id", user.id),
    supabase.from("notes").select("*").eq("user_id", user.id),
  ]);

  if (!profile?.onboarding_completed) redirect("/welcome");

  const rows = progressRows ?? [];
  const dailyGoalMinutes = profile?.daily_time_minutes ?? DEFAULT_DAILY_MINUTES;
  const catalog = [...podcasts, ...articles];
  const byId = new Map(catalog.map((item) => [item.id, item]));
  const completedRows = rows.filter((row) => row.completed);

  const weekStart = startOfWeek(new Date());
  const completedThisWeek = completedRows.filter((row) => new Date(row.updated_at) >= weekStart).length;

  const streak = learnerProfile.streak ?? 0;
  const longestStreak = Math.max(streak, learnerProfile.studyConsistency?.longestStreak ?? 0);
  const level = profile?.level ?? 1;

  const now = new Date().getTime();
  const recentCompletionRow = completedRows
    .filter((row) => now - new Date(row.updated_at).getTime() <= RECENT_COMPLETION_WINDOW_MS)
    .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())[0];
  const daysSinceLastStudy = profile?.last_study_date
    ? Math.floor((now - new Date(profile.last_study_date).getTime()) / (24 * 60 * 60 * 1000))
    : null;

  const weeklyMinutes = buildWeeklyMinutes(catalog, rows);
  const weeklyGoalMinutes = dailyGoalMinutes * 7;

  const tutoNote = buildTutoNote({
    streak,
    weeklyMinutes,
    weeklyGoalMinutes,
    recentCompletionTitle: recentCompletionRow ? (byId.get(recentCompletionRow.content_item_id)?.title ?? null) : null,
    daysSinceLastStudy,
  });

  const dailyActivityIndex = buildDailyActivityIndex({
    progressRows: rows,
    podcasts: catalog,
    vocabularyRows: vocabularyRows ?? [],
    noteRows: noteRows ?? [],
  });

  return (
    <ProgressView
      streak={streak}
      longestStreak={longestStreak}
      level={level}
      xp={learnerProfile.xp ?? 0}
      xpToNext={profile?.xp_to_next ?? 300}
      weeklyMinutes={weeklyMinutes}
      weeklyGoalMinutes={weeklyGoalMinutes}
      weekActivity={buildWeekActivity(rows)}
      totalCompleted={completedRows.length}
      completedThisWeek={completedThisWeek}
      monthActivity={buildMonthActivity(rows, catalog, dailyGoalMinutes)}
      dailyActivityIndex={dailyActivityIndex}
      recentActivity={buildRecentActivity(catalog, rows)}
      earnedAchievementIds={computeEarnedAchievementIds({ completedCount: completedRows.length, longestStreak, level })}
      tutoNote={tutoNote}
      lastWeekSummary={buildLastWeekSummary(catalog, rows)}
    />
  );
}
