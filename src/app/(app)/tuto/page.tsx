import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createLearnerRepository } from "@/ai/data";
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
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase.from("profiles").select("onboarding_completed").eq("user_id", user.id).single();
  if (!profile?.onboarding_completed) redirect("/welcome");

  const learnerProfile = await createLearnerRepository(supabase, user.id).getProfile();

  const context: TutoContextInput = {
    currentScreen: "tuto",
    userLevel: learnerProfile.cefrLevel,
    learningGoal: learnerProfile.learningGoal,
  };

  return (
    <TutoWorkspace
      mode="general"
      context={context}
      learnerLevel={learnerProfile.cefrLevel}
      placeholder="Ask Tuto anything…"
      emptyState={{
        title: "Hey, I'm Tuto — your English coach",
        description: "Ask me about grammar, vocabulary, writing, exams, or anything you're curious about.",
        starters: ["What should I practice today?", "Explain a grammar rule", "Teach me a new word"],
      }}
    />
  );
}
