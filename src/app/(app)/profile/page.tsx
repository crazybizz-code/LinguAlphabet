import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { computeEarnedAchievementIds } from "@/lib/achievements/catalog";
import { createLearnerRepository } from "@/ai/data";
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

  const [{ data: profile }, learnerProfile, { data: progressRows }] = await Promise.all([
    supabase.from("profiles").select("username, level, daily_time_minutes, interests, onboarding_completed").eq("user_id", user.id).single(),
    // Level/goal/streak/longestStreak come from LearnerRepository (src/ai/data,
    // frozen) — the same repository Tuto's system prompt and the
    // Dashboard/Progress/Explore pages all read, so Profile can never
    // independently drift on what these values mean.
    createLearnerRepository(supabase, user.id).getProfile(),
    supabase.from("progress").select("completed").eq("user_id", user.id),
  ]);

  if (!profile?.onboarding_completed) redirect("/welcome");

  const completedCount = (progressRows ?? []).filter((row) => row.completed).length;
  const streak = learnerProfile.streak ?? 0;
  const longestStreak = Math.max(streak, learnerProfile.studyConsistency?.longestStreak ?? 0);
  const level = profile?.level ?? 1;

  const earnedAchievementIds = computeEarnedAchievementIds({ completedCount, longestStreak, level });

  return (
    <ProfileView
      displayName={profile?.username || "there"}
      email={user.email ?? ""}
      englishLevel={learnerProfile.cefrLevel}
      goal={learnerProfile.learningGoal}
      dailyTimeMinutes={profile?.daily_time_minutes ?? DEFAULT_DAILY_MINUTES}
      interests={profile?.interests ?? []}
      earnedAchievementIds={earnedAchievementIds}
    />
  );
}
