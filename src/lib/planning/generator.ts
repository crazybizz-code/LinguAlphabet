/**
 * Adaptive monthly learning plan generator.
 *
 * Generates a 28-day rule-based plan from the placement assessment result.
 * The plan is stored in learning_plans + plan_days + plan_tasks.
 *
 * Structure:
 *   Week 1: Foundation + targeted diagnosis of weak areas
 *   Week 2: Skill building — intensive weak-area focus
 *   Week 3: Integration — combined reading + listening + vocabulary
 *   Week 4: Assessment prep — mock sections, review, consolidation
 *
 * Mock frequency is governed by DEFAULT_MOCK_POLICY and the assessed level:
 *   - B1/B2: one mock per week (every 7 days)
 *   - C1+: one mock every 3 days (fast-track assessment cadence)
 *
 * Task mixes are defined per week + level, then overridden where weak areas
 * are identified. The content_item_id is null at generation time; the
 * Learning Brain fills in specific content when the learner opens each day.
 */

import { createServiceClient } from "@/lib/supabase/service-client";
import { CEFR_INDEX } from "@/lib/assessment/adaptive";
import { DEFAULT_MOCK_POLICY } from "@/lib/assessment/types";
import type { CefrLevel } from "@/types/content";
import type { GeneratePlanInput, PlanTaskTemplate, PlanDayTemplate, TaskType } from "./types";

// ── Task templates ─────────────────────────────────────────────────────────

const TASK_DEFS: Record<TaskType, Omit<PlanTaskTemplate, "estimatedMinutes">> = {
  podcast: {
    taskType: "podcast",
    title: "Listen to Today's Podcast",
    description: "Immersive listening with comprehension focus.",
    skillFocus: "listening",
  },
  article: {
    taskType: "article",
    title: "Read Today's Article",
    description: "Academic reading with annotation.",
    skillFocus: "reading",
  },
  vocabulary: {
    taskType: "vocabulary",
    title: "Vocabulary Practice",
    description: "Learn and review key words from today's content.",
    skillFocus: "vocabulary",
  },
  listening_practice: {
    taskType: "listening_practice",
    title: "Listening Comprehension Practice",
    description: "Focused listening with comprehension questions.",
    skillFocus: "listening",
  },
  reading_practice: {
    taskType: "reading_practice",
    title: "Reading Comprehension Practice",
    description: "Focused reading with inference and detail questions.",
    skillFocus: "reading",
  },
  grammar: {
    taskType: "grammar",
    title: "Grammar & Expression Review",
    description: "Target key grammar structures from your assessed level.",
    skillFocus: "grammar",
  },
  weak_area: {
    taskType: "weak_area",
    title: "Targeted Weak-Area Practice",
    description: "Focused practice on your identified gap areas.",
    skillFocus: "mixed",
  },
  quiz: {
    taskType: "quiz",
    title: "Comprehension Quiz",
    description: "Test your understanding of today's content.",
    skillFocus: "mixed",
  },
  review: {
    taskType: "review",
    title: "Daily Review",
    description: "Spaced-repetition vocabulary and expression review.",
    skillFocus: "vocabulary",
  },
  mock: {
    taskType: "mock",
    title: "Mini Mock Assessment",
    description: "Timed reading + listening practice under exam conditions.",
    skillFocus: "mixed",
  },
};

function task(type: TaskType, minutes: number): PlanTaskTemplate {
  return { ...TASK_DEFS[type], estimatedMinutes: minutes };
}

// ── Day patterns per week ─────────────────────────────────────────────────

type DayPattern = { focus: string; theme: string; tasks: PlanTaskTemplate[] };

