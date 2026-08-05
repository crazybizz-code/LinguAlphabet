import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCachedPublishedPodcasts, getCachedPublishedArticles } from "@/lib/content/queries";
import { learningBrain } from "@/lib/learning-brain";
import type { LearnerContext, RecentCompletion } from "@/lib/learning-brain";
import { getCachedLearnerProfile } from "@/ai/data";
import { ExploreView } from "@/components/explore/ExploreView";
import { buildMetadata } from "@/lib/seo/metadata";

const RECOMMEND_COUNT = 4;

export const metadata: Metadata = buildMetadata({
  title: "Explore",
  description: "Discover podcasts curated to your English level, goals, and interests in the Knowledge Hub.",
  path: "/explore",
  index: false,
});

export default async function ExplorePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: profile }, learnerProfile, podcasts, articles, { data: progressRows }] = await Promise.all([
    supabase.from("profiles").select("interests, onboarding_completed").eq("user_id", user.id).single(),
    // Level/goal come from LearnerRepository (src/ai/data, frozen) — the
    // same repository Tuto's system prompt and the Dashboard both read, so
    // Explore's ranking can never independently drift on what "the
    // learner's current level" means. getCachedLearnerProfile shares the
    // React.cache result with the layout's getLearnerSidebarStats call.
    getCachedLearnerProfile(supabase, user.id),
    getCachedPublishedPodcasts(supabase),
    getCachedPublishedArticles(supabase),
    supabase.from("progress").select("*").eq("user_id", user.id),
  ]);

  if (!profile?.onboarding_completed) redirect("/welcome");

  const rows = progressRows ?? [];
  const byId = new Map(podcasts.map((podcast) => [podcast.id, podcast]));
  const completedRows = rows.filter((row) => row.completed);

  const recentCompletions: RecentCompletion[] = completedRows
    .map((row) => {
      const podcast = byId.get(row.content_item_id);
      return podcast ? { cefrLevel: podcast.cefrLevelMin, completedAt: row.updated_at } : null;
    })
    .filter((completion): completion is RecentCompletion => completion !== null);

  const effectiveLevel = learningBrain.getEffectiveLevel(learnerProfile.cefrLevel, recentCompletions);

  const context: LearnerContext = {
    englishLevel: effectiveLevel,
    goal: learnerProfile.learningGoal,
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
