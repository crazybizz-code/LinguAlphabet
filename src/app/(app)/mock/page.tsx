import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { BookOpen, Clock, Headphones, ShieldCheck, TrendingUp, Award } from "lucide-react";
import { createClient, getAuthenticatedUser } from "@/lib/supabase/server";
import { buildMetadata } from "@/lib/seo/metadata";
import { MockStartButton } from "@/components/mock/MockStartButton";

export const metadata: Metadata = buildMetadata({
  title: "Mock Test",
  description: "Full timed reading and listening mock exam under exam conditions.",
  path: "/mock",
  index: false,
});

const FORMAT_SECTIONS = [
  {
    icon: BookOpen,
    label: "Reading",
    detail: "10 questions · 30 min",
    color: "text-amber-500",
    bg: "bg-amber-50",
  },
  {
    icon: Headphones,
    label: "Listening",
    detail: "8 questions · 25 min",
    color: "text-blue-500",
    bg: "bg-blue-50",
  },
];

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function ScoreBar({ label, correct, total, pct }: { label: string; correct: number; total: number; pct: number }) {
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-xs font-semibold text-text-secondary">{label}</span>
        <span className="text-xs font-bold text-text-primary">
          {correct}/{total} · {Math.round(pct)}%
        </span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-border/60">
        <div
          className="h-full rounded-full bg-primary transition-all"
          style={{ width: `${Math.min(100, Math.round(pct))}%` }}
        />
      </div>
    </div>
  );
}