function buildWeekdays(
  level: CefrLevel,
  weakAreas: string[],
  weekNum: 1 | 2 | 3 | 4,
  minutesPerDay: number,
): DayPattern[] {
  const hasReadingWeak = weakAreas.some((a) => a.startsWith("reading"));
  const hasListeningWeak = weakAreas.some((a) => a.startsWith("listening"));
  const isAdvanced = CEFR_INDEX[level] >= 4; // C1+

  // Scale task times to fit the daily budget (keep proportional)
  const scale = (t: number) => Math.max(5, Math.round((t / 60) * minutesPerDay));

  const patterns: DayPattern[] = [];

  for (let d = 1; d <= 7; d++) {
    let focus: string;
    let theme: string;
    let tasks: PlanTaskTemplate[];

    if (weekNum === 1) {
      // Week 1: Foundation — alternate reading/listening, introduce vocabulary
      if (d % 2 === 1) {
        focus = "listening_comprehension";
        theme = weekThemes[level][0];
        tasks = [
          task("podcast", scale(20)),
          task("vocabulary", scale(10)),
          task("listening_practice", scale(15)),
          ...(hasListeningWeak ? [task("weak_area", scale(10))] : []),
          task("review", scale(5)),
        ];
      } else {
        focus = "reading_skills";
        theme = weekThemes[level][1];
        tasks = [
          task("article", scale(20)),
          task("vocabulary", scale(10)),
          task("reading_practice", scale(15)),
          ...(hasReadingWeak ? [task("weak_area", scale(10))] : []),
          task("review", scale(5)),
        ];
      }
    } else if (weekNum === 2) {
      // Week 2: Targeted skill building — intensive weak-area focus
      if (d === 7) {
        focus = "mock";
        theme = "Weekly Assessment Check";
        tasks = [task("mock", minutesPerDay)];
      } else if (hasListeningWeak && d % 3 === 1) {
        focus = "listening_intensive";
        theme = weekThemes[level][2];
        tasks = [
          task("podcast", scale(15)),
          task("listening_practice", scale(20)),
          task("weak_area", scale(15)),
          task("vocabulary", scale(10)),
        ];
      } else if (hasReadingWeak && d % 3 === 2) {
        focus = "reading_intensive";
        theme = weekThemes[level][3];
        tasks = [
          task("article", scale(15)),
          task("reading_practice", scale(20)),
          task("weak_area", scale(15)),
          task("vocabulary", scale(10)),
        ];
      } else {
        focus = "vocabulary_grammar";
        theme = weekThemes[level][4];
        tasks = [
          task(d % 2 === 0 ? "podcast" : "article", scale(15)),
          task("vocabulary", scale(15)),
          task("grammar", scale(15)),
          task("quiz", scale(10)),
          task("review", scale(5)),
        ];
      }
    } else if (weekNum === 3) {
      // Week 3: Integration — combined skills, increasing complexity
      if (d === 7) {
        focus = "mock";
        theme = "Mid-Plan Assessment";
        tasks = [task("mock", minutesPerDay)];
      } else if (d % 3 === 0) {
        focus = "integration";
        theme = weekThemes[level][5];
        tasks = [
          task("article", scale(15)),
          task("listening_practice", scale(15)),
          task("vocabulary", scale(10)),
          task("grammar", scale(10)),
          task("quiz", scale(10)),
        ];
      } else if (d % 2 === 0) {
        focus = "reading_skills";
        theme = weekThemes[level][1];
        tasks = [
          task("article", scale(20)),
          task("reading_practice", scale(20)),
          task("vocabulary", scale(10)),
          task("review", scale(5)),
        ];
      } else {
        focus = "listening_comprehension";
        theme = weekThemes[level][0];
        tasks = [
          task("podcast", scale(20)),
          task("listening_practice", scale(20)),
          task("vocabulary", scale(10)),
          task("review", scale(5)),
        ];
      }
    } else {
      // Week 4: Assessment prep — mock sections, review, consolidation
      if (d === 1 || d === 4 || (isAdvanced && d === 6)) {
        focus = "mock";
        theme = "Full Practice Assessment";
        tasks = [task("mock", minutesPerDay)];
      } else if (d === 7) {
        focus = "review";
        theme = "Monthly Review & Reflection";
        tasks = [
          task("review", scale(20)),
          task("vocabulary", scale(15)),
          task("grammar", scale(15)),
          task("weak_area", scale(10)),
        ];
      } else {
        focus = "consolidation";
        theme = weekThemes[level][6];
        tasks = [
          task(d % 2 === 0 ? "article" : "podcast", scale(15)),
          task("vocabulary", scale(10)),
          task(d % 2 === 0 ? "reading_practice" : "listening_practice", scale(15)),
          task("grammar", scale(10)),
          task("quiz", scale(10)),
        ];
      }
    }

    patterns.push({ focus, theme, tasks });
  }

  return patterns;
}

// ── Level-specific themes ─────────────────────────────────────────────────

