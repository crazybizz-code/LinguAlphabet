import type { TutoPose } from "@/components/mascot/Tuto";

export interface TutoNote {
  pose: TutoPose;
  message: string;
}

const STREAK_MILESTONES = [3, 7, 14, 30, 60, 100];

function nextStreakMilestone(streak: number): number | null {
  return STREAK_MILESTONES.find((milestone) => milestone > streak) ?? null;
}

/**
 * Tuto's contextual note (docs/dashboard-architecture.md §4.3): generated
 * from the learner's actual state, never a generic greeting or a random
 * motivational quote. Priority order is most-specific-and-recent first —
 * a message about something that just happened always beats a standing
 * streak/goal observation. Returns null when there's nothing genuine to
 * say; Tuto doesn't always have something to say, and forcing one on
 * every load would cheapen it.
 */
export function buildTutoNote(input: {
  streak: number;
  weeklyMinutes: number;
  weeklyGoalMinutes: number;
  /** Title of something completed very recently (this session/today), if any. */
  recentCompletionTitle: string | null;
  /** Days since the learner last studied, or null if they've never studied. */
  daysSinceLastStudy: number | null;
}): TutoNote | null {
  const { streak, weeklyMinutes, weeklyGoalMinutes, recentCompletionTitle, daysSinceLastStudy } = input;

  if (recentCompletionTitle) {
    return {
      pose: "celebrating",
      message: `Nice work finishing "${recentCompletionTitle}"! Ready for what's next?`,
    };
  }

  if (daysSinceLastStudy !== null && daysSinceLastStudy >= 2) {
    return {
      pose: "happy",
      message: `It's been ${daysSinceLastStudy} days — let's ease back in today.`,
    };
  }

  const milestone = nextStreakMilestone(streak);
  if (milestone !== null && milestone - streak === 1) {
    return {
      pose: "happy",
      message: `One more day for a ${milestone}-day streak!`,
    };
  }

  const weeklyRemaining = weeklyGoalMinutes - weeklyMinutes;
  if (weeklyGoalMinutes > 0 && weeklyRemaining > 0 && weeklyRemaining <= 15) {
    return {
      pose: "happy",
      message: `You're so close to this week's goal — just ${Math.ceil(weeklyRemaining)} min to go.`,
    };
  }

  if (streak >= 3) {
    return {
      pose: "happy",
      message: `${streak} days in a row — you're building real momentum. Keep it going today!`,
    };
  }

  return null;
}
