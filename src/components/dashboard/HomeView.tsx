"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import {
  ChevronRight,
  Headphones,
  BookOpen,
  PenLine,
  ClipboardList,
  BookCheck,
  ListChecks,
  CheckCircle2,
  FileText,
} from "lucide-react";
import { ContinueLearningCard } from "@/components/dashboard/ContinueLearningCard";
import { HeroLevelCard } from "@/components/dashboard/HeroLevelCard";
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
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

const PODCAST_TASK_TYPES = new Set(["podcast", "listening_practice"]);
const ARTICLE_TASK_TYPES = new Set(["article", "reading_practice"]);

const TASK_ICONS: Record<string, typeof Headphones> = {
  podcast: Headphones,
  listening_practice: Headphones,
  article: BookOpen,
  reading_practice: BookOpen,
  vocabulary: PenLine,
  mock: ClipboardList,
  review: BookCheck,
  quiz: BookCheck,
};

function firstIncompleteLink(tasks: TodayPlanDay["tasks"]): string | null {
  for (const task of tasks) {
    if (task.completed) continue;
    if (task.taskType === "mock") return "/mock";
    if (task.taskType === "practice") return "/practice";
    if (task.contentItemId) {
      if (PODCAST_TASK_TYPES.has(task.taskType)) return `/podcast/${task.contentItemId}/learn`;
      if (ARTICLE_TASK_TYPES.has(task.taskType)) return `/article/${task.contentItemId}/learn`;
    }
    return null;
  }
  return null;
}

export function HomeView({
  displayName,
  cefrLevel,
  currentBand,
  targetBand,
  placementCompleted,
  resume,
  weakAreas,
  todayPlan,
  recommendations,
  latestMockReading,
  latestMockListening,
}: HomeViewProps) {
  return (
    <div className="mx-auto max-w-3xl py-8 md:py-10">
      <header className="mb-5 px-5 sm:px-8">
        <p className="text-sm font-semibold text-text-secondary">{timeOfDayGreeting()}, {displayName}</p>
        <h1 className="mt-1 text-2xl font-bold text-text-primary sm:text-3xl">Ready for today's English?</h1>
      </header>

      <HeroLevelCard cefrLevel={cefrLevel} currentBand={currentBand} targetBand={targetBand} placementCompleted={placementCompleted} reading={latestMockReading} listening={latestMockListening} />

      {todayPlan && todayPlan.tasks.length > 0 && (
        <motion.section initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.2 }} className="mt-4 px-5 sm:px-8">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-text-primary">Today's Plan</h2>
            <Link href="/plan" className="text-xs font-semibold text-primary hover:underline">View Full Plan</Link>
          </div>
          <div className="rounded-[2rem] border border-border bg-bg-card p-5 shadow-sm sm:p-6">
            <ul className="space-y-2">
              {todayPlan.tasks.map((task) => {
                const Icon = TASK_ICONS[task.taskType] ?? ListChecks;
                return (
                  <li key={task.id} className="flex items-center gap-3 rounded-xl border border-border bg-bg-muted p-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-orange-50 text-primary">
                      {task.completed ? <CheckCircle2 className="h-5 w-5" aria-hidden="true" /> : <Icon className="h-5 w-5" aria-hidden="true" />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className={`truncate text-sm font-semibold ${task.completed ? "line-through text-text-secondary" : "text-text-primary"}`}>{task.title}</p>
                      <p className="text-xs text-text-tertiary">{task.estimatedMinutes ?? 0} min</p>
                    </div>
                  </li>
                );
              })}
            </ul>
            <div className="mt-5 flex items-center justify-between">
              <p className="text-xs font-medium text-text-tertiary">Total: {todayPlan.tasks.reduce((sum, task) => sum + (task.estimatedMinutes ?? 0), 0)} min</p>
              {(() => {
                const link = firstIncompleteLink(todayPlan.tasks);
                return link ? <Link href={link} className="rounded-2xl bg-primary px-6 py-3 text-sm font-bold text-white shadow-glow">Continue</Link> : <span className="rounded-2xl bg-border px-6 py-3 text-sm font-bold text-text-tertiary">Continue</span>;
              })()}
            </div>
          </div>
        </motion.section>
      )}

      {resume && <ContinueLearningCard resume={resume} />}
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.15 }}><PracticeAssessGrid /></motion.div>
      {weakAreas.length > 0 && <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.2 }}><WeakAreasCard weakAreas={weakAreas} /></motion.div>}

      <motion.section initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.3 }} className="mt-4 px-5 sm:px-8">
        <div className="mb-3 flex items-center justify-between"><h2 className="text-sm font-semibold text-text-primary">Progress</h2><Link href="/progress" className="text-xs font-semibold text-primary hover:underline">View all</Link></div>
        <div className="space-y-3 rounded-2xl border border-border bg-bg-card p-4 shadow-sm">
          {latestMockReading && latestMockListening ? ([{ label: "Reading", pct: latestMockReading.scorePct }, { label: "Listening", pct: latestMockListening.scorePct }] as const).map(({ label, pct }) => (
            <div key={label}><div className="mb-1 flex items-center justify-between"><span className="text-xs text-text-secondary">{label}</span><span className="text-xs font-semibold text-text-primary">{Math.round(pct)}%</span></div><div className="h-1.5 w-full rounded-full bg-border"><div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, Math.round(pct))}%` }} /></div></div>
          )) : <p className="text-xs text-text-secondary">Complete your first mock to see score results here.</p>}
          <Link href="/mock" className="text-xs font-semibold text-primary hover:underline">Next assessment</Link>
        </div>
      </motion.section>

      {recommendations.length > 0 && (
        <motion.section initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.35 }} className="mt-4 px-5 sm:px-8">
          <h2 className="mb-3 text-sm font-semibold text-text-primary">Recommendations</h2>
          <div className="space-y-3">
            {recommendations.slice(0, 3).map((rec) => {
              const isPodcast = rec.item.contentType === "podcast";
              const href = isPodcast ? `/podcast/${rec.item.id}/learn` : `/article/${rec.item.id}/learn`;
              const Icon = isPodcast ? Headphones : FileText;
              return (
                <div key={rec.item.id} className="rounded-2xl border border-border bg-bg-card p-4 shadow-sm">
                  <div className="flex items-start gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-orange-50 text-primary"><Icon className="h-5 w-5" aria-hidden="true" /></span>
                    <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-text-primary">{rec.item.title}</p><p className="mt-0.5 line-clamp-2 text-xs text-text-secondary">{rec.reason}</p></div>
                    <Link href={href} className="shrink-0 text-xs font-semibold text-primary hover:underline">Start</Link>
                  </div>
                </div>
              );
            })}
          </div>
        </motion.section>
      )}

      {placementCompleted && (
        <motion.section initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.25 }} className="mb-10 mt-4 px-5 sm:px-8">
          <Link href="/plan" className="flex items-center justify-between rounded-2xl border border-border bg-bg-card p-4 shadow-sm transition-shadow hover:shadow-md"><div><p className="text-sm font-bold text-text-primary">View Full Plan</p><p className="text-xs text-text-secondary">Your 28-day personalised path</p></div><ChevronRight className="h-5 w-5 text-text-tertiary" aria-hidden="true" /></Link>
        </motion.section>
      )}
    </div>
  );
}
