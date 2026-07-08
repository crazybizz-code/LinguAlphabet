import type { CefrLevel, ContentItem } from "@/types/content";

/**
 * Everything the Learning Brain needs to know about the learner to score
 * content — deliberately just the Learning Profile fields that scoring
 * actually reads (docs/domain-model.md's Learning Profile), not a whole
 * user object. Content-type agnostic: nothing here is podcast-specific.
 */
export interface LearnerContext {
  englishLevel: CefrLevel | null;
  goal: string | null;
  interests: string[];
  /** Ever-completed content, any content type (docs/content-lifecycle.md §9). */
  completedContentIds: ReadonlySet<string>;
  /** The content type of the learner's most recent mission, for the variety bonus (§3). */
  previousMissionContentType: ContentItem["contentType"] | null;
}

/**
 * The stable seam between "the rest of the app" and "however content
 * gets ranked." docs/dashboard-architecture.md §8's V1→V2 path (rule-based
 * → learned model) means swapping what implements this interface, not
 * changing anything that calls it — including making the call async today
 * so a future network-bound AI ranker is a drop-in, not a call-site change.
 */
export interface LearningBrain {
  /**
   * Ranks `catalog` best-first for `context`. Works over any ContentItem
   * subtype (podcasts today; articles/videos/stories/etc. later) — the
   * Learning Brain never needs to know which concrete content type it's
   * ranking, only the universal fields every content item has.
   */
  rank<T extends ContentItem>(catalog: T[], context: LearnerContext): Promise<T[]>;
}
