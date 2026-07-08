import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";
import type { ContentItem } from "@/types/content";
import { learningBrain } from "./index";
import type { LearnerContext } from "./types";

type Client = SupabaseClient<Database>;
type ProgressRow = Database["public"]["Tables"]["progress"]["Row"];

export interface HomeMission<T extends ContentItem> {
  content: T;
  /** True when this mission is an unfinished item taking priority (docs/content-lifecycle.md §10), not a fresh pick. */
  isResume: boolean;
  resumePositionSeconds?: number;
}

export interface HomeRecommendations<T extends ContentItem> {
  todaysMission: HomeMission<T> | null;
  tutoRecommends: T[];
}

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Assembles Today's Mission + Tuto Recommends for Home. This is where
 * docs/content-lifecycle.md §5 ("computed once per calendar day") and §10
 * ("an unfinished item takes priority over a fresh pick") live — both are
 * product-flow rules that stay true regardless of which engine implements
 * `learningBrain.rank`, so they sit above the swappable ranking itself
 * rather than inside it.
 */
export async function getHomeRecommendations<T extends ContentItem>(params: {
  supabase: Client;
  userId: string;
  catalog: T[];
  progressRows: ProgressRow[];
  context: LearnerContext;
  recommendCount?: number;
}): Promise<HomeRecommendations<T>> {
  const { supabase, userId, catalog, progressRows, context, recommendCount = 3 } = params;
  const byId = new Map(catalog.map((item) => [item.id, item]));
  const today = todayIsoDate();

  const mostRecentInProgress = [...progressRows]
    .filter((row) => !row.completed)
    .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())[0];
  const resumeContent = mostRecentInProgress ? byId.get(mostRecentInProgress.content_item_id) : undefined;

  const ranked = await learningBrain.rank(catalog, context);

  let mission: HomeMission<T> | null = null;

  const { data: existingAssignment } = await supabase
    .from("daily_missions")
    .select("*")
    .eq("user_id", userId)
    .eq("mission_date", today)
    .maybeSingle();

  const assignedContent = existingAssignment ? byId.get(existingAssignment.content_item_id) : undefined;
  const assignmentStillValid = assignedContent && !context.completedContentIds.has(assignedContent.id);

  if (assignedContent && assignmentStillValid) {
    mission = {
      content: assignedContent,
      isResume: existingAssignment!.is_resume,
      resumePositionSeconds: existingAssignment!.is_resume ? mostRecentInProgress?.position_seconds : undefined,
    };
  } else if (resumeContent) {
    mission = { content: resumeContent, isResume: true, resumePositionSeconds: mostRecentInProgress?.position_seconds };
  } else if (ranked[0]) {
    mission = { content: ranked[0], isResume: false };
  }

  if (mission && (!assignedContent || !assignmentStillValid)) {
    try {
      await supabase.from("daily_missions").upsert({
        user_id: userId,
        mission_date: today,
        content_item_id: mission.content.id,
        is_resume: mission.isResume,
      });
    } catch {
      // Non-fatal — worst case the mission is recomputed on the next request today.
    }
  }

  const tutoRecommends = ranked.filter((item) => item.id !== mission?.content.id).slice(0, recommendCount);

  return { todaysMission: mission, tutoRecommends };
}
