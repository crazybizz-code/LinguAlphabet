import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";
import type { DailyMissionSlot, LearnerContext, MissionSlotContentType } from "../types";
import { ruleBasedLearningBrain } from "../rule-engine";
import { continueLearningStrategy } from "./continue-learning";
import { todaysMissionStrategy, type MissionContent } from "./todays-mission";

type Client = SupabaseClient<Database>;
type ProgressRow = Database["public"]["Tables"]["progress"]["Row"];
type DailyMissionRow = Database["public"]["Tables"]["daily_missions"]["Row"];

const SLOT_TYPES: readonly MissionSlotContentType[] = ["article", "podcast"];

export interface HomeRecommendations {
  /** Exactly one slot per SLOT_TYPES entry: today's article plan, today's podcast plan. */
  missions: DailyMissionSlot[];
  /** True once every slot with eligible content has been completed today — the finite daily plan is done. */
  allMissionsCompleted: boolean;
  tutoRecommends: MissionContent[];
}

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Resolves a single day/type slot: reuses an existing locked assignment
 * if one exists and isn't completed yet, reports completion if it is, or
 * mints and persists a fresh pick only when this slot has never been
 * assigned today. This is what makes a completed slot terminal for the
 * rest of the calendar day instead of triggering a new pick (the
 * "infinite generator" bug this plan replaces).
 */
async function resolveSlot(params: {
  supabase: Client;
  userId: string;
  today: string;
  contentType: MissionSlotContentType;
  byId: Map<string, MissionContent>;
  catalogForType: MissionContent[];
  rankedForType: MissionContent[];
  progressRows: ProgressRow[];
  context: LearnerContext;
  existingRow: DailyMissionRow | undefined;
}): Promise<DailyMissionSlot> {
  const { supabase, userId, today, contentType, byId, catalogForType, rankedForType, progressRows, context, existingRow } = params;

  const assignedContent = existingRow ? byId.get(existingRow.content_item_id) : undefined;
  const assignmentCompleted = assignedContent ? context.completedContentIds.has(assignedContent.id) : false;

  if (assignedContent && assignmentCompleted) {
    return { contentType, mission: null, completedTitle: assignedContent.title };
  }

  if (assignedContent && !assignmentCompleted) {
    const resumeCandidate = continueLearningStrategy.find(progressRows, catalogForType);
    const resumePositionSeconds =
      existingRow!.is_resume && resumeCandidate?.content.id === assignedContent.id ? resumeCandidate.positionSeconds : undefined;
    return {
      contentType,
      mission: todaysMissionStrategy.present(assignedContent, existingRow!.is_resume, resumePositionSeconds),
      completedTitle: null,
    };
  }

  const resumeCandidate = continueLearningStrategy.find(progressRows, catalogForType);
  const mission = todaysMissionStrategy.decide({ resumeCandidate, ranked: rankedForType });

  if (mission) {
    try {
      await supabase.from("daily_missions").upsert({
        user_id: userId,
        mission_date: today,
        content_type: contentType,
        content_item_id: mission.contentId,
        is_resume: mission.kind === "continue_podcast" || mission.kind === "continue_article",
      });
    } catch {
      // Non-fatal — worst case this slot is recomputed on the next request today.
    }
  }

  return { contentType, mission, completedTitle: null };
}

/**
 * Orchestrates the strategies above into what Home actually needs, and
 * owns the one piece of Learning Brain state that's genuinely persistent:
 * docs/content-lifecycle.md §5's "Today's Mission is a finite daily plan
 * — one article slot and one podcast slot, each computed once per
 * calendar day and never replaced once completed." This is product-flow
 * behavior that stays true regardless of which engine implements the
 * underlying ranking, so it sits above the swappable strategies rather
 * than inside any one of them.
 */
export const dailyMissionGenerator = {
  async generate(params: {
    supabase: Client;
    userId: string;
    catalog: MissionContent[];
    progressRows: ProgressRow[];
    context: LearnerContext;
    recommendCount?: number;
    /** Pre-fetched today's daily_missions rows — skips an internal DB round trip when provided. */
    prefetchedTodaysMissions?: DailyMissionRow[] | null;
  }): Promise<HomeRecommendations> {
    const { supabase, userId, catalog, progressRows, context, recommendCount = 3, prefetchedTodaysMissions } = params;
    const byId = new Map(catalog.map((item) => [item.id, item]));
    const today = todayIsoDate();

    const ranked = await ruleBasedLearningBrain.rank(catalog, context);

    const existingRows: DailyMissionRow[] | null =
      prefetchedTodaysMissions !== undefined
        ? prefetchedTodaysMissions
        : (await supabase.from("daily_missions").select("*").eq("user_id", userId).eq("mission_date", today)).data;

    const existingByType = new Map((existingRows ?? []).map((row: DailyMissionRow) => [row.content_type, row]));

    const missions = await Promise.all(
      SLOT_TYPES.map((contentType) =>
        resolveSlot({
          supabase,
          userId,
          today,
          contentType,
          byId,
          catalogForType: catalog.filter((item) => item.contentType === contentType),
          rankedForType: ranked.filter((item) => item.contentType === contentType),
          progressRows,
          context,
          existingRow: existingByType.get(contentType),
        }),
      ),
    );

    const allMissionsCompleted = missions.every((slot) => slot.completedTitle !== null);

    const excludeIds = new Set(missions.map((slot) => slot.mission?.contentId).filter((id): id is string => id !== undefined));
    const tutoRecommends = ranked.filter((item) => !excludeIds.has(item.id)).slice(0, recommendCount);

    return { missions, allMissionsCompleted, tutoRecommends };
  },
};