const weekThemes: Record<CefrLevel, string[]> = {
  A1: [
    "Basic Listening & Understanding",
    "Simple Reading Passages",
    "Everyday Vocabulary",
    "Short Texts & Instructions",
    "Common Words & Phrases",
    "Combining Reading & Listening",
    "Review & Consolidation",
  ],
  A2: [
    "Listening for Key Information",
    "Reading Familiar Topics",
    "Vocabulary in Context",
    "Understanding Short Articles",
    "Core Vocabulary Building",
    "Mixed Skills Practice",
    "Review & Consolidation",
  ],
  B1: [
    "Listening Comprehension: Detail & Gist",
    "Reading for Main Ideas",
    "Vocabulary in Context",
    "Understanding Arguments",
    "Grammar in Use",
    "Combining Reading & Listening",
    "Exam-Style Practice",
  ],
  B2: [
    "Listening to Lectures & Discussions",
    "Academic Reading Skills",
    "Advanced Vocabulary",
    "Critical Reading Strategies",
    "Grammar & Expressions",
    "Cross-Skill Integration",
    "Exam Strategy & Practice",
  ],
  C1: [
    "Listening to Complex Discourse",
    "Reading Complex Academic Texts",
    "Academic Vocabulary & Collocation",
    "Critical Analysis of Arguments",
    "Advanced Grammar & Style",
    "Synthesis Across Skills",
    "High-Level Assessment Practice",
  ],
  C2: [
    "Advanced Listening: Nuance & Tone",
    "Mastery-Level Reading",
    "Sophisticated Vocabulary",
    "Complex Argumentation",
    "Idiomatic & Stylistic Language",
    "Full Skills Integration",
    "Mastery Assessment",
  ],
};

// ── Plan generation ────────────────────────────────────────────────────────

export async function generateLearningPlan(input: GeneratePlanInput): Promise<string> {
  const supabase = createServiceClient();

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const startsOn = today.toISOString().split("T")[0];
  const endsDate = new Date(today);
  endsDate.setDate(endsDate.getDate() + 27);
  const endsOn = endsDate.toISOString().split("T")[0];

  const targetCefr = input.assessedLevel; // Could be upgraded; keep same level for now

  // Mock frequency policy
  const isAdvanced = CEFR_INDEX[input.assessedLevel] >= 4;
  const mockPolicy = {
    ...DEFAULT_MOCK_POLICY,
    minDaysBetweenMocks: isAdvanced ? 3 : 7,
    maxDaysBetweenMocks: isAdvanced ? 3 : 7,
  };

  // Supersede any existing active plan
  await supabase
    .from("learning_plans")
    .update({ status: "superseded" })
    .eq("user_id", input.userId)
    .eq("status", "active");

  // Create the plan
  const { data: plan, error: planError } = await supabase
    .from("learning_plans")
    .insert({
      user_id: input.userId,
      placement_attempt_id: input.placementAttemptId,
      starts_on: startsOn,
      ends_on: endsOn,
      status: "active",
      assessed_cefr_level: input.assessedLevel,
      target_cefr_level: targetCefr,
      estimated_band: input.estimatedBand,
      target_band: input.targetBand,
      weak_areas: input.weakAreas,
      plan_config: mockPolicy,
    })
    .select("id")
    .single();

  if (planError || !plan) throw new Error("Failed to create learning plan");

  // Generate 28 days
  const safeMinutes = Math.max(15, input.dailyTimeMinutes);
  const allDayPatterns: DayPattern[] = [];
  for (const week of [1, 2, 3, 4] as const) {
    allDayPatterns.push(...buildWeekdays(input.assessedLevel, input.weakAreas, week, safeMinutes));
  }

  // Batch-insert plan_days
  const dayRows = allDayPatterns.map((pattern, i) => {
    const date = new Date(today);
    date.setDate(date.getDate() + i);
    return {
      plan_id: plan.id,
      day_number: i + 1,
      plan_date: date.toISOString().split("T")[0],
      focus: pattern.focus,
      theme: pattern.theme,
      estimated_minutes: pattern.tasks.reduce((sum, t) => sum + t.estimatedMinutes, 0),
    };
  });

  const { data: insertedDays, error: daysError } = await supabase
    .from("plan_days")
    .insert(dayRows)
    .select("id, day_number");

  if (daysError || !insertedDays) throw new Error("Failed to insert plan days");

  // Batch-insert plan_tasks for all days
  const taskRows: Array<{
    day_id: string;
    sequence_number: number;
    task_type: string;
    title: string;
    description: string;
    estimated_minutes: number;
    skill_focus: string;
    cefr_level: string;
  }> = [];

  for (const day of insertedDays) {
    const pattern = allDayPatterns[day.day_number - 1];
    pattern.tasks.forEach((t, seq) => {
      taskRows.push({
        day_id: day.id,
        sequence_number: seq + 1,
        task_type: t.taskType,
        title: t.title,
        description: t.description,
        estimated_minutes: t.estimatedMinutes,
        skill_focus: t.skillFocus,
        cefr_level: input.assessedLevel,
      });
    });
  }

  await supabase.from("plan_tasks").insert(taskRows);

  return plan.id;
}
