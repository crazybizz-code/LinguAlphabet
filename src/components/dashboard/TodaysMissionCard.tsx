"use client";

import { useSyncExternalStore } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight, BookOpen, CheckCircle2, Clock, Headphones, Play } from "lucide-react";
import { Tuto } from "@/components/mascot/Tuto";
import type { DailyMissionSlot } from "@/lib/learning-brain";
import type { ResumeStrip } from "@/lib/dashboard/resume";
import type { ArticleContent, PodcastContent } from "@/types/content";

/** Imperative form — reads as an instruction next to a finished item ("Read today's article — done"). */
const SLOT_LABEL: Record<DailyMissionSlot["contentType"], string> = {
  article: "Read today's article",
  podcast: "Listen to today's podcast",
};

/**
 * Noun form. Needed separately because SLOT_LABEL is a verb phrase, and
 * lowercasing it into "Tuto is preparing read today's article" produced a
 * sentence with two verbs — the first thing a brand-new learner saw while
 * the catalog was still empty.
 */
const SLOT_NOUN: Record<DailyMissionSlot["contentType"], string> = {
  article: "today's article",
  podcast: "today's podcast",
};

/**
 * Two visual weights for the same card.
 *
 * `primary` is the brand-filled hero. `secondary` is the same card in a
 * plain bordered surface, used while the placement assessment is still
 * outstanding: two full-width orange cards stacked read as one slab with
 * two competing white CTAs, and until placement is done the mission is
 * genuinely the lesser of the two actions — it's picked from a
 * self-reported (or unknown) band.
 *
 * A lookup rather than conditionals at each element, so the two variants
 * can't drift apart element by element.
 */
type MissionVariant = "primary" | "secondary";

interface MissionTheme {
  surface: string;
  glow: boolean;
  eyebrow: string;
  streakNote: string;
  rowStatic: string;
  rowLink: string;
  iconChip: string;
  icon: string;
  title: string;
  meta: string;
  completedTitle: string;
  track: string;
  fill: string;
  cta: string;
  mobileArrow: string;
  divider: string;
  goalLabel: string;
  goalValue: string;
}

const THEMES: Record<MissionVariant, MissionTheme> = {
  primary: {
    // Gradient runs toward primary-dark rather than the lighter #FF8C33
    // it used to: white on #FF6B00 is 2.86:1 and on #FF8C33 only 2.32:1,
    // so the old ramp got *less* readable toward the bottom of the card
    // where the small labels live. primary-dark lifts that end to 3.50:1
    // — still short of AA for body text (no fill in this brand's range
    // can reach 4.5:1 against white), but every large/bold element on the
    // card now clears AA-Large, and the type below is sized and weighted
    // to compensate. Documented exception, not an oversight.
    surface: "bg-gradient-to-br from-primary to-primary-dark text-text-on-primary shadow-glow",
    glow: true,
    eyebrow: "text-white",
    streakNote: "text-white",
    rowStatic: "bg-white/15",
    rowLink: "bg-white/15 hover:bg-white/25",
    iconChip: "bg-white/25",
    icon: "text-white",
    title: "text-white",
    meta: "text-white/90",
    completedTitle: "text-white/90 decoration-white/50",
    track: "bg-white/30",
    fill: "bg-white",
    cta: "bg-white text-primary-strong",
    mobileArrow: "text-white",
    divider: "border-white/25",
    goalLabel: "text-white/90",
    goalValue: "text-white",
  },
  secondary: {
    surface: "border border-border bg-bg-card text-text-primary shadow-sm",
    glow: false,
    eyebrow: "text-text-secondary",
    streakNote: "text-text-secondary",
    rowStatic: "bg-bg-muted",
    rowLink: "bg-bg-muted hover:bg-primary-lighter",
    iconChip: "bg-primary-lighter",
    icon: "text-primary",
    title: "text-text-primary",
    meta: "text-text-secondary",
    completedTitle: "text-text-secondary decoration-text-tertiary",
    track: "bg-border",
    fill: "bg-primary",
    cta: "bg-text-primary text-white",
    mobileArrow: "text-text-secondary",
    divider: "border-border",
    goalLabel: "text-text-secondary",
    goalValue: "text-text-primary",
  },
};

