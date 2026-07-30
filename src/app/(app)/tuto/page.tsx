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

  /**
   * A generic "Hi, I'm Tuto — ask me anything" greeting reads like any
   * chatbot's first message. Referencing what Tuto actually already knows
   * about this learner (their streak if they have one, their own stated
   * learning goal) makes the very first line feel like picking up a
   * conversation with a coach who remembers them, not a fresh session
   * with a stranger — see docs/CLAUDE.md's product model and the
   * tuto-taste skill's "Remember the learner" principle. Streak is only
   * ever mentioned when it's actually > 0, same rule the header's own
   * streak badge already follows, so a brand-new learner never gets
   * complimented on a streak that doesn't exist yet.
   */
  const hasStreak = (learnerProfile.streak ?? 0) > 0;
  const greetingTitle = hasStreak
    ? `Welcome back, ${learnerName}! ${learnerProfile.streak}-day streak and counting.`
    : `Hi ${learnerName}, glad you're here.`;
  const greetingDescription = learnerProfile.learningGoal
    ? `I'm Tuto, your English coach — here to help with ${learnerProfile.learningGoal}. Ask me about grammar, vocabulary, pronunciation, or anything else on your mind.`
    : "I'm Tuto, your English coach. Ask me about grammar, vocabulary, pronunciation, or anything else on your mind.";

  return (
    <TutoWorkspace
      mode="general"
      context={context}
      streak={learnerProfile.streak}
      placeholder="Ask Tuto anything…"
      emptyState={{
        title: greetingTitle,
        description: greetingDescription,
        starters: ["When do I use 'present perfect'?", "Difference between 'affect' and 'effect'?", "How do phrasal verbs work?"],
      }}
    />
  );
}