export default async function MockPage() {
  const [supabase, user] = await Promise.all([createClient(), getAuthenticatedUser()]);
  if (!user) redirect("/login");

  const [{ data: profile }, { data: plan }, { data: latestMock }] = await Promise.all([
    supabase
      .from("profiles")
      .select("onboarding_completed, placement_completed, english_level, current_band, target_band")
      .eq("user_id", user.id)
      .single(),
    supabase
      .from("learning_plans")
      .select("assessed_cefr_level")
      .eq("user_id", user.id)
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("full_mock_attempts")
      .select(
        "reading_correct, reading_total, reading_score_pct, listening_correct, listening_total, listening_score_pct, overall_score_pct, estimated_band, result_cefr_level, submitted_at",
      )
      .eq("user_id", user.id)
      .eq("status", "submitted")
      .order("submitted_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  if (!profile?.onboarding_completed) redirect("/welcome");

  const targetCefrLevel = (plan?.assessed_cefr_level as string | null) ?? "B1";
  const englishLevel = profile?.english_level ?? null;
  const currentBand = profile?.current_band ?? null;
  const targetBand = profile?.target_band ?? null;

  const hasLevel = englishLevel !== null || currentBand !== null;
  const levelDisplay = englishLevel
    ? currentBand
      ? `${englishLevel} · Band ${currentBand}`
      : englishLevel
    : currentBand
      ? `Band ${currentBand}`
      : "Not assessed";

  return (
    <div className="mx-auto max-w-3xl px-5 py-8 sm:px-8 md:py-10">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight text-text-primary sm:text-3xl">
          Mock Test
        </h1>
        <p className="mt-1.5 text-sm text-text-secondary">
          Full timed exam — reading + listening under real conditions.
        </p>
      </div>

      {/* Placement nudge */}
      {!profile.placement_completed && (
        <div className="mb-6 rounded-card border border-border bg-primary-lighter p-5">
          <p className="text-sm font-semibold text-text-primary">Complete your placement first</p>
          <p className="mt-1 text-xs text-text-secondary">
            Placement calibrates the mock difficulty to your level for accurate results.
          </p>
          <Link
            href="/assessment/placement"
            className="mt-3 inline-flex items-center rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-primary-dark"
          >
            Start Placement
          </Link>
        </div>
      )}

      {/* Level status card — dark gradient hero */}
      {hasLevel && (
        <div className="mb-4 overflow-hidden rounded-card bg-gradient-to-br from-gray-900 to-gray-800 p-6 shadow-card-hero">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-white/50">
                Your current level
              </p>
              <p className="mt-1.5 text-2xl font-extrabold text-white">
                {levelDisplay}
              </p>
              {targetBand !== null && (
                <p className="mt-1 text-sm text-white/60">
                  Target: Band {targetBand}
                </p>
              )}
            </div>
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/10">
              <TrendingUp className="h-6 w-6 text-white" aria-hidden="true" />
            </div>
          </div>

          {currentBand !== null && targetBand !== null && currentBand < targetBand && (
            <div className="mt-4">
              <div className="mb-1.5 flex items-center justify-between">
                <span className="text-xs text-white/50">Progress to Band {targetBand}</span>
                <span className="text-xs font-bold text-white">
                  {Math.round(((currentBand - 1) / (targetBand - 1)) * 100)}%
                </span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-primary"
                  style={{
                    width: `${Math.min(100, Math.round(((currentBand - 1) / (targetBand - 1)) * 100))}%`,
                  }}
                />
              </div>
            </div>
          )}
        </div>
      )}

      {/* Previous result card */}
      {latestMock && (
        <div className="mb-4 rounded-card border border-border bg-bg-card p-5 shadow-sm sm:p-6">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Award className="h-4 w-4 text-primary" aria-hidden="true" />
              <p className="text-sm font-bold text-text-primary">Previous Result</p>
            </div>
            <div className="text-right">
              {latestMock.estimated_band !== null && (
                <p className="text-lg font-extrabold text-text-primary">
                  Band {latestMock.estimated_band}
                </p>
              )}
              {latestMock.result_cefr_level && (
                <p className="text-xs text-text-secondary">{latestMock.result_cefr_level}</p>
              )}
            </div>
          </div>

          <div className="space-y-3">
            {latestMock.reading_correct !== null && latestMock.reading_total !== null && latestMock.reading_score_pct !== null && (
              <ScoreBar
                label="Reading"
                correct={latestMock.reading_correct}
                total={latestMock.reading_total}
                pct={latestMock.reading_score_pct}
              />
            )}
            {latestMock.listening_correct !== null && latestMock.listening_total !== null && latestMock.listening_score_pct !== null && (
              <ScoreBar
                label="Listening"
                correct={latestMock.listening_correct}
                total={latestMock.listening_total}
                pct={latestMock.listening_score_pct}
              />
            )}
          </div>

          {latestMock.submitted_at && (
            <p className="mt-3 text-right text-[11px] text-text-tertiary">
              Taken {formatDate(latestMock.submitted_at)}
            </p>
          )}
        </div>
      )}

      {/* Format overview */}
      <div className="mb-4 rounded-card border border-border bg-bg-card p-5 shadow-sm sm:p-6">
        <h2 className="mb-3 text-sm font-bold text-text-primary">Mock Format</h2>
        <div className="grid grid-cols-2 gap-3">
          {FORMAT_SECTIONS.map((item) => {
            const Icon = item.icon;
            return (
              <div
                key={item.label}
                className="flex items-center gap-3 rounded-2xl border border-border bg-bg-muted p-4"
              >
                <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${item.bg}`}>
                  <Icon className={`h-4.5 w-4.5 ${item.color}`} aria-hidden="true" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-text-primary">{item.label}</p>
                  <p className="text-[11px] text-text-secondary">{item.detail}</p>
                </div>
              </div>
            );
          })}
          <div className="flex items-center gap-3 rounded-2xl border border-border bg-bg-muted p-4">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-green-50">
              <Clock className="h-4.5 w-4.5 text-green-500" aria-hidden="true" />
            </div>
            <div>
              <p className="text-xs font-semibold text-text-primary">Total time</p>
              <p className="text-[11px] text-text-secondary">~55 minutes</p>
            </div>
          </div>
          <div className="flex items-center gap-3 rounded-2xl border border-border bg-bg-muted p-4">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary-lighter">
              <ShieldCheck className="h-4.5 w-4.5 text-primary" aria-hidden="true" />
            </div>
            <div>
              <p className="text-xs font-semibold text-text-primary">Graded instantly</p>
              <p className="text-[11px] text-text-secondary">Band estimate + weak areas</p>
            </div>
          </div>
        </div>
      </div>

      {/* Instructions */}
      <div className="mb-6 rounded-2xl border border-border bg-bg-card p-5 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold text-text-primary">Before you begin</h2>
        <ul className="space-y-2 text-xs text-text-secondary">
          <li className="flex items-start gap-2">
            <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
            Requires a laptop or desktop screen — minimum 1024 px wide.
          </li>
          <li className="flex items-start gap-2">
            <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
            Answers save automatically — navigate between questions freely.
          </li>
          <li className="flex items-start gap-2">
            <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
            Each audio clip plays once only. Have headphones ready.
          </li>
          <li className="flex items-start gap-2">
            <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
            Results and band estimate are shown immediately after submission.
          </li>
        </ul>
      </div>

      {/* CTA */}
      <div className="flex flex-col items-center gap-2 rounded-card border border-border bg-bg-card p-8 text-center shadow-sm">
        <MockStartButton
          targetCefrLevel={targetCefrLevel}
          disabled={!profile.placement_completed}
        />
        {!latestMock && profile.placement_completed && (
          <p className="mt-1 text-xs text-text-tertiary">
            No previous attempts — this will be your baseline.
          </p>
        )}
      </div>
    </div>
  );
}
