import type { ArticleContent, PodcastContent } from "@/types/content";
import type { Mission } from "../types";
import type { ResumeCandidate } from "./continue-learning";

/** The content types Today's Mission can currently be built from — the
 * "small dispatch by contentType" the original podcast-only version's own
 * comment predicted, arrived exactly as described: every field below is
 * generic except the href and the kind. */
export type MissionContent = PodcastContent | ArticleContent;

function missionSubtitle(content: MissionContent): string {
  if (content.skills.length === 0) return "English Practice";
  return `${content.skills.slice(0, 2).join(" & ")} Practice`;
}

/**
 * The Learning Session is the one real destination for both content types
 * today (Podcast Detail/Player remain unbuilt, tasks #31/#32).
 *
 * Exported because Home's Continue Learning strip has to link to exactly
 * the same place a mission row would — two copies of this mapping would
 * drift the moment the player ships.
 */
export function missionHref(content: MissionContent): string {
  return content.contentType === "article" ? `/article/${content.id}/learn` : `/podcast/${content.id}/learn`;
}

function buildMission(content: MissionContent, isResume: boolean, positionSeconds?: number): Mission {
  const isArticle = content.contentType === "article";
  return {
    kind: isArticle ? (isResume ? "continue_article" : "new_article") : isResume ? "continue_podcast" : "new_podcast",
    contentId: content.id,
    title: content.title,
    subtitle: missionSubtitle(content),
    badgeLabel: isResume ? "In Progress" : "Prepared by Tuto",
    cefrLevel: content.cefrLevelMin,
    estimatedMinutes: content.estimatedTimeMinutes,
    ctaHref: missionHref(content),
    ctaLabel: isResume ? "Resume Learning" : "Start Learning",
    // A meaningful percentage needs an audio duration -- podcast-only.
    // Articles have no positional resume state, so their bar stays hidden.
    progressPercentage:
      !isArticle && isResume && positionSeconds !== undefined && content.durationSeconds > 0
        ? Math.min(100, (positionSeconds / content.durationSeconds) * 100)
        : null,
  };
}

/**
 * Layer 3 (docs/domain-model.md "Context-specific selection"): Today's
 * Mission is resume-priority if one exists (docs/content-lifecycle.md
 * §10), else the single top-ranked fresh pick. Exactly one result,
 * locked for the calendar day by whoever calls this (see
 * strategies/daily-mission-generator.ts).
 *
 * The other MissionKinds this architecture reserves room for
 * (flashcard_review, vocabulary_review, quiz_retry, revision) have no
 * backing data yet:
 *   - quiz_retry needs a quiz-attempt log
 *   - vocabulary_review / flashcard_review need spaced-repetition due dates
 *   - revision needs a "studied but not yet mastered" signal
 * Adding one later means a new branch in `decide()` that runs before the
 * fresh-pick fallback — not a redesign of this file or its callers.
 */
export const todaysMissionStrategy = {
  decide(params: { resumeCandidate: ResumeCandidate<MissionContent> | null; ranked: MissionContent[] }): Mission | null {
    if (params.resumeCandidate) {
      return buildMission(params.resumeCandidate.content, true, params.resumeCandidate.positionSeconds);
    }
    const top = params.ranked[0];
    return top ? buildMission(top, false) : null;
  },

  /** Reconstructs the Mission for an already-assigned daily_missions row (§5: locked for the calendar day). */
  present(content: MissionContent, isResume: boolean, positionSeconds?: number): Mission {
    return buildMission(content, isResume, positionSeconds);
  },
};
