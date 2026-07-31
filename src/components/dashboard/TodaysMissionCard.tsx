"use client";

import { useSyncExternalStore } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight, BookOpen, CheckCircle2, Clock, Headphones, Play } from "lucide-react";
import { Tuto } from "@/components/mascot/Tuto";
import type { DailyMissionSlot } from "@/lib/learning-brain";
import type { ResumeStrip } from "@/lib/dashboard/resume";
import type { ArticleContent, PodcastContent } from "@/types/content";

const SLOT_LABEL: Record<DailyMissionSlot["contentType"], string> = {
  article: "Read today's article",
  podcast: "Listen to today's podcast",
};

function slotIcon(contentType: DailyMissionSlot["contentType"]) {
  return contentType === "article" ? (
    <BookOpen className="h-5 w-5 text-white" aria-hidden="true" />
  ) : (
    <Headphones className="h-5 w-5 text-white" aria-hidden="true" />
  );
}

function msUntilNextMidnight(): number {
  const now = new Date();
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0, 0);
  return next.getTime() - now.getTime();
}

function formatCountdown(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = String(Math.floor(totalSeconds / 3600)).padStart(2, "0");
  const minutes = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, "0");
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  return `${hours}:${minutes}:${seconds}`;
}

/** Live countdown to the next calendar day, when tomorrow's mission unlocks. Client-only — the server doesn't know the learner's timezone or clock, so the server/first-hydration snapshot stays a neutral placeholder (same pattern as the greeting in HomeView) and only the real client snapshot ticks. */
function NextMissionCountdown() {
  const remainingMs = useSyncExternalStore(
    (onStoreChange) => {
      const id = setInterval(onStoreChange, 1000);
      return () => clearInterval(id);
    },
    () => msUntilNextMidnight(),
    () => null,
  );

  if (remainingMs === null) return null;

  return (
    <p className="mt-3 font-mono text-sm font-semibold tabular-nums text-text-secondary">
      New mission unlocks in {formatCountdown(remainingMs)}
    </p>
  );
}

function MissionSlotRow({ slot }: { slot: DailyMissionSlot }) {
  if (slot.completedTitle) {
    return (
      <div className="flex items-center gap-3 rounded-2xl bg-white/10 p-4">
        <CheckCircle2 className="h-5 w-5 shrink-0 text-white" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-white/70 line-through decoration-white/40">{slot.completedTitle}</p>
          <p className="text-xs text-white/60">{SLOT_LABEL[slot.contentType]} — done</p>
        </div>
      </div>
    );
  }

  if (!slot.mission) {
    return (
      <div className="flex items-center gap-3 rounded-2xl bg-white/10 p-4">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/15">{slotIcon(slot.contentType)}</span>
        <p className="text-sm text-white/70">Tuto is preparing {SLOT_LABEL[slot.contentType].toLowerCase()}</p>
      </div>
    );
  }

  const mission = slot.mission;
  return (
    <Link
      href={mission.ctaHref}
      className="group flex items-center gap-3 rounded-2xl bg-white/15 p-4 transition-colors duration-200 hover:bg-white/25"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/20">{slotIcon(slot.contentType)}</span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-bold text-white">{mission.title}</p>
        <p className="mt-0.5 flex items-center gap-1 text-xs text-white/70">
          <Clock className="h-3 w-3" aria-hidden="true" />
          {Math.round(mission.estimatedMinutes)} min · Level {mission.cefrLevel}
          {/* Sprint Learning Polish 1 ("Mission vs Extra Practice
              distinction"): badgeLabel ("Prepared by Tuto" / "In Progress")
              was already computed by buildMission but never rendered
              anywhere — reinforces that this slot, unlike the Recommended
              cards further down the page, is today's official pick. */}
          <span aria-hidden="true">·</span>
          {mission.badgeLabel}
        </p>
        {/* When today's mission IS the half-finished lesson (the common
            case — Today's Mission is resume-priority), this bar is the
            Continue Learning affordance, inline. buildMission has always
            computed progressPercentage; nothing ever rendered it, which
            is why a returning learner couldn't see how far in they were. */}
        {mission.progressPercentage !== null && (
          <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-white/25" aria-hidden="true">
            <div className="h-full rounded-full bg-white" style={{ width: `${mission.progressPercentage}%` }} />
          </div>
        )}
      </div>
      <span className="hidden shrink-0 items-center gap-1 rounded-full bg-white px-3 py-1.5 text-xs font-bold text-primary sm:flex">
        {mission.ctaLabel}
        <ArrowRight className="h-3.5 w-3.5 transition-transform duration-300 group-hover:translate-x-1" aria-hidden="true" />
      </span>
      <ArrowRight className="h-4 w-4 shrink-0 text-white/70 transition-transform duration-300 group-hover:translate-x-1 sm:hidden" aria-hidden="true" />
    </Link>
  );
}

