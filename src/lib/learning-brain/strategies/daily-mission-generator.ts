import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";
import type { PodcastContent } from "@/types/content";
import type { LearnerContext, Mission } from "../types";
import { ruleBasedLearningBrain } from "../rule-engine";
import { continueLearningStrategy } from "./continue-learning";
import { todaysMissionStrategy } from "./todays-mission";
import { tutoRecommendsStrategy } from "./tuto-recommends";

type Client = SupabaseClient<Database>;
type ProgressRow = Database["public"]["Tables"]["progress"]["Row"];

export interface HomeRecommendations {
  mission: Mission | null;
  tutoRecommends: PodcastContent[];
}

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Orchestrates the strategies above into what Home actually needs, and
 * owns the one piece of Learning Brain state that's genuinely
 * persistent: docs/content-lifecycle.md §5's "Today's Mission is computed
 * once per calendar day, not on every app open." This is product-flow
 * behavior that stays true regardless of which engine implements the
 * underlying ranking, so it sits above the swappable strategies rather
 * than inside any one of them.
 */
export const dailyMissionGenerator = {
  async generate(params: {
    supabase: Client;
    userId: string;
    catalog: PodcastContent[];
    progressRows: ProgressRow[];
    context: LearnerContext;
    recommendCount?: number;
  }): Promise<HomeRecommendations> {
    const { supabase, userId, catalog, progressRows, context, recommendCount = 3 } = params;
    const byId = new Map(catalog.map((item) => [item.id, item]));
    const today = todayIsoDate();

    const resumeCandidate = continueLearningStrategy.find(progressRows, catalog);
    const ranked = await ruleBasedLearningBrain.rank(catalog, context);

    const { data: existingAssignment } = await supabase
      .from("daily_missions")
      .select("*")
      .eq("user_id", userId)
      .eq("mission_date", today)
      .maybeSingle();

    const assignedContent = existingAssignment ? byId.get(existingAssignment.content_item_id) : undefined;
    const assignmentStillValid = assignedContent && !context.completedContentIds.has(assignedContent.id);

    let mission: Mission | null;
    let needsPersist = false;

    if (assignedContent && assignmentStillValid) {
      const resumePositionSeconds =
        existingAssignment!.is_resume && resumeCandidate?.content.id === assignedContent.id
          ? resumeCandidate.positionSeconds
          : undefined;
      mission = todaysMissionStrategy.present(assignedContent, existingAssignment!.is_resume, resumePositionSeconds);
    } else {
      mission = todaysMissionStrategy.decide({ resumeCandidate, ranked });
      needsPersist = mission !== null;
    }

    if (mission && needsPersist) {
      try {
        await supabase.from("daily_missions").upsert({
          user_id: userId,
          mission_date: today,
          content_item_id: mission.contentId,
          is_resume: mission.kind === "continue_podcast",
        });
      } catch {
        // Non-fatal — worst case the mission is recomputed on the next request today.
      }
    }

    const tutoRecommends = tutoRecommendsStrategy.pick(ranked, mission?.contentId, recommendCount);

    return { mission, tutoRecommends };
  },
};
