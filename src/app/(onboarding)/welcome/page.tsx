"use client";

import { OnboardingWizard } from "@/components/onboarding/OnboardingWizard";
import { createClient } from "@/lib/supabase/client";
import { writeOnboardingData } from "@/lib/onboarding/storage";
import { bandToCefr, type OnboardingData } from "@/lib/onboarding/types";

/**
 * The IELTS onboarding wizard, mounted at the flow's established entry
 * point.
 *
 * Kept at /welcome deliberately: signup, login and four route guards
 * already redirect here, so replacing the flow in place needed no changes
 * to any of them. Moving it to a new path would have meant editing six
 * unrelated files for no user-visible gain.
 */
export default function WelcomePage() {
  async function handleComplete(data: OnboardingData) {
    // Bridge to /ai-plan, which renders from the CEFR-shaped store the
    // previous flow wrote. `goal` uses the product's generic exam value
    // (never a specific test name, per the product model), and interests
    // are simply not collected by this flow rather than being invented.
    writeOnboardingData({
      displayName: data.displayName.trim(),
      level: bandToCefr(data.currentBand) ?? "",
      goal: "Exam Preparation",
      dailyTime: data.dailyTime,
      interests: [],
    });

    const supabase = createClient();
    const { data: auth } = await supabase.auth.getUser();
    // Throw rather than return: a silent no-op here would leave
    // onboarding_completed false while still navigating to /dashboard,
    // whose guard would bounce straight back to /welcome — an
    // unexplained loop with no way out.
    if (!auth.user) throw new Error("Your session expired. Please sign in again.");

    const { error } = await supabase
      .from("profiles")
      .update({
        username: data.displayName.trim() || undefined,
        english_level: bandToCefr(data.currentBand),
        goal: "Exam Preparation",
        daily_time_minutes: data.dailyTime,
        exam_type: data.examType,
        // Null is the honest value for "Not sure" — the placement
        // assessment is what establishes a real starting band.
        current_band: data.currentBandUnsure ? null : data.currentBand,
        target_band: data.targetBand,
        exam_timeline: data.examTimeline || null,
        // The wizard now owns this transition. /ai-plan used to set it,
        // but the flow no longer passes through /ai-plan on the way out —
        // without it here, every authenticated route guard would bounce
        // the learner straight back to /welcome from the dashboard they
        // were just sent to.
        onboarding_completed: true,
      })
      .eq("user_id", auth.user.id);

    if (error) throw new Error(error.message);
  }

  // The Dashboard, not the assessment. Ending the wizard on a 15-minute
  // test makes the test feel like more paperwork before the product
  // starts; ending on the Dashboard with the test waiting as mission one
  // makes it the first thing they do inside the product.
  return <OnboardingWizard onComplete={handleComplete} destination="/dashboard" />;
}
