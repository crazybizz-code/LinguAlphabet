"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { Award, ChevronRight, Sparkles } from "lucide-react";
import { TutoNoteCard } from "@/components/mascot/TutoNoteCard";
import { AchievementsGrid } from "@/components/achievements/AchievementsGrid";
import { TodaysMissionCard } from "@/components/dashboard/TodaysMissionCard";
import { TodaysPlanCard } from "@/components/dashboard/TodaysPlanCard";
import { WordReviewCard } from "@/components/dashboard/WordReviewCard";
import { ExamReadinessCard } from "@/components/dashboard/ExamReadinessCard";
import { HeroLevelCard } from "@/components/dashboard/HeroLevelCard";
import { PracticeAssessGrid } from "@/components/dashboard/PracticeAssessGrid";
import { WeakAreasCard } from "@/components/dashboard/WeakAreasCard";
import { RecommendationCard } from "@/components/dashboard/RecommendationCard";
import type { SectionScore } from "@/components/dashboard/HeroLevelCard";
import type { ArticleContent, CefrLevel, PodcastContent } from "@/types/content";
import type { DailyMissionSlot } from "@/lib/learning-brain";
import type { ResumeStrip } from "@/lib/dashboard/resume";
import type { TutoNote } from "@/lib/tuto/messages";
import type { TodayPlanDay } from "@/lib/planning/today";

export interface HomeRecommendation {
  item: PodcastContent | ArticleContent;
  reason: string;
}

export interface HomeViewProps {
  displayName: string;
  streak: number;
  cefrLevel: CefrLevel | null;
  currentBand: number | null;
  targetBand: number | null;
  examTimeline: string | null;
  examDate: string | null;
  todayMinutes: number;
  dailyGoalMinutes: number;
  missions: DailyMissionSlot[];
  allMissionsCompleted: boolean;
  resume: ResumeStrip | null;
  tutoNote: TutoNote | null;
  recommendations: HomeRecommendation[];
  dueVocabularyCount: number;
  placementCompleted: boolean;
  earnedAchievementIds: Set<string>;
  todayPlan: TodayPlanDay | null;
  /** Reading section score from latest completed mock — null until first mock. */
  latestMockReading: SectionScore | null;
  /** Listening section score from latest completed mock — null until first mock. */
  latestMockListening: SectionScore | null;
  /** Weak areas from recent practice / mock signals — empty until first session. */
  weakAreas: string[];
}

const section = {
  hidden: { opacity: 0, y: 16 },
  visible: (delay: number) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.4, delay },
  }),
};

export function HomeView({
  displayName,
  streak,
  cefrLevel,
  currentBand,
  targetBand,
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
  todayPlan,
  latestMockReading,
  latestMockListening,
  weakAreas,
}: HomeViewProps) {
  return (
    <div className="mx-auto max-w-3xl">
      {/* 1 — Hero level card (dark gradient, Base44 §1) */}
      <motion.div custom={0} variants={section} initial="hidden" animate="visible">
        <HeroLevelCard
          cefrLevel={cefrLevel}
          currentBand={currentBand}
          targetBand={targetBand}
          placementCompleted={placementCompleted}
          reading={latestMockReading}
          listening={latestMockListening}
        />
      </motion.div>

      {/* Placement prompt — only before the learner has a real assessed level */}
      <ExamReadinessCard placementCompleted={placementCompleted} displayName={displayName} />

      {/* 2 — Today's Plan (adaptive 28-day plan tasks, Base44 §2) */}
      {placementCompleted && todayPlan && (
        <motion.div custom={0.08} variants={section} initial="hidden" animate="visible">
          <TodaysPlanCard
            tasks={todayPlan.tasks}
            dayNumber={todayPlan.dayNumber}
            theme={todayPlan.theme}
          />
        </motion.div>
      )}

      {/* 3 — Continue Learning / Today's Mission (podcast + article slots, Base44 §3) */}
      <motion.div custom={0.15} variants={section} initial="hidden" animate="visible">
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
      </motion.div>

      {/* 4 — Practice & Assess (2-col grid, Base44 §4) */}
      {placementCompleted && (
        <motion.div custom={0.2} variants={section} initial="hidden" animate="visible">
          <PracticeAssessGrid />
        </motion.div>
      )}

      {/* 5 — Weak Areas (Base44 §5) */}
      {weakAreas.length > 0 && (
        <motion.div custom={0.25} variants={section} initial="hidden" animate="visible">
          <WeakAreasCard weakAreas={weakAreas} />
        </motion.div>
      )}

      {/* Vocabulary review pill */}
      <WordReviewCard dueCount={dueVocabularyCount} />

      {/* Tuto note — contextual coaching message */}
      {tutoNote && (
        <motion.section
          custom={0.3}
          variants={section}
          initial="hidden"
          animate="visible"
          className="mt-5 px-5 sm:px-8"
        >
          <TutoNoteCard note={tutoNote} />
        </motion.section>
      )}

      {/* 7 — Recommended Resources (Base44 §7) */}
      {recommendations.length > 0 && (
        <motion.section
          custom={0.35}
          variants={section}
          initial="hidden"
          animate="visible"
          className="mt-8 px-5 sm:px-8"
        >
          <div className="mb-1 flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" aria-hidden="true" />
            <h2 className="text-sm font-semibold text-text-primary">Chosen by Tuto</h2>
          </div>
          <p className="mb-3 text-xs text-text-secondary">
            Extra practice — great for bonus XP, but Today&apos;s Mission is what keeps your streak going.
          </p>
          <div className="grid grid-cols-3 items-stretch gap-3 max-lg:grid-cols-2 max-md:grid-cols-1">
            {recommendations.map((rec) => (
              <RecommendationCard key={rec.item.id} item={rec.item} reason={rec.reason} />
            ))}
          </div>
        </motion.section>
      )}

      {/* Achievements — recognition, kept at the bottom */}
      <motion.section
        custom={0.4}
        variants={section}
        initial="hidden"
        animate="visible"
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
        <AchievementsGrid earnedAchievementIds={earnedAchievementIds} baseDelay={0.45} />
      </motion.section>
    </div>
  );
}
