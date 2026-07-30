import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getArticleById } from "@/lib/content/queries";
import { toLearningSessionContent } from "@/lib/learning-session/adapters/article";
import { LearningSessionView } from "@/components/learning-session/LearningSessionView";
import { buildMetadata } from "@/lib/seo/metadata";

/**
 * Auth-gated (redirects unauthenticated visitors to /login below), so this
 * never gets indexed — the real title still matters for the browser tab and
 * for any share/bookmark of the URL while logged in.
 */
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const supabase = await createClient();
  const article = await getArticleById(supabase, id);
  if (!article) return buildMetadata({ title: "Article", description: "Article lesson.", path: `/article/${id}/learn`, index: false });

  return buildMetadata({
    title: article.title,
    description: article.description || article.summary || "Article lesson.",
    path: `/article/${id}/learn`,
    index: false,
  });
}

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

  const today = new Date().toISOString().slice(0, 10);
  const [article, { data: profile }, { data: missionRow }] = await Promise.all([
    getArticleById(supabase, id),
    supabase.from("profiles").select("username").eq("user_id", user.id).single(),
    supabase.from("daily_missions").select("content_item_id").eq("user_id", user.id).eq("mission_date", today).eq("content_item_id", id).maybeSingle(),
  ]);

  if (!article) notFound();

  return (
    <LearningSessionView
      content={toLearningSessionContent(article)}
      displayName={profile?.username || "there"}
      isMission={Boolean(missionRow)}
    />
  );
}
