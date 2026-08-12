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
  streak,
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
    <div className="mx-auto max-w-3xl">
      {/* ── Hero level card ── */}
      <HeroLevelCard
        cefrLevel={cefrLevel}
        currentBand={currentBand}
        targetBand={targetBand}
        placementCompleted={placementCompleted}
        reading={latestMockReading}
        listening={latestMockListening}
      />

      {/* ── Today's Plan ── */}
      {todayPlan && todayPlan.tasks.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="mt-4 px-5 sm:px-8"
        >
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-text-primary">{"Today’s Plan"}</h2>
            <Link href="/plan" className="text-xs font-medium text-primary hover:underline">
              View Full Plan
            </Link>
          </div>
          <div className="rounded-2xl border border-border bg-bg-card p-4 shadow-sm">
            <ul className="space-y-2">
              {todayPlan.tasks.map((task) => {
                const Icon = TASK_ICONS[task.taskType] ?? ListChecks;
                return (
                  <li key={task.id} className="flex items-center gap-3">
                    <span
                      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${
                        task.completed
                          ? "bg-success/10 text-success"
                          : "bg-border/40 text-text-secondary"
                      }`}
                    >
                      {task.completed ? (
                        <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                      ) : (
                        <Icon className="h-4 w-4" aria-hidden="true" />
                      )}
                    </span>
                    <span
                      className={`flex-1 text-sm ${
                        task.completed
                          ? "line-through text-text-secondary"
                          : "text-text-primary"
                      }`}
                    >
                      {task.title}
                    </span>
                    {task.estimatedMinutes !== null && (
                      <span className="shrink-0 rounded-full bg-border/60 px-2 py-0.5 text-[11px] font-medium text-text-tertiary">
                        {task.estimatedMinutes}m
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
            <div className="mt-3 flex items-center justify-between border-t border-border/40 pt-3">
              <span className="text-xs text-text-secondary">
                {todayPlan.tasks.reduce((s, t) => s + (t.estimatedMinutes ?? 0), 0)} min total
              </span>
              {(() => {
                const link = firstIncompleteLink(todayPlan.tasks);
                return link ? (
                  <Link
                    href={link}
                    className="rounded-full bg-[#0F172A] px-4 py-1.5 text-xs font-semibold text-white transition-opacity hover:opacity-80"
                  >
                    Continue
                  </Link>
                ) : (
                  <span className="rounded-full bg-border px-4 py-1.5 text-xs font-semibold text-text-tertiary cursor-not-allowed">
                    Continue
                  </span>
                );
              })()}
            </div>
          </div>
        </motion.div>
      )}

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

      {/* ── Progress mini ── */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.3 }}
        className="mt-4 px-5 sm:px-8"
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-text-primary">Progress</h2>
          <Link href="/progress" className="text-xs font-medium text-primary hover:underline">
            View all →
          </Link>
        </div>
        <div className="space-y-3 rounded-2xl border border-border bg-bg-card p-4 shadow-sm">
          {latestMockReading && latestMockListening && (
            <div className="space-y-2">
              {(
                [
                  { label: "Reading", pct: latestMockReading.scorePct },
                  { label: "Listening", pct: latestMockListening.scorePct },
                ] as const
              ).map(({ label, pct }) => (
                <div key={label}>
                  <div className="mb-1 flex items-center justify-between">
                    <span className="text-xs text-text-secondary">{label}</span>
                    <span className="text-xs font-semibold text-text-primary">
                      {Math.round(pct)}%
                    </span>
                  </div>
                  <div className="h-1.5 w-full rounded-full bg-border">
                    <div
                      className="h-full rounded-full bg-primary transition-all"
                      style={{ width: `${Math.min(100, Math.round(pct))}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
          {(cefrLevel || currentBand !== null) && (
            <div className="flex flex-wrap items-center gap-2">
              {cefrLevel && (
                <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-bold text-primary">
                  {cefrLevel}
                </span>
              )}
              {currentBand !== null && (
                <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-bold text-primary">
                  Band {currentBand}
                </span>
              )}
            </div>
          )}
          {!latestMockReading && !latestMockListening && cefrLevel === null && currentBand === null && (
            <p className="text-xs text-text-secondary">
              Complete your first mock to see score results here.
            </p>
          )}
          <div className="pt-0.5">
            <Link href="/mock" className="text-xs font-medium text-primary hover:underline">
              Next assessment →
            </Link>
          </div>
        </div>
      </motion.div>

      {/* ── Recommendations ── */}
      {recommendations.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.35 }}
          className="mt-4 px-5 sm:px-8"
        >
          <h2 className="mb-3 text-sm font-semibold text-text-primary">
            Recommended for your level
          </h2>
          <div className="space-y-3">
            {recommendations.slice(0, 3).map((rec) => {
              const isPodcast = rec.item.contentType === "podcast";
              const href = isPodcast
                ? `/podcast/${rec.item.id}/learn`
                : `/article/${rec.item.id}/learn`;
              return (
                <div
                  key={rec.item.id}
                  className="rounded-2xl border border-border bg-bg-card p-4 shadow-sm"
                >
                  <div className="flex items-start gap-3">
                    <span className="mt-0.5 text-xl" aria-hidden="true">
                      {isPodcast ? "🎙️" : "📄"}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="mb-1 flex items-center gap-2">
                        <span className="rounded-full bg-border/60 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-text-secondary">
                          {rec.item.contentType}
                        </span>
                      </div>
                      <p className="truncate text-sm font-semibold text-text-primary">
                        {rec.item.title}
                      </p>
                      <p className="mt-0.5 line-clamp-2 text-xs text-text-secondary">
                        {rec.reason}
                      </p>
                    </div>
                    <Link
                      href={href}
                      className="mt-0.5 shrink-0 text-xs font-semibold text-primary hover:underline"
                    >
                      Start →
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
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
