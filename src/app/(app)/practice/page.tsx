import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import {
  ArrowRight,
  BookOpen,
  CheckCircle2,
  Clock,
  Dumbbell,
  Headphones,
  HelpCircle,
  Layers,
  Target,
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

const AREA_LABELS: Record<string, string> = {
  reading_comprehension: "Reading Comprehension",
  reading_detail: "Reading — Detail Questions",
  listening_comprehension: "Listening Comprehension",
  listening_detail: "Listening — Detail Questions",
};

const COMING_SOON = [
  {
    id: "grammar",
    label: "Grammar",
    description: "Structures, expressions, and usage rules",
    icon: Layers,
    color: "text-purple-500",
    bg: "bg-purple-50",
  },
  {
    id: "vocabulary",
    label: "Vocabulary",
    description: "Word meaning, context, and collocations",
    icon: Target,
    color: "text-green-500",
    bg: "bg-green-50",
  },
  {
    id: "weak_area",
    label: "Weak Area Focus",
    description: "Personalised sessions targeting your gaps",
    icon: Dumbbell,
    color: "text-primary",
    bg: "bg-primary-lighter",
  },
];

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
  const levelLabel = level
    ? band
      ? `${level} · Band ${band}`
      : level
    : band
      ? `Band ${band}`
      : null;

  // Extract weak areas from recent practice/mock signals
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
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight text-text-primary sm:text-3xl">
          Practice
        </h1>
        <p className="mt-1.5 text-sm text-text-secondary">
          Build the skills that move your score.
        </p>
      </div>

      {/* Placement nudge */}
      {!profile.placement_completed && (
        <div className="mb-6 rounded-2xl border border-border bg-primary-lighter p-5">
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

      {/* ── Active skill sections ── */}
      <div className="space-y-4">

        {/* Reading */}
        <div className="overflow-hidden rounded-2xl border border-border bg-bg-card shadow-sm transition-shadow hover:shadow-md">
          {/* Card header strip */}
          <div className="flex items-start gap-4 p-6">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-amber-50">
              <BookOpen className="h-6 w-6 text-amber-500" aria-hidden="true" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-lg font-bold text-text-primary">Reading</h2>
                {levelLabel && (
                  <span className="rounded-full bg-border/60 px-2.5 py-0.5 text-[11px] font-semibold text-text-secondary">
                    {levelLabel}
                  </span>
                )}
              </div>
              <p className="mt-0.5 text-sm text-text-secondary">
                Inference, main ideas, and detail questions
              </p>
            </div>
          </div>

          {/* Session specs */}
          <div className="flex flex-wrap gap-5 border-t border-border/40 px-6 py-3 text-xs text-text-tertiary">
            <span className="flex items-center gap-1.5">
              <HelpCircle className="h-3.5 w-3.5" aria-hidden="true" />
              10 questions
            </span>
            <span className="flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5" aria-hidden="true" />
              ~15 min
            </span>
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
              Graded instantly
            </span>
          </div>

          {/* Weak area chips — only when relevant */}
          {readingWeakAreas.length > 0 && (
            <div className="border-t border-border/40 px-6 py-3">
              <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-text-tertiary">
                Targets your weak areas
              </p>
              <div className="flex flex-wrap gap-1.5">
                {readingWeakAreas.map((area) => (
                  <span
                    key={area}
                    className="rounded-full bg-primary/10 px-2.5 py-0.5 text-[11px] font-semibold text-primary"
                  >
                    {AREA_LABELS[area] ?? area.replace(/_/g, " ")}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* CTA */}
          <div className="border-t border-border/40 px-6 py-4">
            <Link
              href="/practice/reading"
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3 text-sm font-semibold text-white shadow-sm transition-all hover:bg-primary-dark hover:shadow-glow"
            >
              Start Reading Practice
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </div>
        </div>

        {/* Listening */}
        <div className="overflow-hidden rounded-2xl border border-border bg-bg-card shadow-sm transition-shadow hover:shadow-md">
          <div className="flex items-start gap-4 p-6">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-blue-50">
              <Headphones className="h-6 w-6 text-blue-500" aria-hidden="true" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-lg font-bold text-text-primary">Listening</h2>
                {levelLabel && (
                  <span className="rounded-full bg-border/60 px-2.5 py-0.5 text-[11px] font-semibold text-text-secondary">
                    {levelLabel}
                  </span>
                )}
              </div>
              <p className="mt-0.5 text-sm text-text-secondary">
                Gist, detail, and comprehension questions
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-5 border-t border-border/40 px-6 py-3 text-xs text-text-tertiary">
            <span className="flex items-center gap-1.5">
              <HelpCircle className="h-3.5 w-3.5" aria-hidden="true" />
              8 questions
            </span>
            <span className="flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5" aria-hidden="true" />
              ~15 min
            </span>
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
              Audio plays once only
            </span>
          </div>

          {listeningWeakAreas.length > 0 && (
            <div className="border-t border-border/40 px-6 py-3">
              <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-text-tertiary">
                Targets your weak areas
              </p>
              <div className="flex flex-wrap gap-1.5">
                {listeningWeakAreas.map((area) => (
                  <span
                    key={area}
                    className="rounded-full bg-primary/10 px-2.5 py-0.5 text-[11px] font-semibold text-primary"
                  >
                    {AREA_LABELS[area] ?? area.replace(/_/g, " ")}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="border-t border-border/40 px-6 py-4">
            <Link
              href="/practice/listening"
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3 text-sm font-semibold text-white shadow-sm transition-all hover:bg-primary-dark hover:shadow-glow"
            >
              Start Listening Practice
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </div>
        </div>
      </div>

      {/* Practice vs Mock callout */}
      <div className="mt-6 flex items-start gap-3 rounded-2xl border border-border bg-bg-muted px-5 py-4">
        <span className="mt-0.5 text-lg" aria-hidden="true">💡</span>
        <p className="text-xs leading-relaxed text-text-secondary">
          <span className="font-semibold text-text-primary">Practice</span> improves a specific skill in ~15 min.{" "}
          <span className="font-semibold text-text-primary">Mock</span> measures your full performance under exam
          conditions.{" "}
          <Link href="/mock" className="font-semibold text-primary hover:underline">
            Go to Mock →
          </Link>
        </p>
      </div>

      {/* Coming Soon */}
      <div className="mt-8">
        <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-text-tertiary">
          Coming Soon
        </p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {COMING_SOON.map((type) => {
            const Icon = type.icon;
            return (
              <div
                key={type.id}
                className="flex items-center gap-3 rounded-2xl border border-border bg-bg-card p-4 opacity-50"
              >
                <div
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${type.bg}`}
                >
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
    </div>
  );
}
