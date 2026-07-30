import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getPublishedArticles, getPublishedPodcasts } from "@/lib/content/queries";
import { buildWeeklyMinutes, buildTodayMinutes } from "@/lib/content/home";
import { learningBrain } from "@/lib/learning-brain";
import type { LearnerContext, RecentCompletion } from "@/lib/learning-brain";
import { createLearnerRepository } from "@/ai/data";
import { buildTutoNote } from "@/lib/tuto/messages";
import { fetchDueVocabulary } from "@/lib/vocabulary/review";
import { HomeView } from "@/components/dashboard/HomeView";
import { buildMetadata } from "@/lib/seo/metadata";

const DEFAULT_DAILY_MINUTES = 20;
const RECENT_COMPLETION_WINDOW_MS = 6 * 60 * 60 * 1000;

export const metadata: Metadata = buildMetadata({
  title: "Dashboard",
  description: "Your personalized English learning dashboard — track today's mission, streaks, and progress with Tuto.",
  path: "/dashboard",
  index: false,
});

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: profile }, learnerProfile, podcasts, articles, { data: progressRows }, { data: previousMission }, dueVocabulary] = await Promise.all([
    supabase.from("profiles").select("username, level, last_study_date, daily_time_minutes, interests, onboarding_completed").eq("user_id", user.id).single(),
    // Level/goal/streak come from LearnerRepository (src/ai/data, frozen) —
    // the same repository Tuto's own system prompt reads (ai-service.ts's
    // resolveMemory()) — so Dashboard and Tuto can never independently
    // drift on what "the learner's current level" means.
    createLearnerRepository(supabase, user.id).getProfile(),
    getPublishedPodcasts(supabase),
    getPublishedArticles(supabase),
    supabase.from("progress").select("*").eq("user_id", user.id),
    supabase
      .from("daily_missions")
      .select("*")
      .eq("user_id", user.id)
      .lt("mission_date", new Date().toISOString().slice(0, 10))
      .order("mission_date", { ascending: false })
      .limit(1)
      .maybeSingle(),
    fetchDueVocabulary(),
  ]);

  if (!profile?.onboarding_completed) redirect("/welcome");

  const rows = progressRows ?? [];
  const dailyMinutes = profile?.daily_time_minutes ?? DEFAULT_DAILY_MINUTES;
  // Articles are full mission citizens alongside podcasts -- one combined
  // catalog feeds ranking, mission selection, and completion lookups.
  const catalog = [...podcasts, ...articles];
  const byId = new Map(catalog.map((item) => [item.id, item]));

  const previousMissionContent = previousMission ? byId.get(previousMission.content_item_id) : undefined;

  const completedRows = rows.filter((row) => row.completed);
  const recentCompletions: RecentCompletion[] = completedRows
    .map((row) => {
      const item = byId.get(row.content_item_id);
      return item ? { cefrLevel: item.cefrLevelMin, completedAt: row.updated_at } : null;
    })
    .filter((completion): completion is RecentCompletion => completion !== null);

  const effectiveLevel = learningBrain.getEffectiveLevel(learnerProfile.cefrLevel, recentCompletions);

  const context: LearnerContext = {
    englishLevel: effectiveLevel,
    goal: learnerProfile.learningGoal,
    interests: profile?.interests ?? [],
    completedContentIds: new Set(completedRows.map((row) => row.content_item_id)),
    previousMissionContentType: previousMissionContent?.contentType ?? null,
  };

  const { missions, allMissionsCompleted, tutoRecommends } = await learningBrain.getHomeRecommendations({
    supabase,
    userId: user.id,
    catalog,
    progressRows: rows,
    context,
  });

  const now = new Date().getTime();
  const completedMissionTitles = new Set(missions.map((slot) => slot.completedTitle).filter((title): title is string => title !== null));
  const recentCompletionRow = completedRows
    .filter((row) => now - new Date(row.updated_at).getTime() <= RECENT_COMPLETION_WINDOW_MS)
    .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())[0];
  const recentCompletionTitle = recentCompletionRow ? (byId.get(recentCompletionRow.content_item_id)?.title ?? null) : null;

  const daysSinceLastStudy = profile?.last_study_date
    ? Math.floor((now - new Date(profile.last_study_date).getTime()) / (24 * 60 * 60 * 1000))
    : null;

  const weeklyMinutes = buildWeeklyMinutes(catalog, rows);
  const weeklyGoalMinutes = dailyMinutes * 7;
  const todayMinutes = buildTodayMinutes(catalog, rows);

  const tutoNote = buildTutoNote({
    streak: learnerProfile.streak ?? 0,
    weeklyMinutes,
    weeklyGoalMinutes,
    // Today's Mission's own checklist/celebration already congratulates the
    // learner by name for this exact completion — don't say it twice in
    // Tuto's note.
    recentCompletionTitle: recentCompletionTitle && completedMissionTitles.has(recentCompletionTitle) ? null : recentCompletionTitle,
    daysSinceLastStudy,
  });

  return (
    <HomeView
      displayName={profile?.username || "there"}
      streak={learnerProfile.streak ?? 0}
      level={profile?.level ?? 1}
      weeklyMinutes={weeklyMinutes}
      weeklyGoalMinutes={weeklyGoalMinutes}
      todayMinutes={todayMinutes}
      dailyGoalMinutes={dailyMinutes}
      missions={missions}
      allMissionsCompleted={allMissionsCompleted}
      tutoNote={tutoNote}
      recommendations={tutoRecommends}
      dueVocabularyCount={dueVocabulary.length}
    />
  );
}
