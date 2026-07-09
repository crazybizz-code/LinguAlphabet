import {
  BookOpen,
  Mic,
  Briefcase,
  Plane,
  Building2,
  GraduationCap,
  FileCheck,
  Clock,
  Cpu,
  FlaskConical,
  Clapperboard,
  Gamepad2,
  Music,
  Trophy,
  UtensilsCrossed,
} from "lucide-react";

/**
 * The controlled vocabularies collected by onboarding (level/goal/daily-time/
 * interests) — docs/domain-model.md §2 makes these editable from Profile, not
 * a frozen onboarding snapshot. Kept as Profile's own copy rather than a
 * shared import from the onboarding pages: those pages own their local
 * layout-specific constants (colors, descriptions) and aren't a public
 * module, so duplicating the small controlled lists here is lower blast
 * radius than reaching into onboarding to export them.
 */
export const LEVEL_OPTIONS = [
  { id: "A1", title: "Beginner" },
  { id: "A2", title: "Elementary" },
  { id: "B1", title: "Intermediate" },
  { id: "B2", title: "Upper Intermediate" },
  { id: "C1", title: "Advanced" },
  { id: "C2", title: "Mastery" },
] as const;

export const LEVEL_LABELS: Record<string, string> = Object.fromEntries(
  LEVEL_OPTIONS.map((option) => [option.id, option.title]),
);

export const GOAL_OPTIONS = [
  { id: "General English", icon: BookOpen },
  { id: "Speaking", icon: Mic },
  { id: "Business English", icon: Briefcase },
  { id: "Travel", icon: Plane },
  { id: "Work", icon: Building2 },
  { id: "School", icon: GraduationCap },
  { id: "Exam Preparation", icon: FileCheck },
] as const;

export const DAILY_TIME_OPTIONS = [
  { value: 10, label: "10 min", desc: "Casual" },
  { value: 20, label: "20 min", desc: "Regular" },
  { value: 30, label: "30 min", desc: "Committed" },
  { value: 45, label: "45 min", desc: "Serious" },
  { value: 60, label: "60 min", desc: "Intensive" },
] as const;

export const DAILY_TIME_ICON = Clock;

export const INTEREST_OPTIONS = [
  { id: "Technology", icon: Cpu },
  { id: "Business", icon: Briefcase },
  { id: "Science", icon: FlaskConical },
  { id: "Movies", icon: Clapperboard },
  { id: "Books", icon: BookOpen },
  { id: "Gaming", icon: Gamepad2 },
  { id: "Music", icon: Music },
  { id: "Travel", icon: Plane },
  { id: "Sports", icon: Trophy },
  { id: "Food", icon: UtensilsCrossed },
] as const;
