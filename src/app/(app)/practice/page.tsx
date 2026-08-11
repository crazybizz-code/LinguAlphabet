import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { BookOpen, Dumbbell, Headphones, Layers, Target, ArrowRight } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { buildMetadata } from "@/lib/seo/metadata";

export const metadata: Metadata = buildMetadata({
  title: "Practice",
  description: "Targeted reading, listening, and grammar practice sessions.",
  path: "/practice",
  index: false,
});

const PRACTICE_TYPES = [
  {
    id: "reading",
    href: "/practice/reading",
    label: "Reading",
    description: "Inference, main ideas, and detail questions",
    icon: BookOpen,
    color: "text-amber-500",
    bg: "bg-amber-50",
    active: true,
  },
  {
    id: "listening",
    href: "/practice/listening",
    label: "Listening",
    description: "Gist, detail, and comprehension questions",
    icon: Headphones,
    color: "text-blue-500",
    bg: "bg-blue-50",
    active: true,
  },
  {
    id: "grammar",
    href: null,
    label: "Grammar",
    description: "Structures, expressions, and usage",
    icon: Layers,
    color: "text-purple-500",
    bg: "bg-purple-50",
    active: false,
  },
  {
    id: "vocabulary",
    href: null,
    label: "Vocabulary",
    description: "Word meaning, context, and collocations",
    icon: Target,
    color: "text-green-500",
    bg: "bg-green-50",
    active: false,
  },
  {
    id: "weak_area",
    href: null,
    label: "Weak Areas",
    description: "Focused practice on your identified gaps",
    icon: Dumbbell,
    color: "text-primary",
    bg: "bg-primary-lighter",
    active: false,
  },
];

export default async function PracticePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("onboarding_completed, placement_completed")
    .eq("user_id", user.id)
    .single();

  if (!profile?.onboarding_completed) redirect("/welcome");

  return (
    <div className="mx-auto max-w-3xl px-5 py-8 sm:px-8 md:py-10">
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight text-text-primary sm:text-3xl">
          Practice
        </h1>
        <p className="mt-1.5 text-sm text-text-secondary">
          Choose a skill to practise. Sessions are 5–10 questions, graded instantly.
        </p>
      </div>

      {!profile.placement_completed && (
        <div className="mb-6 rounded-2xl border border-border bg-primary-lighter p-5">
          <p className="text-sm font-semibold text-text-primary">
            Complete your placement first
          </p>
          <p className="mt-1 text-xs text-text-secondary">
            The placement assessment tailors practice to your level and identifies your weak areas.
          </p>
          <Link
            href="/assessment/placement"
            className="mt-3 inline-flex items-center rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-primary-dark"
          >
            Start Placement
          </Link>
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {PRACTICE_TYPES.map((type) => {
          const Icon = type.icon;
          if (type.active && type.href) {
            return (
              <Link
                key={type.id}
                href={type.href}
                className="group flex items-center gap-4 rounded-2xl border border-border bg-bg-card p-5 shadow-sm transition-all hover:border-primary/30 hover:shadow-md"
              >
                <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${type.bg}`}>
                  <Icon className={`h-6 w-6 ${type.color}`} aria-hidden="true" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-text-primary">{type.label}</p>
                  <p className="mt-0.5 text-xs text-text-secondary">{type.description}</p>
                </div>
                <ArrowRight className="h-4 w-4 shrink-0 text-text-tertiary transition-transform group-hover:translate-x-0.5 group-hover:text-primary" aria-hidden="true" />
              </Link>
            );
          }

          return (
            <div
              key={type.id}
              className="flex items-center gap-4 rounded-2xl border border-border bg-bg-card p-5 opacity-60 shadow-sm"
            >
              <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${type.bg}`}>
                <Icon className={`h-6 w-6 ${type.color}`} aria-hidden="true" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-text-primary">{type.label}</p>
                <p className="mt-0.5 text-xs text-text-secondary">{type.description}</p>
              </div>
              <span className="shrink-0 rounded-full bg-bg-muted px-2.5 py-1 text-[11px] font-semibold text-text-tertiary">
                Soon
              </span>
            </div>
          );
        })}
      </div>

      <p className="mt-8 text-center text-xs text-text-tertiary">
        Grammar, Vocabulary, and Weak Areas coming soon.{" "}
        <Link href="/dashboard" className="font-semibold text-primary hover:underline">
          Back to Home
        </Link>
      </p>
    </div>
  );
}
