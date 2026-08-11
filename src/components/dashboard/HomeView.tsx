"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { ContinueLearningCard } from "@/components/dashboard/ContinueLearningCard";
import { PracticeAssessGrid } from "@/components/dashboard/PracticeAssessGrid";
import { WeakAreasCard } from "@/components/dashboard/WeakAreasCard";
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

// Keep the full props interface so dashboard/page.tsx doesn't need changes.
// Only a subset is rendered — the rest is preserved for backward compatibility.
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
  latestMockReading: SectionScore | null;
  latestMockListening: SectionScore | null;
  weakAreas: string[];
}

function timeOfDayGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

export function HomeView({
  displayName,
  streak,
  placementCompleted,
  resume,
  weakAreas,
}: HomeViewProps) {
  return (
    <div className="mx-auto max-w-3xl">
      {/* ── Greeting ── */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="px-5 pt-8 sm:px-8 md:pt-10"
      >
        <h1 className="text-2xl font-bold text-text-primary">
          {timeOfDayGreeting()}, {displayName}
        </h1>
        <p className="mt-1 text-sm text-text-secondary">
          {streak > 0
            ? `${streak}-day streak — keep it going!`
            : "Ready to make progress today?"}
        </p>
      </motion.div>

      {/* ── Continue Learning ── */}
      {resume && <ContinueLearningCard resume={resume} />}

      {/* ── Practice & Assess ── */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.15 }}
      >
        <PracticeAssessGrid />
      </motion.div>

      {/* ── Weak Areas ── */}
      {weakAreas.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
        >
          <WeakAreasCard weakAreas={weakAreas} />
        </motion.div>
      )}

      {/* ── View Full Plan strip ── */}
      {placementCompleted && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.25 }}
          className="mb-10 mt-4 px-5 sm:px-8"
        >
          <Link
            href="/plan"
            className="flex items-center justify-between rounded-2xl border border-border bg-bg-card p-4 shadow-sm transition-shadow hover:shadow-md"
          >
            <div>
              <p className="text-sm font-bold text-text-primary">View Full Plan</p>
              <p className="text-xs text-text-secondary">Your 28-day personalised path</p>
            </div>
            <ChevronRight className="h-5 w-5 text-text-tertiary" aria-hidden="true" />
          </Link>
        </motion.div>
      )}
    </div>
  );
}
