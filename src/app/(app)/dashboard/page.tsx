import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient, getAuthenticatedUser } from "@/lib/supabase/server";
import { getCachedPublishedPodcasts, getCachedPublishedArticles } from "@/lib/content/queries";
import { buildWeeklyMinutes, buildTodayMinutes } from "@/lib/content/home";
import { learningBrain } from "@/lib/learning-brain";
import type { LearnerContext, RecentCompletion } from "@/lib/learning-brain";
import { continueLearningStrategy } from "@/lib/learning-brain/strategies/continue-learning";
import { getCachedLearnerProfile } from "@/ai/data";
import { buildTutoNote } from "@/lib/tuto/messages";
import { fetchDueVocabulary } from "@/lib/vocabulary/review";
import { computeEarnedAchievementIds } from "@/lib/achievements/catalog";
import { buildResumeStrip } from "@/lib/dashboard/resume";
import { buildRecommendationReason } from "@/lib/dashboard/recommendation-reason";
import { HomeView } from "@/components/dashboard/HomeView";
import { fetchTodayPlan } from "@/lib/planning/today";
import { buildMetadata } from "@/lib/seo/metadata";
import type { CefrLevel } from "@/types/content";

const DEFAULT_DAILY_MINUTES = 20;
const RECENT_COMPLETION_WINDOW_MS = 6 * 60 * 60 * 1000;

export const metadata: Metadata = buildMetadata({
  title: "Dashboard",
  description: "Your personalized English learning dashboard — track today's mission, streaks, and progress with Tuto.",
  path: "/dashboard",
  index: false,
});

export default async function DashboardPage() {
  const [supabase, user] = await Promise.all([createClient(), getAuthenticatedUser()]);
  if (!user) redirect("/login");

  const todayIso = new Date().toISOString().slice(0, 10);

  const [
    { data: profile },
    learnerProfile,
    podcasts,
    articles,
    { data: progressRows },
    { data: previousMission },
    dueVocabulary,
    todayPlan,
    { data: todaysMissions },
    { data: latestMock },
    { data: weakAreaSignals },
  ] = await Promise.all([
    supabase
      .from("profiles")
      .select(
        "username, level, last_study_date, daily_time_minutes, interests, onboarding_completed, placement_completed, current_band, target_band, exam_timeline, exam_date, assessed_cefr_level, assessed_band",
      )
      .eq("user_id", user.id)
      .single(),
    getCachedLearnerProfile(supabase, user.id),
    getCachedPublishedPodcasts(supabase),
    getCachedPublishedArticles(supabase),
    supabase.from("progress").select("*").eq("user_id", user.id),
    supabase
      .from("daily_missions")
      .select("*")
      .eq("user_id", user.id)
      .lt("mission_date", todayIso)
      .order("mission_date", { ascending: false })
      .limit(1)
      .maybeSingle(),
    fetchDueVocabulary(),
    // Runs its own plan lookup internally; 3 serial queries but concurrent with all other items.
    fetchTodayPlan(supabase, user.id),
    // Pre-fetch today's daily_missions so getHomeRecommendations can skip its own query.
    supabase
      .from("daily_missions")
      .select("*")
      .eq("user_id", user.id)
      .eq("mission_date", todayIso),
    // Latest submitted mock attempt — for reading/listening section scores in the hero card.
    supabase
      .from("full_mock_attempts")
      .select("reading_correct, reading_total, reading_score_pct, listening_correct, listening_total, listening_score_pct")
      .eq("user_id", user.id)
      .eq("status", "submitted")
      .order("submitted_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    // Weak areas from recent practice/mock signals — last 5 entries, then de-duped.
    supabase
      .from("learning_signals")
      .select("evidence")
      .eq("user_id", user.id)
      .in("type", ["practice_completed", "mock_completed"])
      .order("created_at", { ascending: false })
      .limit(5),
  ]);

  if (!profile?.onboarding_completed) redirect("/welcome");

  const rows = progressRows ?? [];
  const dailyMinutes = profile?.daily_time_minutes ?? DEFAULT_DAILY_MINUTES;
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
    prefetchedTodaysMissions: todaysMissions,
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
    recentCompletionTitle: recentCompletionTitle && completedMissionTitles.has(recentCompletionTitle) ? null : recentCompletionTitle,
    daysSinceLastStudy,
  });

  const resume = buildResumeStrip({
    candidate: continueLearningStrategy.find(rows, catalog),
    missions,
  });

  const level = profile?.level ?? 1;
  const earnedAchievementIds = computeEarnedAchievementIds({
    completedCount: completedRows.length,
    longestStreak: Math.max(learnerProfile.streak ?? 0, learnerProfile.studyConsistency?.longestStreak ?? 0),
    level,
  });

  const recommendations = tutoRecommends.map((item) => ({
    item,
    reason: buildRecommendationReason(item, { englishLevel: effectiveLevel, interests: context.interests }),
  }));

  // Build section scores from latest mock (null = no mock taken yet)
  const latestMockReading = latestMock
    ? {
        correct: latestMock.reading_correct ?? 0,
        total: latestMock.reading_total ?? 0,
        scorePct: latestMock.reading_score_pct ?? 0,
      }
    : null;
  const latestMockListening = latestMock
    ? {
        correct: latestMock.listening_correct ?? 0,
        total: latestMock.listening_total ?? 0,
        scorePct: latestMock.listening_score_pct ?? 0,
      }
    : null;

  // Extract weak areas from recent learning signals evidence
  type SignalEvidence = { weakAreas?: string[] };
  const allWeakAreas = (weakAreaSignals ?? []).flatMap((s) => {
    const ev = s.evidence as SignalEvidence | null;
    return ev?.weakAreas ?? [];
  });
  const weakAreas = [...new Set(allWeakAreas)].slice(0, 3);

  // Hero card must reflect the real placement result once one exists —
  // never the self-reported onboarding values (learnerProfile.cefrLevel /
  // profile.current_band are both self-report, see
  // src/ai/data/learner-repository.ts). Falls back to the self-report only
  // when placement hasn't been completed yet, or in the defensive case
  // where placement_completed is true but the assessed field is somehow
  // still null — never fabricated, always a real persisted value either way.
  const heroCefrLevel = profile?.placement_completed
    ? ((profile?.assessed_cefr_level as CefrLevel | null) ?? learnerProfile.cefrLevel ?? null)
    : (learnerProfile.cefrLevel ?? null);
  const heroBand = profile?.placement_completed
    ? (profile?.assessed_band ?? profile?.current_band ?? null)
    : (profile?.current_band ?? null);

  return (
    <HomeView
      displayName={profile?.username || "there"}
      streak={learnerProfile.streak ?? 0}
      cefrLevel={heroCefrLevel}
      currentBand={heroBand}
      targetBand={profile?.target_band ?? null}
      examTimeline={profile?.exam_timeline ?? null}
      examDate={profile?.exam_date ?? null}
      todayMinutes={todayMinutes}
      dailyGoalMinutes={dailyMinutes}
      missions={missions}
      allMissionsCompleted={allMissionsCompleted}
      resume={resume}
      tutoNote={tutoNote}
      recommendations={recommendations}
      placementCompleted={profile?.placement_completed ?? false}
      dueVocabularyCount={dueVocabulary.length}
      earnedAchievementIds={earnedAchievementIds}
      todayPlan={todayPlan}
      latestMockReading={latestMockReading}
      latestMockListening={latestMockListening}
      weakAreas={weakAreas}
    />
  );
}
