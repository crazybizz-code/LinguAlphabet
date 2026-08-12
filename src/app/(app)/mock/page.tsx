import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import {
  AlertTriangle,
  BookOpen,
  ChevronRight,
  Clock,
  Headphones,
  Monitor,
} from "lucide-react";
import { createClient, getAuthenticatedUser } from "@/lib/supabase/server";
import { buildMetadata } from "@/lib/seo/metadata";
import { MockStartButton } from "@/components/mock/MockStartButton";

export const metadata: Metadata = buildMetadata({
  title: "Mock Test",
  description: "Full timed reading and listening mock exam under real exam conditions.",
  path: "/mock",
  index: false,
});

/** Days between mocks based on assessed level. C1+ = every 3 days, otherwise weekly. */
function mockCooldownDays(cefrLevel: string | null): number {
  if (cefrLevel === "C1" || cefrLevel === "C2") return 3;
  return 7;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatShortDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
  });
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

  // Mock availability
  const cooldownDays = mockCooldownDays(englishLevel ?? plan?.assessed_cefr_level ?? null);
  const lastMockIso = latestMock?.submitted_at ?? null;
  const now = new Date();

  let daysUntilNextMock = 0;
  let nextMockDateLabel: string | null = null;
  if (lastMockIso) {
    const nextDate = new Date(lastMockIso);
    nextDate.setDate(nextDate.getDate() + cooldownDays);
    const msLeft = nextDate.getTime() - now.getTime();
    daysUntilNextMock = Math.max(0, Math.ceil(msLeft / (24 * 60 * 60 * 1000)));
    if (daysUntilNextMock > 0) {
      nextMockDateLabel = nextDate.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
    }
  }
  const mockAvailableNow = daysUntilNextMock === 0;
  const frequencyLabel =
    cooldownDays === 3
      ? "approximately every 3 days at C1+ level"
      : "approximately once a week at your level";

  // Band display for last mock
  const lastBand = latestMock?.estimated_band ?? null;
  const lastCefr = latestMock?.result_cefr_level ?? null;

  // Per-section scores (pct → rounded band approximation for display)
  const readingPct = (latestMock as { reading_score_pct?: number | null } | null)?.reading_score_pct ?? null;
  const listeningPct = (latestMock as { listening_score_pct?: number | null } | null)?.listening_score_pct ?? null;

  return (
    <div className="mx-auto max-w-3xl px-5 py-8 sm:px-8 md:py-10">
      {/* Page header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-text-primary sm:text-3xl">
          Full Mock Test
        </h1>
        <p className="mt-1 text-sm text-text-secondary">
          A serious exam environment — 55 minutes, timed, no retries.
        </p>
      </div>

      {/* ── Dark hero card ── */}
      <div className="mb-4 overflow-hidden rounded-[2rem] bg-gradient-to-br from-[#0F172A] to-[#1E293B] p-6 shadow-lg">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-white/50">
          {mockAvailableNow ? "This week's mock" : `Next mock`}
        </p>
        <p className="mt-2 text-2xl font-extrabold text-white">
          {mockAvailableNow ? "Ready for you" : `Available in ${daysUntilNextMock} day${daysUntilNextMock !== 1 ? "s" : ""}`}
        </p>

        <div className="mt-4 flex flex-wrap gap-5 text-sm text-white/60">
          <span className="flex items-center gap-1.5">
            <BookOpen className="h-4 w-4" aria-hidden="true" />
            10 Reading questions
          </span>
          <span className="flex items-center gap-1.5">
            <Headphones className="h-4 w-4" aria-hidden="true" />
            8 Listening questions
          </span>
          <span className="flex items-center gap-1.5">
            <Clock className="h-4 w-4" aria-hidden="true" />
            ~55 minutes
          </span>
        </div>

        <div className="mt-5">
          <MockStartButton
            targetCefrLevel={targetCefrLevel}
            disabled={!profile.placement_completed || !mockAvailableNow}
            fullWidth
          />
          {!profile.placement_completed && (
            <p className="mt-2 text-center text-xs text-white/40">
              Complete placement assessment first
            </p>
          )}
          {profile.placement_completed && !mockAvailableNow && nextMockDateLabel && (
            <p className="mt-2 text-center text-xs text-white/40">
              Recommended after {nextMockDateLabel}
            </p>
          )}
        </div>
      </div>

      {/* ── Desktop requirement warning ── */}
      <div className="mb-4 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-700/40 dark:bg-amber-900/20">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" aria-hidden="true" />
        <div>
          <p className="text-sm font-semibold text-amber-800 dark:text-amber-400">Desktop recommended</p>
          <div className="mt-1 flex items-center gap-1.5 text-xs text-amber-700 dark:text-amber-500">
            <Monitor className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>Requires at least 1024 px wide screen · Audio plays once only · Have headphones ready</span>
          </div>
        </div>
      </div>

      {/* ── Last Mock Result ── */}
      {latestMock && (
        <div className="mb-4 rounded-2xl border border-border bg-bg-card p-5 shadow-sm">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-text-secondary">
                Last Mock Result
              </p>
              <p className="text-[10px] text-text-tertiary">LinguABC Estimated Score</p>
            </div>
            {latestMock.submitted_at && (
              <p className="text-[11px] text-text-tertiary">{formatDate(latestMock.submitted_at)}</p>
            )}
          </div>

          {/* Large band + CEFR */}
          <div className="mb-4 flex items-baseline gap-2">
            {lastBand !== null && (
              <span className="text-4xl font-extrabold text-text-primary">
                {lastBand.toFixed(1)}
              </span>
            )}
            {lastCefr && (
              <span className="rounded-xl bg-primary/10 px-2.5 py-1 text-sm font-bold text-primary">
                {lastCefr}
              </span>
            )}
          </div>

          {/* Reading + Listening sub-boxes */}
          {(readingPct !== null || listeningPct !== null) && (
            <div className="grid grid-cols-2 gap-3">
              {readingPct !== null && (
                <div className="rounded-xl bg-amber-50 p-3 dark:bg-amber-900/10">
                  <div className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400">
                    <BookOpen className="h-3.5 w-3.5" aria-hidden="true" />
                    Reading
                  </div>
                  <p className="mt-1 text-xl font-extrabold text-text-primary">
                    {Math.round(readingPct)}%
                  </p>
                  {latestMock.reading_correct !== null && latestMock.reading_total !== null && (
                    <p className="text-[10px] text-text-tertiary">
                      {latestMock.reading_correct}/{latestMock.reading_total} correct
                    </p>
                  )}
                </div>
              )}
              {listeningPct !== null && (
                <div className="rounded-xl bg-blue-50 p-3 dark:bg-blue-900/10">
                  <div className="flex items-center gap-1.5 text-xs text-blue-500">
                    <Headphones className="h-3.5 w-3.5" aria-hidden="true" />
                    Listening
                  </div>
                  <p className="mt-1 text-xl font-extrabold text-text-primary">
                    {Math.round(listeningPct)}%
                  </p>
                  {latestMock.listening_correct !== null && latestMock.listening_total !== null && (
                    <p className="text-[10px] text-text-tertiary">
                      {latestMock.listening_correct}/{latestMock.listening_total} correct
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Next mock timing */}
          {nextMockDateLabel && (
            <p className="mt-3 text-xs text-text-secondary">
              Next recommended mock in{" "}
              <span className="font-semibold text-text-primary">{daysUntilNextMock} days</span>
              {" "}· {nextMockDateLabel}
            </p>
          )}

          <div className="mt-3 flex items-center justify-between border-t border-border/40 pt-3">
            <Link
              href="/progress"
              className="flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
            >
              View full result
              <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
            </Link>
          </div>
        </div>
      )}

      {/* Mock frequency note */}
      <p className="mt-2 text-center text-xs text-text-tertiary">
        {latestMock
          ? `Mocks are recommended ${frequencyLabel}.`
          : "No previous mock — this will establish your baseline."}
        {" "}
        <Link href="/practice" className="font-semibold text-primary hover:underline">
          Practice between mocks →
        </Link>
      </p>
    </div>
  );
}
