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
import { pctToBand } from "@/lib/mock/scoring";
import { ProgressView } from "@/components/progress/ProgressView";
import { buildMetadata } from "@/lib/seo/metadata";

const DEFAULT_DAILY_MINUTES = 20;
const RECENT_COMPLETION_WINDOW_MS = 6 * 60 * 60 * 1000;

// Mirrors mock/page.tsx's mockCooldownDays() — the same policy Mock uses to
// compute its own "next mock available" date, so the two screens agree.
function mockCooldownDays(cefrLevel: string | null): number {
  if (cefrLevel === "C1" || cefrLevel === "C2") return 3;
  return 7;
}

export const metadata: Metadata = buildMetadata({
  title: "Progress",
  description: "Track your weekly learning minutes, streaks, and English learning activity over time.",
  path: "/progress",
  index: false,
});

export default async function ProgressPage() {
  const [supabase, user] = await Promise.all([createClient(), getAuthenticatedUser()]);
  if (!user) redirect("/login");

  const [{ data: profile }, learnerProfile, podcasts, articles, { data: progressRows }, { data: vocabularyRows }, { data: noteRows }, { data: mockAttempts }, { data: weakAreaSignals }, { data: practiceSessions }, { data: earliestPlacement }] = await Promise.all([
    supabase
      .from("profiles")
      .select("level, xp_to_next, last_study_date, daily_time_minutes, onboarding_completed, placement_completed, english_level, current_band, target_band, username, assessed_cefr_level, assessed_band")
      .eq("user_id", user.id)
      .single(),
    getCachedLearnerProfile(supabase, user.id),
    getPublishedPodcasts(supabase),
    getPublishedArticles(supabase),
    supabase.from("progress").select("*").eq("user_id", user.id),
    supabase.from("vocabulary").select("*").eq("user_id", user.id),
    supabase.from("notes").select("*").eq("user_id", user.id),
    supabase
      .from("full_mock_attempts")
      .select("estimated_band, result_cefr_level, reading_correct, reading_total, listening_correct, listening_total, reading_score_pct, listening_score_pct, overall_score_pct, submitted_at")
      .eq("user_id", user.id)
      .eq("status", "submitted")
      .order("submitted_at", { ascending: true }),
    supabase
      .from("learning_signals")
      .select("evidence")
      .eq("user_id", user.id)
      .in("type", ["practice_completed", "mock_completed"])
      .order("created_at", { ascending: false })
      .limit(5),
    supabase
      .from("practice_sessions")
      .select("practice_type, correct_count, question_count, score_pct, completed_at")
      .eq("user_id", user.id)
      .eq("status", "completed")
      .not("completed_at", "is", null)
      .order("completed_at", { ascending: false })
      .limit(5),
    // Earliest completed placement — the real, dated source for the trend's
    // "Placement" point. Not profiles.assessed_band, which has no timestamp
    // and is just the latest cached value.
    supabase
      .from("placement_attempts")
      .select("estimated_band, completed_at")
      .eq("user_id", user.id)
      .eq("status", "completed")
      .order("completed_at", { ascending: true })
      .limit(1)
      .maybeSingle(),
  ]);

  const rows = progressRows ?? [];
  const attempts = mockAttempts ?? [];
  const hasProfileCompletionEvidence = profile
    ? Boolean(
        profile.onboarding_completed ||
          profile.placement_completed ||
          profile.english_level ||
          profile.current_band !== null ||
          profile.target_band !== null ||
          profile.username,
      )
    : false;
  const hasCompletedLearnerEvidence = hasProfileCompletionEvidence || rows.some((row) => row.completed) || attempts.length > 0;

  if (!hasCompletedLearnerEvidence) redirect("/welcome");

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
  const dailyActivityIndex = buildDailyActivityIndex({ progressRows: rows, podcasts: catalog, vocabularyRows: vocabularyRows ?? [], noteRows: noteRows ?? [] });
  const mockTrendPoints = attempts.filter((attempt) => attempt.estimated_band !== null).map((attempt, index) => ({ band: attempt.estimated_band as number, label: `Mock ${index + 1}` }));
  // Placement only appears when a real completed placement attempt exists —
  // never fabricated. placement_attempts.estimated_band is on the same 0–9
  // band scale as full_mock_attempts.estimated_band (both derived from the
  // same CEFR→band-centre anchor table), so it's honest to chart alongside
  // the mock trend, chronologically first.
  const bandTrend = earliestPlacement?.estimated_band != null
    ? [{ band: earliestPlacement.estimated_band as number, label: "Placement" }, ...mockTrendPoints]
    : mockTrendPoints;
  const totalReadingCorrect = attempts.reduce((sum, attempt) => sum + (attempt.reading_correct ?? 0), 0);
  const totalListeningCorrect = attempts.reduce((sum, attempt) => sum + (attempt.listening_correct ?? 0), 0);
  // Real placement/mock-assessed level — deliberately NOT profile.english_level
  // (onboarding self-report) or learnerProfile.cefrLevel (same self-report,
  // projected). lib/assessment/engine.ts writes assessed_cefr_level on
  // placement completion and never overwrites the self-reported field, by
  // design — Progress must read the assessed one to match its own copy
  // ("not your onboarding self-report").
  const assessedCefrLevel = profile?.assessed_cefr_level ?? null;
  type SignalEvidence = { weakAreas?: string[] };
  const allWeakAreas = (weakAreaSignals ?? []).flatMap((signal) => {
    const evidence = signal.evidence as SignalEvidence | null;
    return evidence?.weakAreas ?? [];
  });
  const weakAreas = [...new Set(allWeakAreas)].slice(0, 3);
  const latestAttempt = attempts.length > 0 ? attempts[attempts.length - 1] : null;
  // Overall band — unchanged: still the latest Mock's own estimated_band.
  const latestBand = latestAttempt?.estimated_band ?? null;
  // Per-skill bands — derived from the same latest attempt's already-persisted
  // percentages via the existing Mock scoring mapping (pctToBand), not a new
  // scoring model. Null when there's no mock attempt yet, same as before.
  const latestReadingBand = latestAttempt?.reading_score_pct != null ? pctToBand(latestAttempt.reading_score_pct) : null;
  const latestListeningBand = latestAttempt?.listening_score_pct != null ? pctToBand(latestAttempt.listening_score_pct) : null;
  const latestCefrLevel = latestAttempt?.result_cefr_level ?? null;
  const totalStudiedHours = Math.round(weeklyMinutes / 60);
  const cooldownDays = mockCooldownDays(assessedCefrLevel);
  const nextAssessmentDate = latestAttempt?.submitted_at
    ? (() => {
        const date = new Date(latestAttempt.submitted_at as string);
        date.setDate(date.getDate() + cooldownDays);
        return date.toISOString().split("T")[0];
      })()
    : null;

  function fmtDate(iso: string): string {
    return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  }

  type RawPractice = { date: Date; type: "reading" | "listening" | "mock"; label: string; correct: number; total: number; scorePct: number };
  const rawPractice: RawPractice[] = [
    ...(practiceSessions ?? []).filter((session) => session.completed_at).map((session) => ({
      date: new Date(session.completed_at!),
      type: (session.practice_type === "listening" ? "listening" : "reading") as "reading" | "listening",
      label: session.practice_type === "listening" ? "Listening Practice" : "Reading Practice",
      correct: session.correct_count,
      total: session.question_count,
      scorePct: session.score_pct ?? 0,
    })),
    ...attempts.filter((attempt) => attempt.submitted_at).slice(-3).map((attempt) => ({
      date: new Date(attempt.submitted_at!),
      type: "mock" as const,
      label: "Mock Test",
      correct: (attempt.reading_correct ?? 0) + (attempt.listening_correct ?? 0),
      total: (attempt.reading_total ?? 0) + (attempt.listening_total ?? 0),
      scorePct: ((attempt.reading_score_pct ?? 0) + (attempt.listening_score_pct ?? 0)) / 2,
    })),
  ];
  const recentPractice = rawPractice.sort((a, b) => b.date.getTime() - a.date.getTime()).slice(0, 5).map((item) => ({ type: item.type, label: item.label, date: fmtDate(item.date.toISOString()), correct: item.correct, total: item.total, scorePct: item.scorePct }));

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
      bandTrend={bandTrend}
      mocksCompleted={attempts.length}
      totalReadingCorrect={totalReadingCorrect}
      totalListeningCorrect={totalListeningCorrect}
      assessedCefrLevel={assessedCefrLevel}
      weakAreas={weakAreas}
      latestBand={latestBand}
      latestReadingBand={latestReadingBand}
      latestListeningBand={latestListeningBand}
      latestCefrLevel={latestCefrLevel}
      totalStudiedHours={totalStudiedHours}
      recentPractice={recentPractice}
      nextAssessmentDate={nextAssessmentDate}
    />
  );
}
