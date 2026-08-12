import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import {
  BookOpen,
  ChevronRight,
  Headphones,
  Info,
  Lock,
  Mic,
} from "lucide-react";
import { createClient, getAuthenticatedUser } from "@/lib/supabase/server";
import { buildMetadata } from "@/lib/seo/metadata";

export const metadata: Metadata = buildMetadata({
  title: "Practice",
  description: "Targeted reading and listening practice sessions calibrated to your level.",
  path: "/practice",
  index: false,
});

const READING_WEAK_AREAS = new Set(["reading_comprehension", "reading_detail"]);
const LISTENING_WEAK_AREAS = new Set(["listening_comprehension", "listening_detail"]);

export default async function PracticePage() {
  const [supabase, user] = await Promise.all([createClient(), getAuthenticatedUser()]);
  if (!user) redirect("/login");

  const [{ data: profile }, { data: weakAreaSignals }] = await Promise.all([
    supabase
      .from("profiles")
      .select("onboarding_completed, placement_completed, english_level, current_band")
      .eq("user_id", user.id)
      .single(),
    supabase
      .from("learning_signals")
      .select("evidence")
      .eq("user_id", user.id)
      .in("type", ["practice_completed", "mock_completed"])
      .order("created_at", { ascending: false })
      .limit(5),
  ]);

  if (!profile?.onboarding_completed) redirect("/welcome");

  const level = profile?.english_level ?? null;
  const band = profile?.current_band ?? null;

  type SignalEvidence = { weakAreas?: string[] };
  const allWeakAreas = (weakAreaSignals ?? []).flatMap((s) => {
    const ev = s.evidence as SignalEvidence | null;
    return ev?.weakAreas ?? [];
  });
  const weakAreaSet = new Set([...new Set(allWeakAreas)].slice(0, 6));
  const readingWeakAreas = [...weakAreaSet].filter((a) => READING_WEAK_AREAS.has(a));
  const listeningWeakAreas = [...weakAreaSet].filter((a) => LISTENING_WEAK_AREAS.has(a));

  return (
    <div className="mx-auto max-w-3xl px-5 py-8 sm:px-8 md:py-10">
      {/* Page header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-text-primary sm:text-3xl">
          Practice
        </h1>
        <p className="mt-1 text-sm text-text-secondary">
          Short, focused, skill-specific sessions to build your skills.
        </p>
      </div>

      {/* Assessment context row */}
      {(level || band !== null) && (
        <div className="mb-5 flex flex-wrap items-center gap-2">
          <span className="text-xs text-text-secondary">Based on your assessment</span>
          {level && band !== null && (
            <span className="rounded-full bg-[#0F172A] px-3 py-1 text-xs font-bold text-white">
              Level {level} · {band.toFixed(2)}
            </span>
          )}
          {readingWeakAreas.length > 0 && (
            <span className="rounded-full bg-primary px-3 py-1 text-xs font-bold text-white">
              Reading focus
            </span>
          )}
          {listeningWeakAreas.length > 0 && (
            <span className="rounded-full bg-blue-500 px-3 py-1 text-xs font-bold text-white">
              Listening focus
            </span>
          )}
        </div>
      )}

      {/* Placement nudge */}
      {!profile.placement_completed && (
        <div className="mb-5 rounded-2xl border border-border bg-primary-lighter p-5">
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

      {/* Active practice — 2-column grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {/* Reading */}
        <Link
          href="/practice/reading"
          className="group flex flex-col gap-4 rounded-2xl border border-border bg-bg-card p-5 shadow-sm transition-shadow hover:shadow-md"
        >
          <div className="flex items-start justify-between">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-amber-50">
              <BookOpen className="h-5 w-5 text-amber-500" aria-hidden="true" />
            </div>
            <ChevronRight className="h-5 w-5 text-text-tertiary transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
          </div>
          <div>
            <p className="text-base font-bold text-text-primary">Reading Practice</p>
            <p className="mt-0.5 text-xs text-text-secondary">
              Inference, main ideas &amp; detail questions
            </p>
          </div>
          <div className="mt-auto flex flex-wrap gap-3 text-[11px] text-text-tertiary">
            <span>10 questions</span>
            <span>·</span>
            <span>~15 min</span>
            <span>·</span>
            <span>Graded instantly</span>
          </div>
        </Link>

        {/* Listening */}
        <Link
          href="/practice/listening"
          className="group flex flex-col gap-4 rounded-2xl border border-border bg-bg-card p-5 shadow-sm transition-shadow hover:shadow-md"
        >
          <div className="flex items-start justify-between">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-50">
              <Headphones className="h-5 w-5 text-blue-500" aria-hidden="true" />
            </div>
            <ChevronRight className="h-5 w-5 text-text-tertiary transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
          </div>
          <div>
            <p className="text-base font-bold text-text-primary">Listening Practice</p>
            <p className="mt-0.5 text-xs text-text-secondary">
              Gist, detail &amp; comprehension questions
            </p>
          </div>
          <div className="mt-auto flex flex-wrap gap-3 text-[11px] text-text-tertiary">
            <span>8 questions</span>
            <span>·</span>
            <span>~15 min</span>
            <span>·</span>
            <span>Audio once only</span>
          </div>
        </Link>

        {/* Vocabulary — Coming Soon */}
        <div className="relative flex flex-col gap-4 rounded-2xl border border-border bg-bg-card p-5 opacity-60">
          <div className="absolute right-4 top-4">
            <Lock className="h-4 w-4 text-text-tertiary" aria-hidden="true" />
          </div>
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-violet-50">
            <span className="text-lg" aria-hidden="true">📖</span>
          </div>
          <div>
            <p className="text-base font-bold text-text-primary">Vocabulary</p>
            <p className="mt-0.5 text-xs text-text-secondary">Word meaning, context &amp; collocations</p>
          </div>
          <span className="mt-auto text-[11px] font-semibold text-text-tertiary">Coming soon</span>
        </div>

        {/* Grammar — Coming Soon */}
        <div className="relative flex flex-col gap-4 rounded-2xl border border-border bg-bg-card p-5 opacity-60">
          <div className="absolute right-4 top-4">
            <Lock className="h-4 w-4 text-text-tertiary" aria-hidden="true" />
          </div>
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-green-50">
            <span className="text-lg" aria-hidden="true">✍️</span>
          </div>
          <div>
            <p className="text-base font-bold text-text-primary">Grammar &amp; Expressions</p>
            <p className="mt-0.5 text-xs text-text-secondary">Structures, collocations &amp; usage rules</p>
          </div>
          <span className="mt-auto text-[11px] font-semibold text-text-tertiary">Coming soon</span>
        </div>
      </div>

      {/* Weak Area Focus — full width, Coming Soon */}
      <div className="relative mt-4 flex items-center gap-4 rounded-2xl border border-border bg-bg-card p-5 opacity-60">
        <div className="absolute right-4 top-4">
          <Lock className="h-4 w-4 text-text-tertiary" aria-hidden="true" />
        </div>
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary-lighter">
          <Mic className="h-5 w-5 text-primary" aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-base font-bold text-text-primary">Weak Area Practice</p>
          <p className="mt-0.5 text-xs text-text-secondary">
            Personalised sessions targeting your specific gaps
          </p>
        </div>
        <span className="shrink-0 text-[11px] font-semibold text-text-tertiary">Coming soon</span>
      </div>

      {/* How it works */}
      <div className="mt-6 rounded-2xl border border-border bg-bg-muted p-5">
        <div className="mb-3 flex items-center gap-2">
          <Info className="h-4 w-4 text-text-secondary" aria-hidden="true" />
          <p className="text-sm font-semibold text-text-primary">How it works</p>
        </div>
        <ol className="space-y-2">
          {[
            "Choose a skill area (Reading or Listening)",
            "Complete a short, timed session of 8–10 questions",
            "Get instant feedback and accuracy score",
            "Your weak areas update to guide your next session",
          ].map((step, i) => (
            <li key={i} className="flex items-start gap-3 text-xs text-text-secondary">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-border/60 text-[10px] font-bold text-text-tertiary">
                {i + 1}
              </span>
              {step}
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
