import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getPublishedArticles, getPublishedPodcasts } from "@/lib/content/queries";
import { learningBrain } from "@/lib/learning-brain";
import type { LearnerContext, RecentCompletion } from "@/lib/learning-brain";
import { ExploreView } from "@/components/explore/ExploreView";

const RECOMMEND_COUNT = 4;

export default async function ExplorePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: profile }, podcasts, articles, { data: progressRows }] = await Promise.all([
    supabase.from("profiles").select("english_level, goal, interests").eq("user_id", user.id).single(),
    getPublishedPodcasts(supabase),
    getPublishedArticles(supabase),
    supabase.from("progress").select("*").eq("user_id", user.id),
  ]);

  const rows = progressRows ?? [];
  const byId = new Map(podcasts.map((podcast) => [podcast.id, podcast]));
  const completedRows = rows.filter((row) => row.completed);

  const recentCompletions: RecentCompletion[] = completedRows
    .map((row) => {
      const podcast = byId.get(row.content_item_id);
      return podcast ? { cefrLevel: podcast.cefrLevelMin, completedAt: row.updated_at } : null;
    })
    .filter((completion): completion is RecentCompletion => completion !== null);

  const baseLevel = (profile?.english_level as LearnerContext["englishLevel"]) ?? null;
  const effectiveLevel = learningBrain.getEffectiveLevel(baseLevel, recentCompletions);

  const context: LearnerContext = {
    englishLevel: effectiveLevel,
    goal: profile?.goal ?? null,
    interests: profile?.interests ?? [],
    completedContentIds: new Set(completedRows.map((row) => row.content_item_id)),
    // Explore isn't mission-scoped, so the variety bonus term is a no-op here.
    previousMissionContentType: null,
  };

  const [rankedPodcasts, rankedArticles] = await Promise.all([
    learningBrain.getExploreRanking(podcasts, context),
    learningBrain.getExploreRanking(articles, context),
  ]);
  const podcastRecommends = learningBrain.getTutoRecommends(rankedPodcasts, undefined, RECOMMEND_COUNT);
  const articleRecommends = learningBrain.getTutoRecommends(rankedArticles, undefined, RECOMMEND_COUNT);

  return (
    <ExploreView
      podcasts={rankedPodcasts}
      podcastRecommends={podcastRecommends}
      articles={rankedArticles}
      articleRecommends={articleRecommends}
    />
  );
}