/**
 * The compact Continue Learning strip — only ever rendered for a lesson
 * that is NOT already one of today's slots (see buildResumeStrip). Sits
 * after the plan rather than before it: today's plan is the commitment,
 * this is the loose end.
 */
function ContinueLearningStrip({ resume }: { resume: ResumeStrip }) {
  return (
    <Link
      href={resume.href}
      className="group mt-3 flex items-center gap-3 rounded-choice bg-white/10 p-3.5 transition-colors duration-200 hover:bg-white/20"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-white/20">
        <Play className="h-4 w-4 text-white" aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-white/70">Pick up where you left off</p>
        <p className="truncate text-sm font-bold text-white">{resume.title}</p>
        {resume.percentage !== null && (
          <div className="mt-1.5 flex items-center gap-2">
            <div className="h-1 flex-1 overflow-hidden rounded-full bg-white/25" aria-hidden="true">
              <div className="h-full rounded-full bg-white" style={{ width: `${resume.percentage}%` }} />
            </div>
            {resume.minutesLeft !== null && (
              <span className="shrink-0 text-[11px] font-medium tabular-nums text-white/70">
                {resume.minutesLeft} min left
              </span>
            )}
          </div>
        )}
      </div>
      <ArrowRight
        className="h-4 w-4 shrink-0 text-white/70 transition-transform duration-300 group-hover:translate-x-1"
        aria-hidden="true"
      />
    </Link>
  );
}

/** The learner's own daily_time_minutes, shown where the minutes are actually earned. */
function DailyGoalFooter({ todayMinutes, dailyGoalMinutes }: { todayMinutes: number; dailyGoalMinutes: number }) {
  if (dailyGoalMinutes <= 0) return null;
  const percentage = Math.min(100, (todayMinutes / dailyGoalMinutes) * 100);

  return (
    <div className="mt-5 border-t border-white/20 pt-4">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs font-medium text-white/70">Today&apos;s goal</p>
        <p className="text-xs font-bold text-white tabular-nums">
          {Math.round(todayMinutes)} / {Math.round(dailyGoalMinutes)} min
        </p>
      </div>
      <div
        className="h-1.5 w-full overflow-hidden rounded-full bg-white/25"
        role="progressbar"
        aria-label="Daily goal progress"
        aria-valuenow={Math.round(percentage)}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div className="h-full rounded-full bg-white transition-all duration-500" style={{ width: `${percentage}%` }} />
      </div>
    </div>
  );
}

