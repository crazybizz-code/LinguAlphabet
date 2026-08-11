import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient, getAuthenticatedUser } from "@/lib/supabase/server";
import { PlacementAssessmentView } from "@/components/assessment/PlacementAssessmentView";
import { buildMetadata } from "@/lib/seo/metadata";

export const metadata: Metadata = buildMetadata({
  title: "Placement Assessment",
  description: "Discover your real English level.",
  path: "/assessment/placement",
  index: false,
});

/**
 * Deliberately outside the (app) route group — the assessment is full-bleed
 * with no sidebar or bottom nav, matching the learning session pattern.
 * Auth-gated below; unauthenticated visitors are bounced to /login.
 */
export default async function PlacementAssessmentPage() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");

  const supabase = await createClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("onboarding_completed, placement_completed, username, current_band, english_level")
    .eq("user_id", user.id)
    .single();

  if (!profile?.onboarding_completed) redirect("/welcome");

  // If already placed, send back to dashboard — unless they explicitly want to redo
  // (redo support can be added later; for now redirect to protect the happy path)
  if (profile?.placement_completed) redirect("/dashboard");

  return (
    <PlacementAssessmentView
      displayName={profile?.username ?? ""}
    />
  );
}
