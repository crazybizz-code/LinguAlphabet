import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { computeEarnedAchievementIds } from "@/lib/achievements/catalog";
import { getCachedLearnerProfile } from "@/ai/data";
import { ProfileView } from "@/components/profile/ProfileView";
import { buildMetadata } from "@/lib/seo/metadata";

const DEFAULT_DAILY_MINUTES = 20;

export const metadata: Metadata = buildMetadata({
  title: "Profile",
  description: "View your English learning achievements, stats, and milestones.",
  path: "/profile",
  index: false,
});

export default async function ProfilePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: profile }, learnerProfile, { data: progressRows }, { data: mockAttempts }] = await Promise.all([
    supabase
      .from("profiles")
      .select("username, level, daily_time_minutes, interests, onboarding_completed, current_band, target_band, exam_timeline, exam_date, assessed_band, assessed_cefr_level")
      .eq("user_id", user.id)
      .single(),
    getCachedLearnerProfile(supabase, user.id),
    supabase.from("progress").select("completed").eq("user_id", user.id),
    supabase
      .from("full_mock_attempts")
      .select("reading_correct, reading_total, listening_correct, listening_total, submitted_at")
      .eq("user_id", user.id)
      .eq("status", "submitted"),
  ]);

  if (!profile?.onboarding_completed) redirect("/welcome");

  const completedCount = (progressRows ?? []).filter((row) => row.completed).length;
  const streak = learnerProfile.streak ?? 0;
  const longestStreak = Math.max(streak, learnerProfile.studyConsistency?.longestStreak ?? 0);
  const level = profile?.level ?? 1;

  const earnedAchievementIds = computeEarnedAchievementIds({ completedCount, longestStreak, level });

  const attempts = mockAttempts ?? [];
  const mocksCompleted = attempts.length;
  const totalReadingCorrect = attempts.reduce((s, a) => s + (a.reading_correct ?? 0), 0);
  const totalListeningCorrect = attempts.reduce((s, a) => s + (a.listening_correct ?? 0), 0);
  const totalReadingQuestions = attempts.reduce((s, a) => s + (a.reading_total ?? 0), 0);
  const totalListeningQuestions = attempts.reduce((s, a) => s + (a.listening_total ?? 0), 0);

  return (
    <ProfileView
      displayName={profile?.username || "there"}
      email={user.email ?? ""}
      currentBand={profile?.current_band ?? null}
      /* Real placement-assessed band — deliberately NOT current_band (the
         self-reported field). Same source-of-truth principle already fixed
         on Progress: never fall back to the self-report, since that would
         recreate the exact bug this fixes. Null stays null. */
      assessedBand={profile?.assessed_band ?? null}
      targetBand={profile?.target_band ?? null}
      examTimeline={profile?.exam_timeline ?? null}
      examDate={profile?.exam_date ?? null}
      dailyTimeMinutes={profile?.daily_time_minutes ?? DEFAULT_DAILY_MINUTES}
      interests={profile?.interests ?? []}
      earnedAchievementIds={earnedAchievementIds}
      streak={streak}
      mocksCompleted={mocksCompleted}
      totalReadingCorrect={totalReadingCorrect}
      totalListeningCorrect={totalListeningCorrect}
      totalReadingQuestions={totalReadingQuestions}
      totalListeningQuestions={totalListeningQuestions}
    />
  );
}
