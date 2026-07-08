"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/supabase";

type ProfileUpdate = Database["public"]["Tables"]["profiles"]["Update"];

export interface LearningProfileUpdate {
  englishLevel?: string;
  goal?: string;
  dailyTimeMinutes?: number;
  interests?: string[];
}

/**
 * The one write path for the Learning Profile (docs/domain-model.md §2):
 * "a learner can revise their level/goal/interests later (Profile tab), and
 * any change is a first-class input the Learning Brain picks up on its next
 * run." Revalidating /dashboard is what makes that true in practice — the
 * next Home render re-reads these columns and re-computes fresh.
 */
export async function updateLearningProfile(update: LearningProfileUpdate): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const patch: ProfileUpdate = {};
  if (update.englishLevel !== undefined) patch.english_level = update.englishLevel;
  if (update.goal !== undefined) patch.goal = update.goal;
  if (update.dailyTimeMinutes !== undefined) patch.daily_time_minutes = update.dailyTimeMinutes;
  if (update.interests !== undefined) patch.interests = update.interests;

  await supabase.from("profiles").update(patch).eq("user_id", user.id);

  revalidatePath("/profile");
  revalidatePath("/dashboard");
  revalidatePath("/explore");
  revalidatePath("/progress");
}

export async function signOutAction(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
