import type { CefrLevel } from "@/types/content";

export type TaskType =
  | "podcast"
  | "article"
  | "vocabulary"
  | "listening_practice"
  | "reading_practice"
  | "grammar"
  | "weak_area"
  | "quiz"
  | "review"
  | "mock";

export interface PlanTaskTemplate {
  taskType: TaskType;
  title: string;
  description: string;
  estimatedMinutes: number;
  skillFocus: string;
}

export interface PlanDayTemplate {
  dayNumber: number;
  focus: string;
  theme: string;
  tasks: PlanTaskTemplate[];
}

export interface GeneratePlanInput {
  userId: string;
  assessedLevel: CefrLevel;
  targetBand: number | null;
  weakAreas: string[];
  dailyTimeMinutes: number;
  placementAttemptId: string | null;
  estimatedBand: number | null;
}
