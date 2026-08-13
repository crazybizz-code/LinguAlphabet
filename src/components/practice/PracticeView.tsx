import type { ReactNode } from "react";
import Link from "next/link";
import { BookOpen, ChevronRight, Headphones, Info, Lock, Mic, PenLine } from "lucide-react";

export interface PracticeViewProps {
  level: string | null;
  band: number | null;
  placementCompleted: boolean;
  readingFocus: boolean;
  listeningFocus: boolean;
}

function LockedCard({
  title,
  description,
  accentClassName,
  icon,
}: {
  title: string;
  description: string;
  accentClassName: string;
  icon: ReactNode;
}) {
  return (
    <div className="flex items-center gap-4 rounded-2xl border border-border bg-bg-card p-5 opacity-60 shadow-sm">
      <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${accentClassName}`}>{icon}</span>
      <div className="min-w-0 flex-1">
        <p className="text-base font-bold text-text-primary">{title}</p>
        <p className="mt-1 text-xs leading-relaxed text-text-secondary">{description}</p>
      </div>
      <span className="flex shrink-0 items-center gap-1 text-[11px] font-semibold text-text-tertiary">
        <Lock className="h-3 w-3" aria-hidden="true" />
        Coming soon
      </span>
    </div>
  );
}

export function PracticeView({
  level,
  band,
  placementCompleted,
  readingFocus,
  listeningFocus,
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
          {level && band !== null && (
            <span className="rounded-full bg-[#0F172A] px-3 py-1 text-xs font-bold text-white">
              {level} · {band.toFixed(2)}
            </span>
          )}
          {readingFocus && <span className="rounded-full bg-primary px-3 py-1 text-xs font-bold text-white">Reading focus</span>}
          {listeningFocus && <span className="rounded-full bg-blue-500 px-3 py-1 text-xs font-bold text-white">Listening focus</span>}
          {!placementCompleted && (
            <Link href="/assessment/placement" className="ml-auto rounded-xl bg-primary px-4 py-2 text-xs font-bold text-white shadow-glow">
              Start Placement
            </Link>
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
            <p className="text-base font-bold text-text-primary">Reading</p>
            <p className="mt-1 text-xs leading-relaxed text-text-secondary">Inference, main ideas, detail questions.</p>
            <p className="mt-1 text-[11px] text-text-tertiary">10 questions · ~15 min · Graded instantly</p>
          </div>
          <ChevronRight className="h-5 w-5 shrink-0 text-text-tertiary transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
        </Link>

        <Link href="/practice/listening" className="group flex items-center gap-4 rounded-2xl border border-border bg-bg-card p-5 shadow-sm transition-all hover:shadow-md">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-blue-50">
            <Headphones className="h-5 w-5 text-blue-500" aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-base font-bold text-text-primary">Listening</p>
            <p className="mt-1 text-xs leading-relaxed text-text-secondary">Gist, detail, and comprehension questions.</p>
            <p className="mt-1 text-[11px] text-text-tertiary">8 questions · ~15 min · Audio once only</p>
          </div>
          <ChevronRight className="h-5 w-5 shrink-0 text-text-tertiary transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
        </Link>

        <LockedCard title="Vocabulary" description="Word meaning, context, and collocations." accentClassName="bg-violet-50" icon={<PenLine className="h-5 w-5 text-violet-500" aria-hidden="true" />} />
        <LockedCard title="Grammar & Expressions" description="Structures, collocations, and usage rules." accentClassName="bg-green-50" icon={<PenLine className="h-5 w-5 text-green-500" aria-hidden="true" />} />
      </section>

      <section className="relative mt-4 flex items-center gap-4 rounded-2xl border border-border bg-bg-card p-5 opacity-60 shadow-sm">
        <Lock className="absolute right-4 top-4 h-4 w-4 text-text-tertiary" aria-hidden="true" />
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary-lighter">
          <Mic className="h-5 w-5 text-primary" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-base font-bold text-text-primary">Weak Area Practice</p>
          <p className="mt-1 text-xs text-text-secondary">Personalised sessions targeting your specific gaps.</p>
        </div>
        <span className="shrink-0 text-[11px] font-semibold text-text-tertiary">Coming soon</span>
      </section>

      <section className="mt-6 rounded-2xl border border-border bg-bg-muted p-5">
        <div className="mb-3 flex items-center gap-2">
          <Info className="h-4 w-4 text-text-secondary" aria-hidden="true" />
          <h2 className="text-sm font-semibold text-text-primary">How it works</h2>
        </div>
        <ol className="space-y-2">
          {["Choose Reading or Listening", "Complete a timed session", "Get instant feedback", "Weak areas update your next plan"].map((step, index) => (
            <li key={step} className="flex items-start gap-3 text-xs text-text-secondary">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white text-[10px] font-bold text-text-tertiary">
                {index + 1}
              </span>
              {step}
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