function slotIcon(contentType: DailyMissionSlot["contentType"], theme: MissionTheme) {
  const Icon = contentType === "article" ? BookOpen : Headphones;
  return <Icon className={`h-5 w-5 ${theme.icon}`} aria-hidden="true" />;
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

/** Live countdown to the next calendar day, when tomorrow's mission unlocks. Client-only — the server doesn't know the learner's timezone or clock, so the server/first-hydration snapshot stays a neutral placeholder (same pattern as the greeting in ExamSnapshotHeader) and only the real client snapshot ticks. */
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

function MissionSlotRow({ slot, theme }: { slot: DailyMissionSlot; theme: MissionTheme }) {
  if (slot.completedTitle) {
    return (
      <div className={`flex items-center gap-3 rounded-choice p-4 ${theme.rowStatic}`}>
        <CheckCircle2 className={`h-5 w-5 shrink-0 ${theme.icon}`} aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className={`truncate text-sm font-semibold line-through ${theme.completedTitle}`}>{slot.completedTitle}</p>
          <p className={`text-xs ${theme.meta}`}>{SLOT_LABEL[slot.contentType]} — done</p>
        </div>
      </div>
    );
  }

  if (!slot.mission) {
    return (
      <div className={`flex items-center gap-3 rounded-choice p-4 ${theme.rowStatic}`}>
        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-md ${theme.iconChip}`}>
          {slotIcon(slot.contentType, theme)}
        </span>
        <p className={`text-sm font-medium ${theme.meta}`}>Tuto is preparing {SLOT_NOUN[slot.contentType]}</p>
      </div>
    );
  }

  const mission = slot.mission;
  return (
    <Link href={mission.ctaHref} className={`group flex items-center gap-3 rounded-choice p-4 transition-colors duration-200 ${theme.rowLink}`}>
      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-md ${theme.iconChip}`}>
        {slotIcon(slot.contentType, theme)}
      </span>
      <div className="min-w-0 flex-1">
        <p className={`truncate text-sm font-bold ${theme.title}`}>{mission.title}</p>
        <p className={`mt-0.5 flex flex-wrap items-center gap-x-1 text-xs font-medium ${theme.meta}`}>
          <Clock className="h-3 w-3 shrink-0" aria-hidden="true" />
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
          <div className={`mt-2 h-1 w-full overflow-hidden rounded-full ${theme.track}`} aria-hidden="true">
            <div className={`h-full rounded-full ${theme.fill}`} style={{ width: `${mission.progressPercentage}%` }} />
          </div>
        )}
      </div>
      <span className={`hidden shrink-0 items-center gap-1 rounded-full px-3 py-1.5 text-xs font-bold sm:flex ${theme.cta}`}>
        {mission.ctaLabel}
        <ArrowRight className="h-3.5 w-3.5 transition-transform duration-300 group-hover:translate-x-1" aria-hidden="true" />
      </span>
      <ArrowRight
        className={`h-4 w-4 shrink-0 transition-transform duration-300 group-hover:translate-x-1 sm:hidden ${theme.mobileArrow}`}
        aria-hidden="true"
      />
    </Link>
  );
}

/**
 * The compact Continue Learning strip — only ever rendered for a lesson
 * that is NOT already one of today's slots (see buildResumeStrip). Sits
 * after the plan rather than before it: today's plan is the commitment,
 * this is the loose end.
 */
