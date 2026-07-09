import type { PodcastContent } from "@/types/content";
import type { Mission } from "../types";
import type { ResumeCandidate } from "./continue-learning";

function missionSubtitle(podcast: PodcastContent): string {
  if (podcast.skills.length === 0) return "English Practice";
  return `${podcast.skills.slice(0, 2).join(" & ")} Practice`;
}

/**
 * Builds the UI-ready Mission from a podcast. When a second content type
 * ships this becomes a small dispatch by `contentType` (see
 * docs/domain-model.md's universal Content Model) — not a rewrite, since
 * every field here is already generic except the href.
 */
function buildMission(podcast: PodcastContent, isResume: boolean, positionSeconds?: number): Mission {
  return {
    kind: isResume ? "continue_podcast" : "new_podcast",
    contentId: podcast.id,
    title: podcast.title,
    subtitle: missionSubtitle(podcast),
    badgeLabel: isResume ? "In Progress" : "Prepared by Tuto",
    cefrLevel: podcast.cefrLevelMin,
    estimatedMinutes: podcast.estimatedTimeMinutes,
    // Podcast Player (/podcast/[id]/play) doesn't exist yet (task #32) — the
    // Learning Session is the one real destination today. Same fix already
    // applied to PodcastCard's Explore/Home grid links; this is the second,
    // independent hardcoded href that one didn't cover.
    ctaHref: `/podcast/${podcast.id}/learn`,
    ctaLabel: isResume ? "Resume Learning" : "Start Learning",
    progressPercentage:
      isResume && positionSeconds !== undefined
        ? Math.min(100, (positionSeconds / podcast.durationSeconds) * 100)
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
 * None of these exist until the Learning Session (task #33) is built.
 * Adding one later means a new branch in `decide()` that runs before the
 * fresh-pick fallback — not a redesign of this file or its callers.
 */
export const todaysMissionStrategy = {
  decide(params: { resumeCandidate: ResumeCandidate<PodcastContent> | null; ranked: PodcastContent[] }): Mission | null {
    if (params.resumeCandidate) {
      return buildMission(params.resumeCandidate.content, true, params.resumeCandidate.positionSeconds);
    }
    const top = params.ranked[0];
    return top ? buildMission(top, false) : null;
  },

  /** Reconstructs the Mission for an already-assigned daily_missions row (§5: locked for the calendar day). */
  present(content: PodcastContent, isResume: boolean, positionSeconds?: number): Mission {
    return buildMission(content, isResume, positionSeconds);
  },
};
