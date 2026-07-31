import {
  Award,
  BookOpen,
  CalendarDays,
  CalendarRange,
  Clock,
  GraduationCap,
  Hourglass,
  Languages,
  Timer,
  Zap,
} from "lucide-react";
import type { ComponentType } from "react";
import type { BandScore, DailyStudyTime, ExamTimeline, ExamType } from "./types";

/**
 * Option data for every choice screen — the exact sets, order and copy
 * from the approved Base44 onboarding. Separated from the components so
 * the lists are reviewable in one place and a screen renders whatever it
 * is handed rather than hardcoding its own options inline.
 */

type IconComponent = ComponentType<{ className?: string }>;

export interface ExamOption {
  id: ExamType;
  icon: IconComponent;
  /** Everything except IELTS Academic renders as a disabled "Coming Soon" tile. */
  available: boolean;
}

export const EXAM_OPTIONS: readonly ExamOption[] = [
  { id: "IELTS Academic", icon: GraduationCap, available: true },
  { id: "IELTS General", icon: BookOpen, available: false },
  { id: "TOEFL iBT", icon: Award, available: false },
  { id: "Cambridge English", icon: Languages, available: false },
  { id: "PTE Academic", icon: BookOpen, available: false },
];

/**
 * Current band starts at 4.0 — below that IELTS reporting is not
 * meaningful for study planning, and the "Not sure" option covers
 * learners who have never sat a test. Target band starts at 5.0 because
 * nobody sets out to achieve less.
 */
export const CURRENT_BAND_OPTIONS: readonly BandScore[] = [4.0, 4.5, 5.0, 5.5, 6.0, 6.5, 7.0, 7.5, 8.0, 8.5, 9.0];

export const TARGET_BAND_OPTIONS: readonly BandScore[] = [5.0, 5.5, 6.0, 6.5, 7.0, 7.5, 8.0, 8.5, 9.0];

/** Band scores always display to one decimal place — "7" would read as a different scale. */
export function formatBand(band: BandScore): string {
  return band.toFixed(1);
}

export interface TimelineOption {
  id: ExamTimeline;
  icon: IconComponent;
  desc: string;
}

export const TIMELINE_OPTIONS: readonly TimelineOption[] = [
  { id: "Within 2 weeks", icon: Zap, desc: "Intensive prep" },
  { id: "Within 1 month", icon: CalendarDays, desc: "Focused sprint" },
  { id: "Within 3 months", icon: CalendarRange, desc: "Steady progress" },
  { id: "More than 3 months", icon: Hourglass, desc: "Deep mastery" },
  { id: "I haven't booked it yet", icon: Timer, desc: "No rush" },
];

export interface DailyTimeOption {
  value: DailyStudyTime;
  label: string;
  desc: string;
}

export const DAILY_TIME_OPTIONS: readonly DailyTimeOption[] = [
  { value: 15, label: "15 min", desc: "Light" },
  { value: 30, label: "30 min", desc: "Balanced" },
  { value: 45, label: "45 min", desc: "Committed" },
  { value: 60, label: "60+ min", desc: "Intensive" },
];

export const DAILY_TIME_ICON = Clock;
