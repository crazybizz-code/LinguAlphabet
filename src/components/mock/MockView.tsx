import Link from "next/link";
import { AlertTriangle, BookOpen, CalendarDays, ChevronRight, Clock, Headphones } from "lucide-react";
import { MockStartButton } from "@/components/mock/MockStartButton";

export interface MockViewProps {
  targetCefrLevel: string;
  placementCompleted: boolean;
  mockAvailableNow: boolean;
  daysUntilNextMock: number;
  nextMockDateLabel: string | null;
  frequencyLabel: string;
  latestMock: {
    submittedAt: string | null;
    band: number | null;
    cefr: string | null;
    readingPct: number | null;
    listeningPct: number | null;
    readingCorrect: number | null;
    readingTotal: number | null;
    listeningCorrect: number | null;
    listeningTotal: number | null;
  } | null;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function MockView({
  targetCefrLevel,
  placementCompleted,
  mockAvailableNow,
  daysUntilNextMock,
  nextMockDateLabel,
  frequencyLabel,
  latestMock,
}: MockViewProps) {
  return (
    <div className="mx-auto max-w-3xl px-5 py-8 sm:px-8 md:py-10">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-text-primary sm:text-3xl">Full Mock Test</h1>
        <p className="mt-1 text-sm text-text-secondary">A serious exam environment: timed, focused, no retries.</p>
      </header>

      <section className="relative overflow-hidden rounded-[2rem] bg-gradient-to-br from-[#0F172A] to-[#1E293B] p-6 shadow-lg sm:p-8">
        <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-[#FF6B00]/20 blur-2xl" />
        <div className="relative">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-white/50">
            {mockAvailableNow ? "This week's mock" : "Next mock"}
          </p>
          <h2 className="mt-2 text-2xl font-extrabold text-white">
            {mockAvailableNow ? "Ready for you" : `Available in ${daysUntilNextMock} day${daysUntilNextMock === 1 ? "" : "s"}`}
          </h2>
          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            {[
              { icon: BookOpen, label: "Reading", value: "10 questions" },
              { icon: Headphones, label: "Listening", value: "8 questions" },
              { icon: Clock, label: "Estimated time", value: "~55 min" },
            ].map(({ icon: Icon, label, value }) => (
              <div key={label} className="rounded-2xl bg-white/10 p-4 backdrop-blur-sm">
                <div className="flex items-center gap-2 text-white/60">
                  <Icon className="h-4 w-4" aria-hidden="true" />
                  <span className="text-xs">{label}</span>
                </div>
                <p className="mt-1 text-sm font-bold text-white">{value}</p>
              </div>
            ))}
          </div>
          <div className="mt-6">
            <MockStartButton targetCefrLevel={targetCefrLevel} disabled={!placementCompleted || !mockAvailableNow} fullWidth />
            {!placementCompleted && <p className="mt-2 text-center text-xs text-white/40">Complete placement assessment first</p>}
            {placementCompleted && !mockAvailableNow && nextMockDateLabel && (
              <p className="mt-2 text-center text-xs text-white/40">Recommended after {nextMockDateLabel}</p>
            )}
          </div>
        </div>
      </section>

      {latestMock && (
        <section className="mt-4 rounded-2xl border border-border bg-bg-card p-5 shadow-sm">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-text-secondary">Last Mock Result</p>
              <p className="text-[10px] text-text-tertiary">LinguABC Estimated Score</p>
            </div>
            {latestMock.submittedAt && <p className="text-[11px] text-text-tertiary">{formatDate(latestMock.submittedAt)}</p>}
          </div>
          <div className="mb-4 flex items-baseline gap-2">
            {latestMock.band !== null && <span className="text-4xl font-extrabold text-text-primary">{latestMock.band.toFixed(1)}</span>}
            {latestMock.cefr && <span className="rounded-xl bg-primary/10 px-2.5 py-1 text-sm font-bold text-primary">{latestMock.cefr}</span>}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-orange-50 p-3">
              <div className="flex items-center gap-1.5 text-xs text-primary"><BookOpen className="h-3.5 w-3.5" />Reading</div>
              <p className="mt-1 text-xl font-extrabold text-text-primary">{latestMock.readingPct !== null ? `${Math.round(latestMock.readingPct)}%` : "-"}</p>
              {latestMock.readingCorrect !== null && latestMock.readingTotal !== null && <p className="text-[10px] text-text-tertiary">{latestMock.readingCorrect}/{latestMock.readingTotal} correct</p>}
            </div>
            <div className="rounded-xl bg-blue-50 p-3">
              <div className="flex items-center gap-1.5 text-xs text-blue-500"><Headphones className="h-3.5 w-3.5" />Listening</div>
              <p className="mt-1 text-xl font-extrabold text-text-primary">{latestMock.listeningPct !== null ? `${Math.round(latestMock.listeningPct)}%` : "-"}</p>
              {latestMock.listeningCorrect !== null && latestMock.listeningTotal !== null && <p className="text-[10px] text-text-tertiary">{latestMock.listeningCorrect}/{latestMock.listeningTotal} correct</p>}
            </div>
          </div>
          <Link href="/progress" className="mt-4 flex items-center gap-1 border-t border-border pt-3 text-xs font-semibold text-primary hover:underline">
            View full result <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
        </section>
      )}

      <section className="mt-4 rounded-2xl border border-border bg-bg-muted p-4">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
          <p className="text-xs leading-relaxed text-text-secondary">
            {latestMock ? `Mocks are recommended ${frequencyLabel}.` : "No previous mock: this will establish your baseline."} Audio plays once only. Use a desktop or tablet-width screen when possible.
          </p>
        </div>
        {nextMockDateLabel && (
          <div className="mt-3 flex items-center gap-2 text-xs font-semibold text-text-primary">
            <CalendarDays className="h-4 w-4 text-primary" aria-hidden="true" /> Next recommended mock: {nextMockDateLabel}
          </div>
        )}
      </section>
    </div>
  );
}
