"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight, Clock, Flame, Headphones, Sparkles } from "lucide-react";
import { Tuto } from "@/components/mascot/Tuto";
import { PodcastCard } from "@/components/content/PodcastCard";
import type { PodcastContent } from "@/types/content";
import type { HomeMission } from "@/lib/learning-brain/home-recommendations";
import { fadeSlideUp } from "@/lib/motion/variants";

export interface HomeViewProps {
  displayName: string;
  greeting: string;
  streak: number;
  level: number;
  weeklyMinutes: number;
  weeklyGoalMinutes: number;
  todaysMission: HomeMission<PodcastContent> | null;
  recommendations: PodcastContent[];
}

function missionSubtitle(podcast: PodcastContent) {
  if (podcast.skills.length === 0) return "English Practice";
  return `${podcast.skills.slice(0, 2).join(" & ")} Practice`;
}

export function HomeView({
  displayName,
  greeting,
  streak,
  level,
  weeklyMinutes,
  weeklyGoalMinutes,
  todaysMission,
  recommendations,
}: HomeViewProps) {
  const weeklyPercentage = weeklyGoalMinutes > 0 ? Math.min(100, (weeklyMinutes / weeklyGoalMinutes) * 100) : 0;
  const missionProgressPercentage =
    todaysMission?.isResume && todaysMission.resumePositionSeconds
      ? Math.min(100, (todaysMission.resumePositionSeconds / todaysMission.content.durationSeconds) * 100)
      : null;

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
          <Tuto pose="wave" size="md" animation="float" priority />
        </motion.div>
      </header>

      {/* Today's Mission — the hero. One card, one CTA (docs/dashboard-architecture.md §4.2).
          When an unfinished item exists it takes priority and IS the mission
          (docs/content-lifecycle.md §10) rather than competing with a separate
          "continue" card further down the page. */}
      {todaysMission ? (
        <motion.section
          initial={{ opacity: 0, y: 16, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.5, delay: 0.2, ease: [0, 0, 0.2, 1] }}
          className="mt-4 px-5 sm:px-8"
        >
          <div className="relative">
            {/* Subtle, slow breathing glow — communicates "this is the one thing
                that matters right now" without being distracting motion. */}
            <motion.div
              className="pointer-events-none absolute -inset-3 rounded-[2.5rem] bg-primary/25 blur-2xl"
              aria-hidden="true"
              animate={{ opacity: [0.5, 0.85, 0.5] }}
              transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
            />
            <div className="relative overflow-hidden rounded-[2rem] bg-gradient-to-br from-primary to-[#FF8C33] p-6 shadow-glow sm:p-8">
              <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/10 blur-2xl" />
              <div className="pointer-events-none absolute -bottom-12 -left-8 h-32 w-32 rounded-full bg-white/10 blur-2xl" />
              <div className="relative">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-xs font-semibold uppercase tracking-[0.15em] text-white/70">Today&apos;s Mission</p>
                  <span className="whitespace-nowrap rounded-full bg-white/20 px-2 py-0.5 text-[10px] font-semibold text-white">
                    {todaysMission.isResume ? "In Progress" : "Prepared by Tuto"}
                  </span>
                </div>
                <div className="mt-4 flex items-center gap-3">
                  <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/20">
                    <Headphones className="h-6 w-6 text-white" aria-hidden="true" />
                  </span>
                  <div>
                    <h2 className="text-xl font-bold leading-tight text-white sm:text-2xl">
                      {todaysMission.content.title}
                    </h2>
                    <p className="mt-0.5 text-sm text-white/80">{missionSubtitle(todaysMission.content)}</p>
                  </div>
                </div>
                <div className="mt-5 flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-white/20 px-3 py-1 text-xs font-semibold text-white">
                    Level {todaysMission.content.cefrLevelMin}
                  </span>
                  <span className="flex items-center gap-1 rounded-full bg-white/20 px-3 py-1 text-xs font-semibold text-white">
                    <Clock className="h-3 w-3" aria-hidden="true" />
                    {Math.round(todaysMission.content.estimatedTimeMinutes)} min
                  </span>
                  <span className="text-xs text-white/60">Estimated completion</span>
                </div>
                {missionProgressPercentage !== null && (
                  <div
                    className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-white/20"
                    role="progressbar"
                    aria-label="Listening progress"
                    aria-valuenow={Math.round(missionProgressPercentage)}
                    aria-valuemin={0}
                    aria-valuemax={100}
                  >
                    <div
                      className="h-full rounded-full bg-white transition-all duration-500"
                      style={{ width: `${missionProgressPercentage}%` }}
                    />
                  </div>
                )}
                <Link
                  href={`/podcast/${todaysMission.content.id}/play`}
                  className="group mt-6 flex w-full items-center justify-center gap-2 rounded-2xl bg-white py-4 text-base font-bold text-primary transition-all duration-300 hover:shadow-xl active:scale-[0.98] sm:w-auto sm:px-8"
                >
                  {todaysMission.isResume ? "Resume Learning" : "Start Learning"}
                  <ArrowRight className="h-5 w-5 transition-transform duration-300 group-hover:translate-x-1" aria-hidden="true" />
                </Link>
              </div>
            </div>
          </div>
        </motion.section>
      ) : (
        <motion.section
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="mt-4 px-5 sm:px-8"
        >
          <div className="flex flex-col items-center rounded-[2rem] border border-border bg-bg-muted px-6 py-12 text-center">
            <Tuto pose="thinking" size="sm" />
            <p className="mt-4 text-lg font-semibold text-text-primary">Tuto is preparing your next mission</p>
            <p className="mt-1 max-w-sm text-sm text-text-tertiary">Check back soon — new content is on its way.</p>
          </div>
        </motion.section>
      )}

      {/* Tuto's note — optional, contextual (docs/dashboard-architecture.md §4.3). Only
          appears when there's something genuine to say; never forced on every visit. */}
      {streak >= 3 && (
        <motion.section
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.3 }}
          className="mt-5 px-5 sm:px-8"
        >
          <div className="flex items-start gap-3 rounded-2xl border border-border bg-bg-card p-4">
            <Tuto pose="happy" size="sm" />
            <p className="pt-0.5 text-sm leading-relaxed text-text-secondary">
              {`“${streak} days in a row — you’re building real momentum. Keep it going today!”`}
            </p>
          </div>
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
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {recommendations.map((podcast, index) => (
              <PodcastCard key={podcast.id} podcast={podcast} tutosPick index={index} />
            ))}
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
