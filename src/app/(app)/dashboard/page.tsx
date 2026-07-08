import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getPublishedPodcasts } from "@/lib/content/queries";
import { buildHomeData, getTimeGreeting } from "@/lib/content/home";
import { HomeView } from "@/components/dashboard/HomeView";

const DEFAULT_DAILY_MINUTES = 20;

export default async function DashboardPage() {
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

  const dailyMinutes = profile?.daily_time_minutes ?? DEFAULT_DAILY_MINUTES;
  const homeData = buildHomeData(podcasts, progressRows ?? [], profile?.english_level ?? null);

  return (
    <HomeView
      displayName={profile?.username || "there"}
      greeting={getTimeGreeting()}
      streak={profile?.streak ?? 0}
      level={profile?.level ?? 1}
      weeklyMinutes={homeData.weeklyMinutes}
      weeklyGoalMinutes={dailyMinutes * 7}
      todaysMission={homeData.todaysMission}
      resumeItem={homeData.resumeItem}
      recommendations={homeData.recommendations}
    />
  );
}
