import { missionHref } from "@/lib/learning-brain/strategies/todays-mission";
import type { DailyMissionSlot } from "@/lib/learning-brain";
import type { ArticleContent, PodcastContent } from "@/types/content";

type ResumableContent = PodcastContent | ArticleContent;

export interface ResumeCandidateInput {
  content: ResumableContent;
  positionSeconds: number;
}

export interface ResumeStrip {
  title: string;
  href: string;
  /** 0–100 for podcasts; null for articles, which have no positional progress to report. */
  percentage: number | null;
  /** Whole minutes remaining, podcasts only. */
  minutesLeft: number | null;
}

/**
 * The compact "Continue Learning" strip shown inside Today's Mission.
 *
 * Returns null when the most recently touched unfinished item is already
 * one of today's mission slots. That is the common case — Today's Mission
 * is resume-priority (strategies/todays-mission.ts), so an in-progress
 * lesson usually *is* the mission, and that row already renders it with a
 * "Resume Learning" CTA, an "In Progress" badge and (now) its own
 * progress bar. Showing it a second time 40px higher inside the same card
 * would be the duplicate-CTA problem, not a feature.
 *
 * What this strip is genuinely for is the orphan case: a lesson started
 * from Explore, or yesterday's mission left unfinished, which today's plan
 * has moved past. Without it, that lesson is invisible from Home.
 */
export function buildResumeStrip(params: {
  candidate: ResumeCandidateInput | null;
  missions: DailyMissionSlot[];
}): ResumeStrip | null {
  const { candidate, missions } = params;
  if (!candidate) return null;

  const { content, positionSeconds } = candidate;

  // A podcast row at 0s means "opened, never played" — not something to
  // invite them back to. Articles have no position to judge by, so any
  // uncompleted row counts.
  const isPodcast = content.contentType === "podcast";
  if (isPodcast && positionSeconds <= 0) return null;

  const alreadyOnScreen = missions.some((slot) => slot.mission?.contentId === content.id);
  if (alreadyOnScreen) return null;

  const durationSeconds = isPodcast ? content.durationSeconds : 0;
  const hasDuration = isPodcast && durationSeconds > 0;

  return {
    title: content.title,
    href: missionHref(content),
    percentage: hasDuration ? Math.min(100, (positionSeconds / durationSeconds) * 100) : null,
    minutesLeft: hasDuration ? Math.max(0, Math.round((durationSeconds - positionSeconds) / 60)) : null,
  };
}
