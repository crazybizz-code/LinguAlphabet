import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getArticleById } from "@/lib/content/queries";
import { toLearningSessionContent } from "@/lib/learning-session/adapters/article";
import { LearningSessionView } from "@/components/learning-session/LearningSessionView";

/**
 * Deliberately outside the (app) route group — the Learning Session is
 * full-bleed with no sidebar/bottom-nav/floating Tuto button, same as the
 * Podcast Learning Session (src/app/podcast/[id]/learn/page.tsx), which
 * this route mirrors field for field except its content-type-specific
 * query and adapter.
 */
export default async function LearnPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [article, { data: profile }] = await Promise.all([
    getArticleById(supabase, id),
    supabase.from("profiles").select("username").eq("user_id", user.id).single(),
  ]);

  if (!article) notFound();

  return <LearningSessionView content={toLearningSessionContent(article)} displayName={profile?.username || "there"} />;
}
