"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { Award, ChevronRight, Sparkles } from "lucide-react";
import { TutoNoteCard } from "@/components/mascot/TutoNoteCard";
import { AchievementsGrid } from "@/components/achievements/AchievementsGrid";
import { TodaysMissionCard } from "@/components/dashboard/TodaysMissionCard";
import { WordReviewCard } from "@/components/dashboard/WordReviewCard";
import { ExamReadinessCard } from "@/components/dashboard/ExamReadinessCard";
import { ExamSnapshotHeader } from "@/components/dashboard/ExamSnapshotHeader";
import { RecommendationCard } from "@/components/dashboard/RecommendationCard";
import type { ArticleContent, PodcastContent } from "@/types/content";
import type { DailyMissionSlot } from "@/lib/learning-brain";
import type { ResumeStrip } from "@/lib/dashboard/resume";
import type { TutoNote } from "@/lib/tuto/messages";

export interface HomeRecommendation {
  item: PodcastContent | ArticleContent;
  /** Precomputed on the server so the reason string and the ranking that produced it can never drift apart. */
  reason: string;
}

export interface HomeViewProps {
  displayName: string;
  streak: number;
  /** Null until the placement assessment establishes one — never defaulted. */
  currentBand: number | null;
  targetBand: number | null;
  /** Onboarding's coarse timeline bucket — used only when no booked date exists. */
  examTimeline: string | null;
  /** A booked exam date (`YYYY-MM-DD`), when the learner has one. */
  examDate: string | null;
  /** Sprint Learning Polish 1 ("Daily Goal on Dashboard") — now rendered inside Today's Mission. */
  todayMinutes: number;
  dailyGoalMinutes: number;
  /** Today's finite daily plan: one article slot, one podcast slot (docs/content-lifecycle.md §5). */
  missions: DailyMissionSlot[];
  allMissionsCompleted: boolean;
  /** An unfinished lesson today's plan has moved past — null when it's already one of the slots. */
  resume: ResumeStrip | null;
  tutoNote: TutoNote | null;
  recommendations: HomeRecommendation[];
  /** Execution Sprint P1 — words due for spaced-repetition review today. 0 renders nothing. */
  dueVocabularyCount: number;
  /** True once the placement assessment has produced a plan; hides the first-mission card. */
  placementCompleted: boolean;
  earnedAchievementIds: Set<string>;
}

/**
 * Home, IELTS-first (Base44 dashboard redesign, Phase 1).
 *
 * The reordering is the product change: the screen now opens with the
 * band gap rather than with a lesson. Everything below it is the same
 * finite daily plan as before — this is a re-frame of what the learner is
 * working toward, not a new content model.
 *
 * The Learning Journey stat strip that used to close the page is gone.
 * Streak, level and the weekly goal all live on /progress, which the
 * redesign leaves untouched, and the streak now also has a tile in the
 * header; the daily goal moved into Today's Mission, next to the work
 * that actually earns the minutes.
 */
export function HomeView({
  displayName,
  streak,
  currentBand,
  targetBand,
  examTimeline,
  examDate,
  todayMinutes,
  dailyGoalMinutes,
  missions,
  allMissionsCompleted,
  resume,
  tutoNote,
  recommendations,
  dueVocabularyCount,
  placementCompleted,
  earnedAchievementIds,
}: HomeViewProps) {
  return (
    <div className="mx-auto max-w-3xl">
      <ExamSnapshotHeader
        displayName={displayName}
        currentBand={currentBand}
        targetBand={targetBand}
        examTimeline={examTimeline}
        examDate={examDate}
        streak={streak}
      />

      {/* Above Today's Mission on purpose: until the placement is done,
          every other recommendation is working from a self-reported band
          rather than evidence. Renders nothing once it's done. */}
      <ExamReadinessCard placementCompleted={placementCompleted} displayName={displayName} />

      {/* Today's Mission — a finite daily plan, not an endless recommendation
          stream (docs/content-lifecycle.md §5): one article slot, one podcast
          slot, tracked independently. Once both are completed the entire
          card switches to a celebration state with a countdown to
          tomorrow — no new mission is generated for the rest of the day. */}
      {/* Stepped down to the secondary weight until placement is done, so
          the page never shows two brand-filled cards with two competing
          white CTAs — and so the one action that unlocks everything else
          is unambiguously the primary one. */}
      <TodaysMissionCard
        missions={missions}
        allMissionsCompleted={allMissionsCompleted}
        tomorrowPreview={recommendations[0]?.item ?? null}
        streak={streak}
        resume={resume}
        todayMinutes={todayMinutes}
        dailyGoalMinutes={dailyGoalMinutes}
        deemphasized={!placementCompleted}
      />

      <WordReviewCard dueCount={dueVocabularyCount} />

      {/* Tuto's note — optional, contextual, generated from the learner's actual
          state (docs/dashboard-architecture.md §4.3). Kept even though the
          Base44 redesign drops it: without it Tuto never speaks on Home,
          only appears, which is the wrong thing to cut from a product whose
          differentiator is a coach. */}
      {tutoNote && (
        <motion.section
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.3 }}
          className="mt-5 px-5 sm:px-8"
        >
          <TutoNoteCard note={tutoNote} />
        </motion.section>
      )}

      {recommendations.length > 0 && (
        <motion.section
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.4 }}
          className="mt-8 px-5 sm:px-8"
        >
          {/* "Chosen by Tuto", not Base44's "Recommended for your target
              band": the ranking uses the learner's CURRENT level (level
              match is the heaviest weight in scoring.ts) and never reads
              target_band at all. A heading naming the target band would
              promise a personalization the engine doesn't do — and each
              card's reason line underneath says "matched to your level",
              which would have contradicted it in the same breath. */}
          <div className="mb-1 flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" aria-hidden="true" />
            <h2 className="text-sm font-semibold text-text-primary">Chosen by Tuto</h2>
          </div>
          {/* Sprint Learning Polish 1 ("Mission vs Extra Practice distinction"):
              only Today's Mission above counts toward streak/mission XP. */}
          <p className="mb-3 text-xs text-text-secondary">
            Extra practice — great for bonus XP, but Today&apos;s Mission is what keeps your streak going.
          </p>
          <div className="grid grid-cols-3 items-stretch gap-3 max-lg:grid-cols-2 max-md:grid-cols-1">
            {recommendations.map((recommendation) => (
              <RecommendationCard key={recommendation.item.id} item={recommendation.item} reason={recommendation.reason} />
            ))}
          </div>
        </motion.section>
      )}

      {/* Achievements — deliberately the last thing on the page and
          visually quiet. They're recognition, not a next action, and the
          full milestone view lives on Progress. */}
      <motion.section
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.5 }}
        className="mb-10 mt-8 px-5 sm:px-8"
      >
        <div className="mb-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Award className="h-4 w-4 text-text-secondary" aria-hidden="true" />
            <h2 className="text-sm font-semibold text-text-primary">Achievements</h2>
          </div>
          <Link
            href="/progress"
            className="flex shrink-0 items-center gap-0.5 text-xs font-semibold text-text-secondary transition-colors hover:text-primary-strong"
          >
            View progress
            <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
        </div>
        <AchievementsGrid earnedAchievementIds={earnedAchievementIds} baseDelay={0.55} />
      </motion.section>
    </div>
  );
}
