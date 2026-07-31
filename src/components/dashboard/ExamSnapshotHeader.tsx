"use client";

import { useSyncExternalStore } from "react";
import type { ComponentType } from "react";
import { motion } from "framer-motion";
import { CalendarClock, Flame, Target, Trophy } from "lucide-react";
import { Tuto } from "@/components/mascot/Tuto";
import { BandProgressBar } from "@/components/dashboard/BandProgressBar";
import { getTimeGreeting } from "@/lib/content/home";
import { buildBandProgress, describeExamTimeline, formatBandValue } from "@/lib/dashboard/exam-snapshot";
import { fadeSlideUp } from "@/lib/motion/variants";

export interface ExamSnapshotHeaderProps {
  displayName: string;
  /** Null is a real state — "Not sure" during onboarding writes NULL rather than a fabricated band. */
  currentBand: number | null;
  targetBand: number | null;
  /** The onboarding bucket ("Within 2 weeks", …), not a date — see describeExamTimeline. */
  examTimeline: string | null;
  streak: number;
}

interface StatTile {
  icon: ComponentType<{ className?: string }>;
  label: string;
  value: string;
  /** Small clarifier under the value, used when the value is a placeholder rather than a measurement. */
  hint?: string;
}

/**
 * Home's opening frame: where the learner is, where they're going, how
 * long they have, and whether they're showing up — before any content
 * appears.
 *
 * This is the load-bearing change of the IELTS-first redesign. The
 * previous Home opened with a lesson, which quietly said "this is a
 * content app"; opening with the band gap says "this is exam prep," and
 * it matches the only two numbers an IELTS candidate actually holds in
 * their head.
 */
export function ExamSnapshotHeader({ displayName, currentBand, targetBand, examTimeline, streak }: ExamSnapshotHeaderProps) {
  // The server has no idea what timezone the learner is in (and its own
  // clock is UTC on Vercel), so the greeting can only be correct if it's
  // read from the browser's clock. useSyncExternalStore (same pattern as
  // useMediaQuery.ts): there's no real "change event" to subscribe to, so
  // the subscribe callback is a no-op — but the server snapshot stays a
  // neutral placeholder, which is what avoids a hydration mismatch.
  const greeting = useSyncExternalStore(
    () => () => {},
    () => getTimeGreeting(new Date().getHours()),
    () => "Welcome back",
  );

  const progress = buildBandProgress(currentBand, targetBand);

  const tiles: StatTile[] = [
    {
      icon: Trophy,
      label: "Current Band",
      value: formatBandValue(currentBand),
      // Never silently substitute a number here: the placement assessment
      // is what establishes a real band, and a guessed one would be the
      // first thing the learner sees every single day.
      hint: currentBand === null ? "After placement" : undefined,
    },
    { icon: Target, label: "Target Band", value: formatBandValue(targetBand) },
    { icon: CalendarClock, label: "Exam Timeline", value: describeExamTimeline(examTimeline) },
    { icon: Flame, label: "Current Streak", value: streak === 1 ? "1 day" : `${streak} days` },
  ];

  return (
    <motion.section
      variants={fadeSlideUp}
      initial="hidden"
      animate="visible"
      className="px-5 pt-8 sm:px-8 md:pt-10"
      aria-labelledby="exam-snapshot-heading"
    >
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-bold tracking-tight text-text-primary sm:text-3xl">
            {greeting}, {displayName}
          </h1>
          <p className="mt-1.5 text-sm leading-relaxed text-text-secondary">
            {targetBand !== null
              ? "Let's close the gap to your target band today."
              : "Let's get your IELTS preparation moving today."}
          </p>
        </div>
        <div className="relative shrink-0">
          <div className="absolute inset-0 rounded-full bg-primary-soft blur-2xl" aria-hidden="true" />
          {/* `wave` is reserved for Welcome/first-time onboarding — this is
              a daily-return greeting, so it gets Tuto's normal presence.
              `avatar` rather than `md`: here Tuto is company beside the
              greeting, not the subject of the screen. */}
          <Tuto pose="neutral" size="avatar" animation="float" priority />
        </div>
      </div>

      {/* The tiles below are the section's real title, but a visible
          heading above them would just repeat what each tile already
          says. Screen readers still get a landmark to jump to. */}
      <h2 id="exam-snapshot-heading" className="sr-only">
        Your IELTS snapshot
      </h2>

      <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {tiles.map((tile) => (
          <div key={tile.label} className="rounded-choice border border-border bg-bg-card p-4 shadow-sm transition-shadow hover:shadow-md">
            <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary-lighter">
              <tile.icon className="h-5 w-5 text-primary" aria-hidden="true" />
            </div>
            {/* text-secondary, not tertiary: #94A3B8 is 2.56:1 on white and
                fails AA outright. These labels are what make the numbers
                mean anything. */}
            <p className="mt-3 text-xs font-medium text-text-secondary">{tile.label}</p>
            <p className="mt-0.5 text-lg font-bold text-text-primary">{tile.value}</p>
            {tile.hint && <p className="mt-0.5 text-[11px] font-medium text-text-secondary">{tile.hint}</p>}
          </div>
        ))}
      </div>

      {progress && currentBand !== null && targetBand !== null && (
        <BandProgressBar progress={progress} currentBand={currentBand} targetBand={targetBand} />
      )}
    </motion.section>
  );
}
