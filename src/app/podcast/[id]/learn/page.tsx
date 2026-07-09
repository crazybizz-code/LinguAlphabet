import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getPodcastById } from "@/lib/content/queries";
import { toLearningSessionContent } from "@/lib/learning-session/adapters/podcast";
import { LearningSessionView } from "@/components/learning-session/LearningSessionView";

/**
 * Deliberately outside the (app) route group — the Learning Session is
 * full-bleed with no sidebar/bottom-nav/floating Tuto button, same as the
 * Podcast Player, per the Base44 reference's own shell boundary.
 */
export default async function LearnPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [podcast, { data: profile }] = await Promise.all([
    getPodcastById(supabase, id),
    supabase.from("profiles").select("username").eq("user_id", user.id).single(),
  ]);

  if (!podcast) notFound();

  return <LearningSessionView content={toLearningSessionContent(podcast)} displayName={profile?.username || "there"} />;
}
