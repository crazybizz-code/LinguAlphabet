"use client";

import { motion } from "framer-motion";
import { Sparkles } from "lucide-react";
import { TodaysPlanCard } from "@/components/dashboard/TodaysPlanCard";
import { ContinueLearningCard } from "@/components/dashboard/ContinueLearningCard";
import { ExamReadinessCard } from "@/components/dashboard/ExamReadinessCard";
import { HeroLevelCard } from "@/components/dashboard/HeroLevelCard";
import { PracticeAssessGrid } from "@/components/dashboard/PracticeAssessGrid";
import { WeakAreasCard } from "@/components/dashboard/WeakAreasCard";
import { RecommendationCard } from "@/components/dashboard/RecommendationCard";
import { ProgressMiniCard } from "@/components/dashboard/ProgressMiniCard";
import type { SectionScore } from "@/components/dashboard/HeroLevelCard";
import type { BandSnapshot } from "@/components/dashboard/ProgressMiniCard";
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
  /** Band score snapshots from completed placements — for the progress trend chart. */
  bandHistory: BandSnapshot[];
  /** Days until the next recommended assessment (30-day cadence). */
  nextAssessmentInDays: number | null;
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
  cefrLevel,
  currentBand,
  targetBand,
  resume,
  recommendations,
  placementCompleted,
  todayPlan,
  latestMockReading,
  latestMockListening,
  weakAreas,
  bandHistory,
  nextAssessmentInDays,
}: HomeViewProps) {
  return (
    <div className="mx-auto max-w-3xl pb-10">
      {/* 1 — Hero level card */}
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

      {/* Placement prompt — only before the learner has taken placement (ExamReadinessCard
          is hidden once placement is done; HeroLevelCard already shows the CTA inline
          but the standalone card gives more context for first-time visitors) */}
      {!placementCompleted && (
        <ExamReadinessCard placementCompleted={placementCompleted} displayName={displayName} />
      )}

      {/* 2 — Today's Plan (28-day adaptive plan) */}
      {placementCompleted && todayPlan && (
        <motion.div custom={0.08} variants={section} initial="hidden" animate="visible">
          <TodaysPlanCard
            tasks={todayPlan.tasks}
            dayNumber={todayPlan.dayNumber}
            theme={todayPlan.theme}
          />
        </motion.div>
      )}

      {/* 3 — Continue Learning (standalone resume strip) */}
      {resume && (
        <motion.div custom={0.15} variants={section} initial="hidden" animate="visible">
          <ContinueLearningCard resume={resume} />
        </motion.div>
      )}

      {/* 4 — Practice & Assess (2-col grid) */}
      {placementCompleted && (
        <motion.div custom={0.2} variants={section} initial="hidden" animate="visible">
          <PracticeAssessGrid />
        </motion.div>
      )}

      {/* 5 — Weak Areas */}
      {weakAreas.length > 0 && (
        <motion.div custom={0.25} variants={section} initial="hidden" animate="visible">
          <WeakAreasCard weakAreas={weakAreas} />
        </motion.div>
      )}

      {/* 6 — Progress mini card (band trend chart) */}
      {bandHistory.length > 0 && (
        <motion.div custom={0.3} variants={section} initial="hidden" animate="visible">
          <ProgressMiniCard
            bandHistory={bandHistory}
            nextAssessmentInDays={nextAssessmentInDays}
          />
        </motion.div>
      )}

      {/* 7 — Recommended for your target band */}
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
            <h2 className="text-sm font-semibold text-text-primary">Recommended for your target band</h2>
          </div>
          <p className="mb-3 text-xs text-text-secondary">
            Extra practice — great for bonus XP, but Today&apos;s Plan is what keeps your streak going.
          </p>
          <div className="grid grid-cols-3 items-stretch gap-3 max-lg:grid-cols-2 max-md:grid-cols-1">
            {recommendations.map((rec) => (
              <RecommendationCard key={rec.item.id} item={rec.item} reason={rec.reason} />
            ))}
          </div>
        </motion.section>
      )}
    </div>
  );
}
