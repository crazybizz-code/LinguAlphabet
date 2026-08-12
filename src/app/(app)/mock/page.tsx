import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import {
  Award,
  BookOpen,
  CalendarClock,
  CheckCircle2,
  Clock,
  Headphones,
  ShieldCheck,
  TrendingUp,
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

const AREA_LABELS: Record<string, string> = {
  reading_comprehension: "Reading Comprehension",
  reading_detail: "Reading — Detail Questions",
  listening_comprehension: "Listening Comprehension",
  listening_detail: "Listening — Detail Questions",
  grammar: "Grammar",
  vocabulary: "Vocabulary",
};

/** Days between mocks based on assessed level. B2 = weekly, C1+ = every 3 days. */
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

function ScoreBar({
  label,
  correct,
  total,
  pct,
}: {
  label: string;
  correct: number;
  total: number;
  pct: number;
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-xs font-semibold text-text-secondary">{label}</span>
        <span className="text-xs font-bold text-text-primary">
          {correct}/{total} &middot; {Math.round(pct)}%
        </span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-border/60">
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

  const [{ data: profile }, { data: plan }, { data: latestMock }, { data: weakAreaSignals }] =
    await Promise.all([
      supabase
        .from("profiles")
        .select(
          "onboarding_completed, placement_completed, english_level, current_band, target_band",
        )
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
      supabase
        .from("learning_signals")
        .select("evidence")
        .eq("user_id", user.id)
        .in("type", ["practice_completed", "mock_completed"])
        .order("created_at", { ascending: false })
        .limit(5),
    ]);

  if (!profile?.onboarding_completed) redirect("/welcome");

  // Level / band
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
      nextMockDateLabel = nextDate.toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
      });
    }
  }
  const mockAvailableNow = daysUntilNextMock === 0;
  const frequencyLabel =
    cooldownDays === 3 ? "approximately every 3 days at C1+ level" : "approximately once a week at your level";

  // Weak areas
  type SignalEvidence = { weakAreas?: string[] };
  const allWeakAreas = (weakAreaSignals ?? []).flatMap((s) => {
    const ev = s.evidence as SignalEvidence | null;
    return ev?.weakAreas ?? [];
  });
  const weakAreas = [...new Set(allWeakAreas)].slice(0, 3);

  return (
    <div className="mx-auto max-w-3xl px-5 py-8 sm:px-8 md:py-10">
      {/* Page header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight text-text-primary sm:text-3xl">
          Mock Test
        </h1>
        <p className="mt-1.5 text-sm text-text-secondary">
          Measure where you stand, not just where you practice.
        </p>
      </div>

      {/* Placement nudge */}
      {!profile.placement_completed && (
        <div className="mb-6 rounded-2xl border border-border bg-primary-lighter p-5">
          <p className="text-sm font-semibold text-text-primary">Complete your placement first</p>
          <p className="mt-1 text-xs text-text-secondary">
            Placement calibrates mock difficulty to your level for accurate results.
          </p>
          <Link
            href="/assessment/placement"
            className="mt-3 inline-flex items-center rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-primary-dark"
          >
            Start Placement
          </Link>
        </div>
      )}

      {/* ── Level / Band hero ── */}
      {hasLevel && (
        <div className="mb-4 overflow-hidden rounded-2xl bg-gradient-to-br from-[#0F172A] to-[#1e293b] p-6 shadow-card-hero">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-widest text-white/50">
                Your assessed level
              </p>
              <p className="mt-1.5 text-3xl font-extrabold text-white">{levelDisplay}</p>
              {targetBand !== null && (
                <p className="mt-1 text-sm text-white/60">Target: Band {targetBand}</p>
              )}
            </div>
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/10">
              <TrendingUp className="h-6 w-6 text-white" aria-hidden="true" />
            </div>
          </div>

          {currentBand !== null && targetBand !== null && currentBand < targetBand && (
            <div className="mt-5">
              <div className="mb-1.5 flex items-center justify-between">
                <span className="text-xs text-white/50">Progress to Band {targetBand}</span>
                <span className="text-xs font-bold text-white">
                  {Math.round(((currentBand - 1) / Math.max(targetBand - 1, 1)) * 100)}%
                </span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-primary"
                  style={{
                    width: `${Math.min(100, Math.round(((currentBand - 1) / Math.max(targetBand - 1, 1)) * 100))}%`,
                  }}
                />
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Mock availability / frequency ── */}
      <div
        className={`mb-4 flex items-start gap-4 rounded-2xl border p-5 shadow-sm ${
          mockAvailableNow
            ? "border-success/30 bg-success/[.05]"
            : "border-border bg-bg-card"
        }`}
      >
        <div
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
            mockAvailableNow ? "bg-success/10" : "bg-border/60"
          }`}
        >
          <CalendarClock
            className={`h-5 w-5 ${mockAvailableNow ? "text-success" : "text-text-secondary"}`}
            aria-hidden="true"
          />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-text-primary">
            {mockAvailableNow ? "Mock available now" : `Available in ${daysUntilNextMock} day${daysUntilNextMock !== 1 ? "s" : ""}`}
          </p>
          <p className="mt-0.5 text-xs text-text-secondary">
            {nextMockDateLabel
              ? `Next recommended: ${nextMockDateLabel} · `
              : ""}
            {latestMock ? frequencyLabel : "Complete your first mock to establish a baseline."}
          </p>
        </div>
      </div>

      {/* ── Previous result ── */}
      {latestMock && (
        <div className="mb-4 rounded-2xl border border-border bg-bg-card p-5 shadow-sm sm:p-6">
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
            {latestMock.reading_correct !== null &&
              latestMock.reading_total !== null &&
              latestMock.reading_score_pct !== null && (
                <ScoreBar
                  label="Reading"
                  correct={latestMock.reading_correct}
                  total={latestMock.reading_total}
                  pct={latestMock.reading_score_pct}
                />
              )}
            {latestMock.listening_correct !== null &&
              latestMock.listening_total !== null &&
              latestMock.listening_score_pct !== null && (
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

      {/* ── Weak areas to work on ── */}
      {weakAreas.length > 0 && (
        <div className="mb-4 rounded-2xl border border-border bg-bg-card p-5 shadow-sm">
          <p className="mb-3 text-sm font-semibold text-text-primary">Focus areas for this mock</p>
          <div className="flex flex-wrap gap-2">
            {weakAreas.map((area) => (
              <span
                key={area}
                className="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary"
              >
                {AREA_LABELS[area] ?? area.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
              </span>
            ))}
          </div>
          <p className="mt-3 text-xs text-text-tertiary">
            Based on your recent practice sessions.{" "}
            <Link href="/practice" className="font-semibold text-primary hover:underline">
              Practice these first →
            </Link>
          </p>
        </div>
      )}

      {/* ── Format overview ── */}
      <div className="mb-4 rounded-2xl border border-border bg-bg-card p-5 shadow-sm sm:p-6">
        <h2 className="mb-3 text-sm font-bold text-text-primary">Mock Format</h2>
        <div className="space-y-3">
          {[
            {
              Icon: BookOpen,
              label: "Reading",
              detail: "10 questions · ~30 min",
              iconClass: "text-amber-500",
              bgClass: "bg-amber-50",
            },
            {
              Icon: Headphones,
              label: "Listening",
              detail: "8 questions · ~25 min",
              iconClass: "text-blue-500",
              bgClass: "bg-blue-50",
            },
            {
              Icon: Clock,
              label: "Total time",
              detail: "~55 minutes",
              iconClass: "text-green-500",
              bgClass: "bg-green-50",
            },
            {
              Icon: ShieldCheck,
              label: "Graded instantly",
              detail: "Band estimate + weak areas",
              iconClass: "text-primary",
              bgClass: "bg-primary-lighter",
            },
          ].map(({ Icon, label, detail, iconClass, bgClass }) => (
            <div key={label} className="flex items-center gap-3">
              <div
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${bgClass}`}
              >
                <Icon className={`h-4 w-4 ${iconClass}`} aria-hidden="true" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-text-primary">{label}</p>
                <p className="text-[11px] text-text-secondary">{detail}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Before you begin ── */}
      <div className="mb-6 rounded-2xl border border-border bg-bg-card p-5 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold text-text-primary">Before you begin</h2>
        <ul className="space-y-2">
          {[
            "Requires a laptop or desktop screen — minimum 1024 px wide.",
            "Each audio clip plays once only. Have headphones ready.",
            "Answers save automatically — navigate freely between questions.",
            "Results and band estimate appear immediately after submission.",
          ].map((item) => (
            <li key={item} className="flex items-start gap-2.5 text-xs text-text-secondary">
              <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-text-tertiary" aria-hidden="true" />
              {item}
            </li>
          ))}
        </ul>
      </div>

      {/* ── CTA ── */}
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-border bg-bg-card p-8 text-center shadow-sm">
        <MockStartButton
          targetCefrLevel={targetCefrLevel}
          disabled={!profile.placement_completed}
        />
        {!latestMock && profile.placement_completed && (
          <p className="text-xs text-text-tertiary">
            No previous attempts — this will be your baseline.
          </p>
        )}
        {daysUntilNextMock > 0 && (
          <p className="text-xs text-text-tertiary">
            Recommended after {nextMockDateLabel ?? `${daysUntilNextMock} more days`}
          </p>
        )}
      </div>

      {/* Practice vs Mock callout */}
      <p className="mt-6 text-center text-xs text-text-tertiary">
        Want to improve before your next mock?{" "}
        <Link href="/practice" className="font-semibold text-primary hover:underline">
          Go to Practice →
        </Link>
      </p>
    </div>
  );
}
