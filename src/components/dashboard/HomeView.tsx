"use client";

import { useSyncExternalStore } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { Flame, Sparkles } from "lucide-react";
import { Tuto } from "@/components/mascot/Tuto";
import { TutoNoteCard } from "@/components/mascot/TutoNoteCard";
import { PodcastCard } from "@/components/content/PodcastCard";
import { ArticleCard } from "@/components/content/ArticleCard";
import { TodaysMissionCard } from "@/components/dashboard/TodaysMissionCard";
import { getTimeGreeting } from "@/lib/content/home";
import type { ArticleContent, PodcastContent } from "@/types/content";
import type { DailyMissionSlot } from "@/lib/learning-brain";
import type { TutoNote } from "@/lib/tuto/messages";
import { fadeSlideUp } from "@/lib/motion/variants";

export interface HomeViewProps {
  displayName: string;
  streak: number;
  level: number;
  weeklyMinutes: number;
  weeklyGoalMinutes: number;
  /** Today's finite daily plan: one article slot, one podcast slot (docs/content-lifecycle.md §5). */
  missions: DailyMissionSlot[];
  allMissionsCompleted: boolean;
  tutoNote: TutoNote | null;
  recommendations: Array<PodcastContent | ArticleContent>;
}

export function HomeView({
  displayName,
  streak,
  level,
  weeklyMinutes,
  weeklyGoalMinutes,
  missions,
  allMissionsCompleted,
  tutoNote,
  recommendations,
}: HomeViewProps) {
  const weeklyPercentage = weeklyGoalMinutes > 0 ? Math.min(100, (weeklyMinutes / weeklyGoalMinutes) * 100) : 0;

  // The server has no idea what timezone the learner is in (and its own
  // clock is UTC on Vercel), so the greeting can only be correct if it's
  // read from the browser's clock. useSyncExternalStore (same pattern as
  // useMediaQuery.ts) rather than useState+useEffect: there's no real
  // "change event" to subscribe to (the greeting only needs to be right
  // once per load, not ticking live), so the subscribe callback is a
  // no-op — but this is still the sanctioned way to read external,
  // clock-dependent state without a hydration mismatch, since the server
  // snapshot (used for SSR and the client's first hydration pass) stays a
  // neutral placeholder and only the real client snapshot reads the clock.
  const greeting = useSyncExternalStore(
    () => () => {},
    () => getTimeGreeting(new Date().getHours()),
    () => "Welcome back",
  );

  return (
    <div className="mx-auto max-w-3xl">
      {/* Greeting — docs/dashboard-architecture.md §4.1: personalized, quiet, not a hero.
          Tuto appears here because a daily welcome is a meaningful moment, not decoration. */}
      <header className="flex items-start justify-between gap-4 px-5 pb-2 pt-8 sm:px-8 md:pt-10">
        <motion.div variants={fadeSlideUp} initial="hidden" animate="visible" className="min-w-0 flex-1 pt-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-text-primary sm:text-3xl">
              {greeting}, {displayName} <span className="inline-block">👋</span>
            </h1>
            {streak > 0 && (
              <span className="flex items-center gap-1 rounded-full bg-primary-lighter px-2.5 py-1 text-xs font-semibold text-primary">
                <Flame className="h-3 w-3" aria-hidden="true" />
                <span aria-label={`${streak} day streak`}>{streak}</span>
              </span>
            )}
          </div>
          <p className="mt-1.5 text-sm leading-relaxed text-text-secondary sm:text-[15px]">
            &ldquo;I&apos;ve prepared today&apos;s learning session for you.&rdquo;
          </p>
        </motion.div>
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="relative shrink-0"
        >
          <div className="absolute inset-0 rounded-full bg-primary-soft blur-2xl" aria-hidden="true" />
          {/* `wave` is reserved for Welcome/first-time onboarding — this is
              a daily-return greeting, so it gets Tuto's normal presence. */}
          <Tuto pose="neutral" size="md" animation="float" priority />
        </motion.div>
      </header>

      {/* Today's Mission — a finite daily plan, not an endless recommendation
          stream (docs/content-lifecycle.md §5): one article slot, one podcast
          slot, tracked independently. Once both are completed the entire
          card switches to a celebration state with a countdown to
          tomorrow — no new mission is generated for the rest of the day. */}
      <TodaysMissionCard missions={missions} allMissionsCompleted={allMissionsCompleted} />

      {/* Tuto's note — optional, contextual, generated from the learner's actual state
          (docs/dashboard-architecture.md §4.3). Only appears when there's something
          genuine to say; never a generic greeting or a random quote. */}
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

      {/* Tuto Recommends — the only place on Home with more than one choice, still curated. */}
      {recommendations.length > 0 && (
        <motion.section
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.4 }}
          className="mt-8 px-5 sm:px-8"
        >
          <div className="mb-3 flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" aria-hidden="true" />
            <h3 className="text-sm font-semibold text-text-primary">Recommended by Tuto</h3>
          </div>
          <div className="grid grid-cols-3 gap-4 max-lg:grid-cols-2 max-md:grid-cols-1">
            {recommendations.map((item, index) =>
              item.contentType === "article" ? (
                <ArticleCard key={item.id} article={item} tutosPick index={index} />
              ) : (
                <PodcastCard key={item.id} podcast={item} tutosPick index={index} />
              ),
            )}
          </div>
        </motion.section>
      )}

      {/* Progress snapshot — narrative strip, never a stat wall (docs/dashboard-architecture.md §4.5). */}
      <motion.section
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.5 }}
        className="mb-10 mt-8 px-5 sm:px-8"
      >
        <h3 className="mb-3 text-sm font-semibold text-text-primary">Learning Journey</h3>
        <Link href="/progress" className="block rounded-[1.75rem] bg-bg-muted p-6 transition-colors hover:bg-bg-muted/70 sm:p-8">
          <div className="flex flex-wrap items-center gap-6">
            <div className="flex items-center gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary-lighter">
                <Flame className="h-6 w-6 text-primary" aria-hidden="true" />
              </span>
              <div>
                <p className="text-2xl font-bold leading-none text-text-primary">{streak} Day Streak</p>
                <p className="mt-1 text-xs text-text-tertiary">Keep your momentum going</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary-lighter text-sm font-bold text-primary">
                Lv{level}
              </span>
              <div>
                <p className="text-sm font-semibold text-text-primary">Level {level}</p>
                <p className="text-xs text-text-tertiary">Current level</p>
              </div>
            </div>
          </div>

          <div className="my-6 h-px bg-border" />

          <div>
            <div className="mb-3 flex items-center justify-between">
              <p className="text-sm font-semibold text-text-primary">Weekly Goal</p>
              <p className="text-sm font-semibold text-text-tertiary">
                {Math.round(weeklyMinutes)} / {Math.round(weeklyGoalMinutes)} min
              </p>
            </div>
            <div
              className="h-2.5 w-full overflow-hidden rounded-full bg-border"
              role="progressbar"
              aria-label="Weekly goal progress"
              aria-valuenow={Math.round(weeklyPercentage)}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <div
                className="h-full rounded-full bg-primary transition-all duration-500"
                style={{ width: `${weeklyPercentage}%` }}
              />
            </div>
          </div>
        </Link>
      </motion.section>
    </div>
  );
}
