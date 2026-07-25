"use client";

import { useSyncExternalStore } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight, BookOpen, CheckCircle2, Clock, Headphones } from "lucide-react";
import { Tuto } from "@/components/mascot/Tuto";
import type { DailyMissionSlot } from "@/lib/learning-brain";
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
      </div>
      <span className="hidden shrink-0 items-center gap-1 rounded-full bg-white px-3 py-1.5 text-xs font-bold text-primary sm:flex">
        {mission.ctaLabel}
        <ArrowRight className="h-3.5 w-3.5 transition-transform duration-300 group-hover:translate-x-1" aria-hidden="true" />
      </span>
      <ArrowRight className="h-4 w-4 shrink-0 text-white/70 transition-transform duration-300 group-hover:translate-x-1 sm:hidden" aria-hidden="true" />
    </Link>
  );
}

export interface TodaysMissionCardProps {
  missions: DailyMissionSlot[];
  allMissionsCompleted: boolean;
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
export function TodaysMissionCard({ missions, allMissionsCompleted, tomorrowPreview }: TodaysMissionCardProps) {
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
            <p className="text-xs font-semibold uppercase tracking-[0.15em] text-white/70">Today&apos;s Mission</p>
            <div className="mt-4 flex flex-col gap-3">
              {missions.map((slot) => (
                <MissionSlotRow key={slot.contentType} slot={slot} />
              ))}
            </div>
          </div>
        </div>
      </div>
    </motion.section>
  );
}
