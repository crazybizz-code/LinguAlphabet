import {
  BookOpen,
  Briefcase,
  CalendarClock,
  Clapperboard,
  Clock,
  Cpu,
  FlaskConical,
  Gamepad2,
  Music,
  Plane,
  Sparkles,
  Target,
  Trophy,
  Trophy as BandIcon,
  UtensilsCrossed,
} from "lucide-react";

/**
 * Profile's controlled vocabularies.
 *
 * The band, timeline and daily-time lists are NOT redefined here — they
 * are re-exported from `@/lib/onboarding/constants`, which is the module
 * that already owns them. Profile used to keep its own copies, and they
 * had already drifted: onboarding offered 15/30/45/60 minutes while
 * Profile offered 10/20/30/45/60, so a learner who picked 15 opened
 * Profile to find their own answer missing from the list and no option
 * selected. One list, one owner, and that class of bug can't come back.
 *
 * What Profile still owns is the interest catalog, because onboarding
 * doesn't collect it — the IELTS wizard writes `interests: []` and never
 * asks, which makes Profile the only place it can be set.
 */

import { TARGET_BAND_OPTIONS } from "@/lib/onboarding/constants";

export {
  CURRENT_BAND_OPTIONS,
  TARGET_BAND_OPTIONS,
  TIMELINE_OPTIONS,
  DAILY_TIME_OPTIONS,
  formatBand,
} from "@/lib/onboarding/constants";

/**
 * The target bands a learner may pick, given where they are now.
 *
 * Onboarding blocks a target below the current band (canAdvance ->
 * isTargetBandTooLow, strict `<`, so equal is allowed). Profile is the
 * only other write path for these fields, so without the same rule here
 * it would simply be the way around that validation. Filtering rather
 * than disabling keeps the grid short and makes the rule self-evident
 * without an error message.
 *
 * An unknown current band ("Not sure") constrains nothing — there is no
 * floor to compare against, and inventing one would be the same
 * fabrication the null is there to avoid.
 */
export function selectableTargetBands(currentBand: number | null): readonly number[] {
  if (currentBand === null) return TARGET_BAND_OPTIONS;
  return TARGET_BAND_OPTIONS.filter((band) => band >= currentBand);
}

export const BAND_ICON = BandIcon;
export const TARGET_ICON = Target;
export const TIMELINE_ICON = CalendarClock;
export const DAILY_TIME_ICON = Clock;
export const INTERESTS_ICON = Sparkles;

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
