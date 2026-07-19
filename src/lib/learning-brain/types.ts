import type { CefrLevel, ContentItem } from "@/types/content";

/**
 * Everything a strategy needs to know about the learner to score or
 * choose content — deliberately just the Learning Profile fields scoring
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
 * Layer 2 (docs/domain-model.md "Scoring"): the stable seam between "the
 * rest of the app" and "however content gets ranked." The V1→V2 path
 * (rule-based → learned model) means swapping what implements this
 * interface, not changing anything that calls it — including making the
 * call async today so a future network-bound AI ranker is a drop-in.
 */
export interface LearningBrainRanker {
  rank<T extends ContentItem>(catalog: T[], context: LearnerContext): Promise<T[]>;
}

/**
 * A Today's Mission is not always "start a new podcast" — the Learning
 * Brain supports several kinds, all rendered by the exact same Home UI
 * (only the content changes, never the layout). `flashcard_review`,
 * `vocabulary_review`, `quiz_retry`, and `revision` are reserved kinds:
 * the type already accounts for them, but nothing can produce them yet
 * because their data sources (a quiz-attempt log, spaced-repetition due
 * dates) don't exist until the Learning Session ships (task #33). Adding
 * one later is a new branch in TodaysMissionStrategy, not a redesign.
 */
export type MissionKind =
  | "continue_podcast"
  | "new_podcast"
  | "continue_article"
  | "new_article"
  | "flashcard_review"
  | "vocabulary_review"
  | "quiz_retry"
  | "revision";

/**
 * The fully-formed, UI-ready shape of Today's Mission. Deliberately NOT a
 * raw ContentItem — every field the Home hero card renders is already
 * decided by the strategy that produced it, so HomeView never branches on
 * `kind` and never needs to change when a new kind is added.
 */
export interface Mission {
  kind: MissionKind;
  contentId: string;
  title: string;
  subtitle: string;
  badgeLabel: string;
  cefrLevel: string;
  estimatedMinutes: number;
  ctaHref: string;
  ctaLabel: string;
  /** 0-100, or null when this mission kind has no meaningful "in progress" state. */
  progressPercentage: number | null;
}

/**
 * Today's Mission is a finite daily plan, not an endless recommendation
 * stream (docs/content-lifecycle.md §5): exactly one article slot and one
 * podcast slot per calendar day, tracked independently. `MissionSlotState`
 * is what Home actually renders per slot.
 */
export type MissionSlotContentType = "article" | "podcast";

export interface DailyMissionSlot {
  contentType: MissionSlotContentType;
  /**
   * Non-null while this slot's assigned content hasn't been completed
   * today (or is null when no eligible content exists yet for this type).
   */
  mission: Mission | null;
  /**
   * Set once this slot's assigned content was completed today. A
   * completed slot is never replaced with a fresh assignment for the rest
   * of the calendar day — that's what makes the daily plan finite.
   */
  completedTitle: string | null;
}
