import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient, getAuthenticatedUser } from "@/lib/supabase/server";
import { TutoInsightsView } from "@/components/tuto-insights/TutoInsightsView";
import { buildMetadata } from "@/lib/seo/metadata";

export const metadata: Metadata = buildMetadata({
  title: "Tuto's Insights",
  description: "Qualitative feedback on your English learning journey from Tuto.",
  path: "/tutos-insights",
  index: false,
});

export default async function TutosInsightsPage() {
  const supabase = await createClient();
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("onboarding_completed")
    .eq("user_id", user.id)
    .single();
  if (!profile?.onboarding_completed) redirect("/welcome");

  return <TutoInsightsView />;
}
