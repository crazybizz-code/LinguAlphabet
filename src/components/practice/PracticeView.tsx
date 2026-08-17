import Link from "next/link";
import { BookOpen, ChevronRight, Clock, Headphones, Info, Lock } from "lucide-react";

export interface PracticeViewProps {
  assessedLevel: string | null;
  assessedBand: number | null;
  placementCompleted: boolean;
  readingBand: number | null;
  listeningBand: number | null;
}

function LockedCard({ title }: { title: string }) {
  return (
    <div className="flex items-center gap-4 rounded-2xl border border-border bg-bg-card p-5 shadow-sm">
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-bg-muted">
        <Lock className="h-5 w-5 text-text-tertiary" aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-base font-bold text-text-primary">{title}</p>
        <p className="mt-1 text-xs text-text-tertiary">Coming soon</p>
      </div>
    </div>
  );
}

export function PracticeView({
  assessedLevel,
  assessedBand,
  placementCompleted,
  readingBand,
  listeningBand,
}: PracticeViewProps) {
  return (
    <div className="mx-auto max-w-3xl px-5 py-8 sm:px-8 md:py-10">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-text-primary sm:text-3xl">Practice</h1>
        <p className="mt-1 text-sm text-text-secondary">Short, focused sessions for Reading and Listening.</p>
      </header>

      <section className="mb-5 rounded-2xl border border-border bg-bg-card p-5 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-text-secondary">Based on your assessment</span>
          {!placementCompleted && (
            <Link href="/assessment/placement" className="ml-auto rounded-xl bg-primary px-4 py-2 text-xs font-bold text-white shadow-glow">
              Start Placement
            </Link>
          )}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {assessedLevel && assessedBand !== null && (
            <span className="rounded-full bg-[#0F172A] px-3 py-1 text-xs font-bold text-white">
              {assessedLevel} · {assessedBand.toFixed(2)}
            </span>
          )}
          {readingBand !== null && (
            <span className="rounded-full bg-orange-50 px-3 py-1 text-xs font-bold text-primary-strong">
              Reading {readingBand.toFixed(1)}
            </span>
          )}
          {listeningBand !== null && (
            <span className="rounded-full bg-orange-50 px-3 py-1 text-xs font-bold text-primary-strong">
              Listening {listeningBand.toFixed(1)}
            </span>
          )}
        </div>
        {!placementCompleted && (
          <p className="mt-3 text-xs leading-relaxed text-text-secondary">
            Placement calibrates session difficulty before graded practice begins.
          </p>
        )}
      </section>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Link href="/practice/reading" className="group flex items-center gap-4 rounded-2xl border border-border bg-bg-card p-5 shadow-sm transition-all hover:shadow-md">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-orange-50">
            <BookOpen className="h-5 w-5 text-primary" aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-base font-bold text-text-primary">Reading Practice</p>
            <p className="mt-1 flex items-center gap-1 text-[11px] text-text-tertiary">
              <Clock className="h-3 w-3" aria-hidden="true" />
              8 questions · ~10 min
            </p>
          </div>
          <ChevronRight className="h-5 w-5 shrink-0 text-text-tertiary transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
        </Link>

        <Link href="/practice/listening" className="group flex items-center gap-4 rounded-2xl border border-border bg-bg-card p-5 shadow-sm transition-all hover:shadow-md">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-orange-50">
            <Headphones className="h-5 w-5 text-primary" aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-base font-bold text-text-primary">Listening Practice</p>
            <p className="mt-1 flex items-center gap-1 text-[11px] text-text-tertiary">
              <Clock className="h-3 w-3" aria-hidden="true" />
              8 questions · ~10 min
            </p>
          </div>
          <ChevronRight className="h-5 w-5 shrink-0 text-text-tertiary transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
        </Link>

        <LockedCard title="Vocabulary" />
        <LockedCard title="Grammar & Expressions" />
        <LockedCard title="Weak Area Practice" />
      </section>

      <section className="mt-6 rounded-2xl border border-border bg-bg-muted p-5">
        <div className="mb-3 flex items-center gap-2">
          <Info className="h-4 w-4 text-text-secondary" aria-hidden="true" />
          <h2 className="text-sm font-semibold text-text-primary">How it works</h2>
        </div>
        <p className="text-xs leading-relaxed text-text-secondary">
          Practice sessions are short and skill-specific. Your results feed into weak-area detection and adapt your future plan.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {["Practice", "Weak-area signals", "Plan adaptation"].map((step, index, arr) => (
            <span key={step} className="flex items-center gap-2">
              <span className="rounded-full border border-border bg-white px-3 py-1.5 text-[11px] font-semibold text-text-secondary">
                {step}
              </span>
              {index < arr.length - 1 && (
                <ChevronRight className="h-3.5 w-3.5 shrink-0 text-text-tertiary" aria-hidden="true" />
              )}
            </span>
          ))}
        </div>
      </section>
    </div>
  );
}