export interface TodaysMissionCardProps {
  missions: DailyMissionSlot[];
  allMissionsCompleted: boolean;
  /**
   * An unfinished lesson that today's plan has moved past — null in the
   * common case where the in-progress lesson *is* one of the slots above
   * and is already shown there.
   */
  resume: ResumeStrip | null;
  /**
   * Sprint Learning Polish 1 ("Daily Goal on Dashboard") moved here from
   * the Learning Journey strip the IELTS redesign removes. It belongs
   * next to the work that earns the minutes rather than in a stat block
   * at the bottom of the page.
   */
  todayMinutes: number;
  dailyGoalMinutes: number;
  /**
   * Execution Sprint P2 ("Streak at risk" nudge): the retention audit's
   * finding was that nothing signals a streak is on the line until it's
   * already too late — this is that signal, but calm rather than
   * alarmist, matching streak.ts's own explicit "never punitive, never
   * 'you broke your streak'" philosophy. Only rendered once there's an
   * actual streak to protect.
   */
  streak: number;
  /**
   * Sprint Learning Polish 1 ("Tomorrow Preview"): the same tutoRecommends
   * list HomeView already fetches and renders in "Recommended by Tuto" —
   * its top item is a reasonable, already-computed preview of what Tuto is
   * likely to suggest next. Deliberately not a commitment (tomorrow's real
   * Mission is only assigned once tomorrow's calendar day actually starts,
   * docs/content-lifecycle.md §5), so this is framed as a teaser, not a
   * guarantee — no new ranking/logic, just reusing data already on hand.
   */
  tomorrowPreview: PodcastContent | ArticleContent | null;
}

/**
 * Today's Mission — a finite daily plan, not an endless recommendation
 * stream (docs/content-lifecycle.md §5): one article slot and one podcast
 * slot, tracked independently. Once both are completed, the entire card
 * switches to a celebration state with a countdown to tomorrow — no new
 * mission is generated for the rest of the calendar day.
 */
export function TodaysMissionCard({
  missions,
  allMissionsCompleted,
  tomorrowPreview,
  streak,
  resume,
  todayMinutes,
  dailyGoalMinutes,
}: TodaysMissionCardProps) {
  if (allMissionsCompleted) {
    return (
      <motion.section
        initial={{ opacity: 0, y: 16, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.5, delay: 0.2, ease: [0, 0, 0.2, 1] }}
        className="mt-4 px-5 sm:px-8"
      >
        <div className="flex flex-col items-center gap-3 rounded-[2rem] border border-success/30 bg-success-soft px-6 py-10 text-center">
          <Tuto pose="celebrating" size="sm" />
          <p className="text-xl font-bold text-text-primary">🎉 Today&apos;s Mission Completed</p>
          <p className="max-w-sm text-sm text-text-secondary">Great work! Come back tomorrow for your next personalized mission.</p>
          <NextMissionCountdown />
          {tomorrowPreview && (
            <p className="mt-2 max-w-sm text-xs text-text-tertiary">
              Tuto&apos;s already thinking about &ldquo;{tomorrowPreview.title}&rdquo; for next time.
            </p>
          )}
          {/* Today's plan being finished doesn't finish a lesson they
              abandoned last week — offered quietly here rather than
              competing with the celebration. */}
          {resume && (
            <Link
              href={resume.href}
              className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-primary underline-offset-4 hover:underline"
            >
              <Play className="h-3.5 w-3.5" aria-hidden="true" />
              Finish &ldquo;{resume.title}&rdquo;
            </Link>
          )}
        </div>
      </motion.section>
    );
  }

  return (
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
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-semibold uppercase tracking-[0.15em] text-white/70">Today&apos;s Mission</p>
              {streak > 0 && (
                <p className="text-xs font-semibold text-white/80">
                  Keep your {streak}-day streak going
                </p>
              )}
            </div>
            <div className="mt-4 flex flex-col gap-3">
              {missions.map((slot) => (
                <MissionSlotRow key={slot.contentType} slot={slot} />
              ))}
            </div>
            {resume && <ContinueLearningStrip resume={resume} />}
            <DailyGoalFooter todayMinutes={todayMinutes} dailyGoalMinutes={dailyGoalMinutes} />
          </div>
        </div>
      </div>
    </motion.section>
  );
}
