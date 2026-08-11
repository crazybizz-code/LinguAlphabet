import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { BookOpen, Dumbbell, Headphones, Layers, Target, ArrowRight, Clock, HelpCircle } from "lucide-react";
import { createClient, getAuthenticatedUser } from "@/lib/supabase/server";
import { buildMetadata } from "@/lib/seo/metadata";

export const metadata: Metadata = buildMetadata({
  title: "Practice",
  description: "Targeted reading, listening, and grammar practice sessions.",
  path: "/practice",
  index: false,
});

const COMING_SOON = [
  {
    id: "grammar",
    label: "Grammar",
    description: "Structures, expressions, and usage rules",
    icon: Layers,
    color: "text-purple-500",
    bg: "bg-purple-50 dark:bg-purple-950/30",
  },
  {
    id: "vocabulary",
    label: "Vocabulary",
    description: "Word meaning, context, and collocations",
    icon: Target,
    color: "text-green-500",
    bg: "bg-green-50 dark:bg-green-950/30",
  },
  {
    id: "weak_area",
    label: "Weak Areas",
    description: "Focused practice on your identified gaps",
    icon: Dumbbell,
    color: "text-primary",
    bg: "bg-primary-lighter",
  },
];

export default async function PracticePage() {
  const [supabase, user] = await Promise.all([createClient(), getAuthenticatedUser()]);
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("onboarding_completed, placement_completed, english_level, current_band")
    .eq("user_id", user.id)
    .single();

  if (!profile?.onboarding_completed) redirect("/welcome");

  const level = profile?.english_level ?? null;
  const band = profile?.current_band ?? null;
  const levelLabel = level
    ? band
      ? `${level} · Band ${band}`
      : level
    : null;

  return (
    <div className="mx-auto max-w-3xl px-5 py-8 sm:px-8 md:py-10">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight text-text-primary sm:text-3xl">
          Practice
        </h1>
        <p className="mt-1.5 text-sm text-text-secondary">
          Skill-focused sessions — 10–15 questions, graded instantly.
        </p>
      </div>

      {/* Placement nudge */}
      {!profile.placement_completed && (
        <div className="mb-6 rounded-card border border-border bg-primary-lighter p-5">
          <p className="text-sm font-semibold text-text-primary">Complete your placement first</p>
          <p className="mt-1 text-xs text-text-secondary">
            Placement calibrates session difficulty to your level for accurate results.
          </p>
          <Link
            href="/assessment/placement"
            className="mt-3 inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-primary-dark"
          >
            Start Placement
          </Link>
        </div>
      )}

      {/* Active skill cards */}
      <div className="space-y-3">
        {/* Reading */}
        <Link
          href="/practice/reading"
          className="group flex items-center gap-5 rounded-card border border-border bg-bg-card p-5 shadow-sm transition-all hover:border-primary/30 hover:shadow-card-selected sm:p-6"
        >
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-amber-50">
            <BookOpen className="h-7 w-7 text-amber-500" aria-hidden="true" />
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-base font-bold text-text-primary">Reading</p>
              {levelLabel && (
                <span className="rounded-full bg-border/60 px-2.5 py-0.5 text-[11px] font-semibold text-text-secondary">
                  {levelLabel}
                </span>
              )}
            </div>
            <p className="mt-0.5 text-sm text-text-secondary">
              Inference, main ideas, and detail questions
            </p>
            <div className="mt-2 flex items-center gap-3 text-xs text-text-tertiary">
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" aria-hidden="true" />
                ~15 min
              </span>
              <span className="flex items-center gap-1">
                <HelpCircle className="h-3 w-3" aria-hidden="true" />
                10 questions
              </span>
            </div>
          </div>

          <div className="shrink-0">
            <span className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white shadow-sm transition-all group-hover:bg-primary-dark group-hover:shadow-glow">
              Start
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </span>
          </div>
        </Link>

        {/* Listening */}
        <Link
          href="/practice/listening"
          className="group flex items-center gap-5 rounded-card border border-border bg-bg-card p-5 shadow-sm transition-all hover:border-primary/30 hover:shadow-card-selected sm:p-6"
        >
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-blue-50">
            <Headphones className="h-7 w-7 text-blue-500" aria-hidden="true" />
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-base font-bold text-text-primary">Listening</p>
              {levelLabel && (
                <span className="rounded-full bg-border/60 px-2.5 py-0.5 text-[11px] font-semibold text-text-secondary">
                  {levelLabel}
                </span>
              )}
            </div>
            <p className="mt-0.5 text-sm text-text-secondary">
              Gist, detail, and comprehension questions
            </p>
            <div className="mt-2 flex items-center gap-3 text-xs text-text-tertiary">
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" aria-hidden="true" />
                ~15 min
              </span>
              <span className="flex items-center gap-1">
                <HelpCircle className="h-3 w-3" aria-hidden="true" />
                8 questions
              </span>
            </div>
          </div>

          <div className="shrink-0">
            <span className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white shadow-sm transition-all group-hover:bg-primary-dark group-hover:shadow-glow">
              Start
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </span>
          </div>
        </Link>
      </div>

      {/* Coming Soon */}
      <div className="mt-8">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-text-tertiary">
          Coming Soon
        </p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {COMING_SOON.map((type) => {
            const Icon = type.icon;
            return (
              <div
                key={type.id}
                className="flex items-center gap-3 rounded-2xl border border-border bg-bg-card p-4 opacity-55"
              >
                <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${type.bg}`}>
                  <Icon className={`h-5 w-5 ${type.color}`} aria-hidden="true" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-text-primary">{type.label}</p>
                  <p className="mt-0.5 text-[11px] text-text-secondary">{type.description}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <p className="mt-8 text-center text-xs text-text-tertiary">
        <Link href="/dashboard" className="font-semibold text-primary hover:underline">
          Back to Home
        </Link>
      </p>
    </div>
  );
}
