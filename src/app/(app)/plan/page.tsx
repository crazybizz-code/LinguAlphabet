import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient, getAuthenticatedUser } from "@/lib/supabase/server";
import { MonthlyPlanView } from "@/components/plan/MonthlyPlanView";
import { buildMetadata } from "@/lib/seo/metadata";

export const metadata: Metadata = buildMetadata({
  title: "My 28-Day Plan",
  description: "Your personalised 28-day adaptive English learning plan.",
  path: "/plan",
  index: false,
});

interface PlanTaskRow {
  id: string;
  day_id: string;
  sequence_number: number;
  task_type: string;
  title: string;
  estimated_minutes: number | null;
  skill_focus: string | null;
  completed: boolean;
  content_item_id: string | null;
}

interface PlanDayRow {
  id: string;
  day_number: number;
  plan_date: string;
  focus: string | null;
  theme: string | null;
  estimated_minutes: number | null;
  plan_tasks: PlanTaskRow[];
}

interface PlanWithDays {
  id: string;
  assessed_cefr_level: string | null;
  target_cefr_level: string | null;
  starts_on: string | null;
  ends_on: string | null;
  weak_areas: unknown;
  plan_days: PlanDayRow[];
}

interface PlanDayRow {
  id: string;
  day_number: number;
  plan_date: string;
  focus: string | null;
  theme: string | null;
  estimated_minutes: number | null;
  plan_tasks: PlanTaskRow[];
}

interface PlanWithDays {
  id: string;
  assessed_cefr_level: string | null;
  target_cefr_level: string | null;
  starts_on: string | null;
  ends_on: string | null;
  weak_areas: unknown;
  plan_days: PlanDayRow[];
}

export default async function PlanPage() {
  const [supabase, user] = await Promise.all([createClient(), getAuthenticatedUser()]);
  if (!user) redirect("/login");

  // Run profile check + full plan hierarchy (plan → days → tasks) in parallel.
  // Nested Supabase select collapses what was 3 serial queries (plan → days → tasks)
  // into one, run concurrent with the profile redirect guard — 5 serial steps → 2.
  const [{ data: profile }, { data: planRaw }] = await Promise.all([
    supabase
      .from("profiles")
      .select("onboarding_completed, placement_completed")
      .eq("user_id", user.id)
      .single(),
    supabase
      .from("learning_plans")
      .select(`
        id, assessed_cefr_level, target_cefr_level, starts_on, ends_on, weak_areas,
        plan_days(
          id, day_number, plan_date, focus, theme, estimated_minutes,
          plan_tasks(id, day_id, sequence_number, task_type, title, estimated_minutes, skill_focus, completed, content_item_id)
        )
      `)
      .eq("user_id", user.id)
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  if (!profile?.onboarding_completed) redirect("/welcome");
  if (!profile?.placement_completed) redirect("/assessment/placement");
  if (!planRaw) redirect("/dashboard");

  const plan = planRaw as unknown as PlanWithDays;

  // Sort nested resources (Supabase doesn't guarantee order on nested selects).
  const days = (plan.plan_days ?? []).sort((a, b) => a.day_number - b.day_number);

  const planDays = days.map((day) => ({
    id: day.id,
    dayNumber: day.day_number,
    planDate: day.plan_date,
    focus: day.focus,
    theme: day.theme,
    estimatedMinutes: day.estimated_minutes,
    tasks: (day.plan_tasks ?? [])
      .sort((a, b) => a.sequence_number - b.sequence_number)
      .map((t) => ({
        id: t.id,
        taskType: t.task_type,
        title: t.title,
        estimatedMinutes: t.estimated_minutes,
        skillFocus: t.skill_focus,
        completed: t.completed,
        contentItemId: t.content_item_id,
      })),
  }));

  const today = new Date().toISOString().split("T")[0];

  return (
    <MonthlyPlanView
      planId={plan.id}
      assessedLevel={plan.assessed_cefr_level}
      targetLevel={plan.target_cefr_level}
      startsOn={plan.starts_on ?? today}
      endsOn={plan.ends_on ?? today}
      weakAreas={(plan.weak_areas as string[]) ?? []}
      days={planDays}
      today={today}
    />
  );
}
