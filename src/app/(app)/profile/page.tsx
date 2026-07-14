import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { computeEarnedAchievementIds } from "@/lib/achievements/catalog";
import { ProfileView } from "@/components/profile/ProfileView";

const DEFAULT_DAILY_MINUTES = 20;

export default async function ProfilePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: profile }, { data: progressRows }] = await Promise.all([
    supabase
      .from("profiles")
      .select("username, level, streak, longest_streak, english_level, goal, daily_time_minutes, interests, onboarding_completed")
      .eq("user_id", user.id)
      .single(),
    supabase.from("progress").select("completed").eq("user_id", user.id),
  ]);

  if (!profile?.onboarding_completed) redirect("/welcome");

  const completedCount = (progressRows ?? []).filter((row) => row.completed).length;
  const streak = profile?.streak ?? 0;
  const longestStreak = Math.max(streak, profile?.longest_streak ?? 0);
  const level = profile?.level ?? 1;

  const earnedAchievementIds = computeEarnedAchievementIds({ completedCount, longestStreak, level });

  return (
    <ProfileView
      displayName={profile?.username || "there"}
      email={user.email ?? ""}
      englishLevel={profile?.english_level ?? null}
      goal={profile?.goal ?? null}
      dailyTimeMinutes={profile?.daily_time_minutes ?? DEFAULT_DAILY_MINUTES}
      interests={profile?.interests ?? []}
      earnedAchievementIds={earnedAchievementIds}
    />
  );
}