function ContinueLearningStrip({ resume, theme }: { resume: ResumeStrip; theme: MissionTheme }) {
  return (
    <Link href={resume.href} className={`group mt-3 flex items-center gap-3 rounded-choice p-3.5 transition-colors duration-200 ${theme.rowLink}`}>
      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-md ${theme.iconChip}`}>
        <Play className={`h-4 w-4 ${theme.icon}`} aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <p className={`text-[11px] font-semibold uppercase tracking-wide ${theme.eyebrow}`}>Pick up where you left off</p>
        <p className={`truncate text-sm font-bold ${theme.title}`}>{resume.title}</p>
        {resume.percentage !== null && (
          <div className="mt-1.5 flex items-center gap-2">
            <div className={`h-1 max-w-[220px] flex-1 overflow-hidden rounded-full ${theme.track}`} aria-hidden="true">
              <div className={`h-full rounded-full ${theme.fill}`} style={{ width: `${resume.percentage}%` }} />
            </div>
            {resume.minutesLeft !== null && (
              <span className={`shrink-0 text-[11px] font-semibold tabular-nums ${theme.meta}`}>{resume.minutesLeft} min left</span>
            )}
          </div>
        )}
      </div>
      <ArrowRight
        className={`h-4 w-4 shrink-0 transition-transform duration-300 group-hover:translate-x-1 ${theme.mobileArrow}`}
        aria-hidden="true"
      />
    </Link>
  );
}

/** The learner's own daily_time_minutes, shown where the minutes are actually earned. */
function DailyGoalFooter({
  todayMinutes,
  dailyGoalMinutes,
  theme,
}: {
  todayMinutes: number;
  dailyGoalMinutes: number;
  theme: MissionTheme;
}) {
  if (dailyGoalMinutes <= 0) return null;
  const percentage = Math.min(100, (todayMinutes / dailyGoalMinutes) * 100);

  return (
    <div className={`mt-5 border-t pt-4 ${theme.divider}`}>
      <div className="mb-2 flex items-center justify-between">
        {/* "Daily Goal" verbatim, matching the sidebar's label for the same
            metric — two names for one number is how a learner ends up
            wondering whether they're different numbers. */}
        <p className={`text-xs font-medium ${theme.goalLabel}`}>Daily Goal</p>
        <p className={`text-xs font-bold tabular-nums ${theme.goalValue}`}>
          {Math.round(todayMinutes)} / {Math.round(dailyGoalMinutes)} min
        </p>
      </div>
      <div
        className={`h-1.5 w-full overflow-hidden rounded-full ${theme.track}`}
        role="progressbar"
        aria-label="Daily goal progress"
        aria-valuenow={Math.round(percentage)}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div className={`h-full rounded-full transition-all duration-500 ${theme.fill}`} style={{ width: `${percentage}%` }} />
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
  /** Steps the card down to the `secondary` weight while the placement assessment is still the page's primary action. */
  deemphasized?: boolean;
  tomorrowPreview: PodcastContent | ArticleContent | null;
  streak: number;
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
  deemphasized = false,
}: TodaysMissionCardProps) {
  const theme = THEMES[deemphasized ? "secondary" : "primary"];

  if (allMissionsCompleted) {
    return (
      <motion.section
        initial={{ opacity: 0, y: 16, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.5, delay: 0.2, ease: [0, 0, 0.2, 1] }}
        className="mt-4 px-5 sm:px-8"
        aria-labelledby="todays-mission-heading"
      >
        <div className="rounded-[2rem] border border-success/30 bg-success-soft px-6 py-10">
          <div className="flex flex-col items-center gap-3 text-center">
            <Tuto pose="celebrating" size="sm" />
            <h2 id="todays-mission-heading" className="text-xl font-bold text-text-primary">
              🎉 Today&apos;s Mission Completed
            </h2>
            <p className="max-w-sm text-sm text-text-secondary">Great work! Come back tomorrow for your next personalized mission.</p>
            <NextMissionCountdown />
            {tomorrowPreview && (
              <p className="mt-2 max-w-sm text-xs text-text-secondary">
                Tuto&apos;s already thinking about &ldquo;{tomorrowPreview.title}&rdquo; for next time.
              </p>
            )}
            {/* Today's plan being finished doesn't finish a lesson they
                abandoned last week — offered quietly here rather than
                competing with the celebration. */}
            {resume && (
              <Link
                href={resume.href}
                className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-primary-strong underline-offset-4 hover:underline"
              >
                <Play className="h-3.5 w-3.5" aria-hidden="true" />
                Finish &ldquo;{resume.title}&rdquo;
              </Link>
            )}
          </div>
          {/* Finishing the mission doesn't necessarily meet the daily goal
              — and with the Learning Journey strip gone this is the only
              place the goal appears on Home for a mobile learner. */}
          <div className="mx-auto max-w-sm">
            <DailyGoalFooter todayMinutes={todayMinutes} dailyGoalMinutes={dailyGoalMinutes} theme={THEMES.secondary} />
          </div>
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
      aria-labelledby="todays-mission-heading"
    >
      <div className="relative">
        {/* Subtle, slow breathing glow — communicates "this is the one thing
            that matters right now" without being distracting motion. Skipped
            entirely in the secondary variant: nothing should breathe when
            it isn't the primary action. */}
        {theme.glow && (
          <motion.div
            className="pointer-events-none absolute -inset-3 rounded-[2.5rem] bg-primary/25 blur-2xl"
            aria-hidden="true"
            animate={{ opacity: [0.5, 0.85, 0.5] }}
            transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
          />
        )}
        <div className={`relative overflow-hidden rounded-[2rem] p-6 sm:p-8 ${theme.surface}`}>
          {theme.glow && (
            <>
              <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/10 blur-2xl" />
              <div className="pointer-events-none absolute -bottom-12 -left-8 h-32 w-32 rounded-full bg-white/10 blur-2xl" />
            </>
          )}
          <div className="relative">
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
              <h2 id="todays-mission-heading" className={`text-xs font-semibold uppercase tracking-[0.15em] ${theme.eyebrow}`}>
                Today&apos;s Mission
              </h2>
              {streak > 0 && <p className={`text-xs font-semibold ${theme.streakNote}`}>Keep your {streak}-day streak going</p>}
            </div>
            <div className="mt-4 flex flex-col gap-3">
              {missions.map((slot) => (
                <MissionSlotRow key={slot.contentType} slot={slot} theme={theme} />
              ))}
            </div>
            {resume && <ContinueLearningStrip resume={resume} theme={theme} />}
            <DailyGoalFooter todayMinutes={todayMinutes} dailyGoalMinutes={dailyGoalMinutes} theme={theme} />
          </div>
        </div>
      </div>
    </motion.section>
  );
}
