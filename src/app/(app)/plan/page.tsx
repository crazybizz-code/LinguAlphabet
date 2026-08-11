import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { MonthlyPlanView } from "@/components/plan/MonthlyPlanView";
import { buildMetadata } from "@/lib/seo/metadata";

export const metadata: Metadata = buildMetadata({
  title: "My 28-Day Plan",
  description: "Your personalised 28-day adaptive English learning plan.",
  path: "/plan",
  index: false,
});

interface PlanDayRow {
  id: string;
  day_number: number;
  plan_date: string;
  focus: string | null;
  theme: string | null;
  estimated_minutes: number | null;
}

interface PlanTaskRow {
  id: string;
  day_id: string;
  sequence_number: number;
  task_type: string;
  title: string;
  estimated_minutes: number | null;
  skill_focus: string | null;
  completed: boolean;
}

export default async function PlanPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("onboarding_completed, placement_completed")
    .eq("user_id", user.id)
    .single();

  if (!profile?.onboarding_completed) redirect("/welcome");
  if (!profile?.placement_completed) redirect("/assessment/placement");

  // Fetch active plan
  const { data: plan } = await supabase
    .from("learning_plans")
    .select("id, assessed_cefr_level, target_cefr_level, starts_on, ends_on, weak_areas")
    .eq("user_id", user.id)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!plan) redirect("/dashboard");

  // Fetch all days + tasks
  const { data: days } = await supabase
    .from("plan_days")
    .select("id, day_number, plan_date, focus, theme, estimated_minutes")
    .eq("plan_id", plan.id)
    .order("day_number", { ascending: true });

  const dayIds = (days ?? []).map((d: PlanDayRow) => d.id);
  const { data: tasks } = await supabase
    .from("plan_tasks")
    .select("id, day_id, sequence_number, task_type, title, estimated_minutes, skill_focus, completed")
    .in("day_id", dayIds)
    .order("sequence_number", { ascending: true });

  const tasksByDay = new Map<string, PlanTaskRow[]>();
  for (const task of (tasks ?? []) as PlanTaskRow[]) {
    const bucket = tasksByDay.get(task.day_id) ?? [];
    bucket.push(task);
    tasksByDay.set(task.day_id, bucket);
  }

  const planDays = (days ?? [] as PlanDayRow[]).map((day: PlanDayRow) => ({
    id: day.id,
    dayNumber: day.day_number,
    planDate: day.plan_date,
    focus: day.focus,
    theme: day.theme,
    estimatedMinutes: day.estimated_minutes,
    tasks: (tasksByDay.get(day.id) ?? []).map((t: PlanTaskRow) => ({
      id: t.id,
      taskType: t.task_type,
      title: t.title,
      estimatedMinutes: t.estimated_minutes,
      skillFocus: t.skill_focus,
      completed: t.completed,
    })),
  }));

  const today = new Date().toISOString().split("T")[0];

  return (
    <MonthlyPlanView
      planId={plan.id}
      assessedLevel={plan.assessed_cefr_level}
      targetLevel={plan.target_cefr_level}
      startsOn={plan.starts_on}
      endsOn={plan.ends_on}
      weakAreas={(plan.weak_areas as string[]) ?? []}
      days={planDays}
      today={today}
    />
  );
}
