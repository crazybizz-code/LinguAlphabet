import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient, getAuthenticatedUser } from "@/lib/supabase/server";
import { getCachedLearnerProfile } from "@/ai/data";
import { TutoWorkspace } from "@/components/tuto-workspace/TutoWorkspace";
import { buildMetadata } from "@/lib/seo/metadata";
import type { TutoContextInput } from "@/lib/tuto-chat/types";

export const metadata: Metadata = buildMetadata({
  title: "Tuto",
  description: "Your AI English coach — ask about grammar, vocabulary, writing, exams, or anything you're learning.",
  path: "/tuto",
  index: false,
});

/**
 * General Coach mode: Tuto's own primary nav destination (replaces the
 * global FloatingTuto popup — see DashboardShell.tsx). No lesson, article,
 * or podcast is in view, so `context` carries only the learner's identity
 * (screen + level) — TutoWorkspace's `mode`/`contextBanner` props are
 * exactly what a future Article Coach/Podcast Coach page changes to reuse
 * this same component for their own context, per docs/dashboard-architecture.md.
 */
export default async function TutoPage() {
  const supabase = await createClient();
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");

  const [{ data: profile }, learnerProfile] = await Promise.all([
    supabase.from("profiles").select("onboarding_completed, username").eq("user_id", user.id).single(),
    getCachedLearnerProfile(supabase, user.id),
  ]);
  if (!profile?.onboarding_completed) redirect("/welcome");

  const context: TutoContextInput = {
    currentScreen: "tuto",
    userLevel: learnerProfile.cefrLevel,
    learningGoal: learnerProfile.learningGoal,
  };

  const learnerName = profile.username || "there";

  return (
    <TutoWorkspace
      mode="general"
      context={context}
      streak={learnerProfile.streak}
      placeholder="Ask Tuto anything…"
      emptyState={{
        title: `Hi ${learnerName}! I'm Tuto — your AI English coach.`,
        description: "Ask me about grammar, vocabulary, pronunciation, or anything else. What would you like to work on?",
        starters: ["When do I use 'present perfect'?", "Difference between 'affect' and 'effect'?", "How do phrasal verbs work?"],
      }}
    />
  );
}
