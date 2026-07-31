"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { bandToCefr } from "@/lib/onboarding/types";
import type { Database } from "@/types/supabase";

type ProfileUpdate = Database["public"]["Tables"]["profiles"]["Update"];

export interface LearningProfileUpdate {
  /** Null is a real value — "Not sure", the same answer onboarding accepts. */
  currentBand?: number | null;
  targetBand?: number | null;
  examTimeline?: string;
  dailyTimeMinutes?: number;
  interests?: string[];
}

/**
 * The one write path for the Learning Profile (docs/domain-model.md §2):
 * "a learner can revise their level/goal/interests later (Profile tab), and
 * any change is a first-class input the Learning Brain picks up on its next
 * run." Revalidating Home/Explore/Progress is what makes that true for
 * Continue Learning, Tuto Recommends, Explore ranking and Difficulty
 * Progression — none of those persist anything, they're all computed live
 * from the Learning Profile on every render, so a fresh render is all they
 * need.
 *
 * Today's Mission is the one exception: it's a finite daily plan of two
 * independent slots (article + podcast, content-lifecycle.md §5), each
 * deliberately locked for the calendar day once assigned, so simply
 * revalidating the page wouldn't change them. A learner explicitly editing
 * their Learning Profile is a deliberate signal, not passive background
 * drift, so it's treated as grounds to drop whichever slots aren't yet
 * completed and let them be re-picked fresh from the new context on the
 * next Home render. `todaysMissionStrategy.decide` still checks Continue
 * Learning first, so an in-progress item is never yanked away by this —
 * only a not-yet-started slot is re-picked. A slot that's already
 * completed today is left alone — its checkmark and title stay put, and
 * the finite daily plan never re-assigns a completed slot regardless of a
 * profile change.
 */
export async function updateLearningProfile(update: LearningProfileUpdate): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const patch: ProfileUpdate = {};
  if (update.currentBand !== undefined) {
    patch.current_band = update.currentBand;
    // CEFR is DERIVED, never independently edited. It used to be its own
    // Profile field, which meant a learner could set english_level to C1
    // while current_band said 6.0 — and nothing reconciled them, so the
    // Dashboard showed one number while the Learning Brain ranked against
    // the other and Tuto's system prompt read a third story. Writing both
    // here, from the band, is what makes "band is the source of truth"
    // true rather than aspirational.
    //
    // Null in, null out: "Not sure" genuinely means we don't know their
    // level, and the placement assessment is what resolves it. Defaulting
    // would put a fabricated level in front of the ranker.
    patch.english_level = bandToCefr(update.currentBand);
  }
  if (update.targetBand !== undefined) patch.target_band = update.targetBand;
  if (update.examTimeline !== undefined) patch.exam_timeline = update.examTimeline;
  if (update.dailyTimeMinutes !== undefined) patch.daily_time_minutes = update.dailyTimeMinutes;
  if (update.interests !== undefined) patch.interests = update.interests;

  const today = new Date().toISOString().slice(0, 10);

  const [, { data: existingAssignments }] = await Promise.all([
    supabase.from("profiles").update(patch).eq("user_id", user.id),
    supabase.from("daily_missions").select("content_type, content_item_id").eq("user_id", user.id).eq("mission_date", today),
  ]);

  if (existingAssignments && existingAssignments.length > 0) {
    const { data: progressRows } = await supabase
      .from("progress")
      .select("content_item_id, completed")
      .eq("user_id", user.id)
      .in(
        "content_item_id",
        existingAssignments.map((assignment) => assignment.content_item_id),
      );

    const completedContentIds = new Set(
      (progressRows ?? []).filter((row) => row.completed).map((row) => row.content_item_id),
    );
    const unfinishedTypes = existingAssignments
      .filter((assignment) => !completedContentIds.has(assignment.content_item_id))
      .map((assignment) => assignment.content_type);

    if (unfinishedTypes.length > 0) {
      await supabase
        .from("daily_missions")
        .delete()
        .eq("user_id", user.id)
        .eq("mission_date", today)
        .in("content_type", unfinishedTypes);
    }
  }

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
