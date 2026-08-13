import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient, getAuthenticatedUser } from "@/lib/supabase/server";
import { TutoCoachingView } from "@/components/tuto-coaching/TutoCoachingView";
import { buildMetadata } from "@/lib/seo/metadata";

export const metadata: Metadata = buildMetadata({
  title: "Tuto Coaching",
  description: "Personalized study tips from Tuto, based on your real progress.",
  path: "/tuto-coaching",
  index: false,
});

export default async function TutoCoachingPage() {
  const supabase = await createClient();
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("onboarding_completed")
    .eq("user_id", user.id)
    .single();
  if (!profile?.onboarding_completed) redirect("/welcome");

  return <TutoCoachingView />;
}
