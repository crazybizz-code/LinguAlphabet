import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getPublishedPodcasts } from "@/lib/content/queries";
import { buildWeeklyMinutes, startOfWeek } from "@/lib/content/home";
import { buildMonthActivity, buildRecentActivity, buildWeekActivity } from "@/lib/content/progress";
import { computeEarnedAchievementIds } from "@/lib/achievements/catalog";
import { buildTutoNote } from "@/lib/tuto/messages";
import { ProgressView } from "@/components/progress/ProgressView";

const DEFAULT_DAILY_MINUTES = 20;
const RECENT_COMPLETION_WINDOW_MS = 6 * 60 * 60 * 1000;

export default async function ProgressPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: profile }, podcasts, { data: progressRows }] = await Promise.all([
    supabase.from("profiles").select("*").eq("user_id", user.id).single(),
    getPublishedPodcasts(supabase),
    supabase.from("progress").select("*").eq("user_id", user.id),
  ]);

  const rows = progressRows ?? [];
  const byId = new Map(podcasts.map((podcast) => [podcast.id, podcast]));
  const completedRows = rows.filter((row) => row.completed);

  const weekStart = startOfWeek(new Date());
  const completedThisWeek = completedRows.filter((row) => new Date(row.updated_at) >= weekStart).length;

  const streak = profile?.streak ?? 0;
  const longestStreak = Math.max(streak, profile?.longest_streak ?? 0);
  const level = profile?.level ?? 1;

  const now = new Date().getTime();
  const recentCompletionRow = completedRows
    .filter((row) => now - new Date(row.updated_at).getTime() <= RECENT_COMPLETION_WINDOW_MS)
    .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())[0];
  const daysSinceLastStudy = profile?.last_study_date
    ? Math.floor((now - new Date(profile.last_study_date).getTime()) / (24 * 60 * 60 * 1000))
    : null;

  const weeklyMinutes = buildWeeklyMinutes(podcasts, rows);
  const weeklyGoalMinutes = (profile?.daily_time_minutes ?? DEFAULT_DAILY_MINUTES) * 7;

  const tutoNote = buildTutoNote({
    streak,
    weeklyMinutes,
    weeklyGoalMinutes,
    recentCompletionTitle: recentCompletionRow ? (byId.get(recentCompletionRow.content_item_id)?.title ?? null) : null,
    daysSinceLastStudy,
  });

  return (
    <ProgressView
      streak={streak}
      longestStreak={longestStreak}
      level={level}
      xp={profile?.xp ?? 0}
      xpToNext={profile?.xp_to_next ?? 300}
      weeklyMinutes={weeklyMinutes}
      weeklyGoalMinutes={weeklyGoalMinutes}
      weekActivity={buildWeekActivity(rows)}
      totalCompleted={completedRows.length}
      completedThisWeek={completedThisWeek}
      monthActivity={buildMonthActivity(rows)}
      recentActivity={buildRecentActivity(podcasts, rows)}
      earnedAchievementIds={computeEarnedAchievementIds({ completedCount: completedRows.length, longestStreak, level })}
      tutoNote={tutoNote}
    />
  );
}
