import Link from "next/link";
import { ArrowRight, BookOpen, FileText } from "lucide-react";

export function PracticeAssessGrid() {
  return (
    <section className="mt-5 px-5 sm:px-8">
      <h2 className="mb-3 text-sm font-semibold text-text-primary">Practice &amp; Assess</h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {/* Practice card — light */}
        <Link
          href="/practice"
          className="group flex flex-col gap-3 rounded-2xl border border-border bg-bg-card p-5 shadow-sm transition-shadow hover:shadow-md"
        >
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-orange-50">
            <BookOpen className="h-5 w-5 text-[#FF6B00]" aria-hidden="true" />
          </div>
          <div>
            <p className="font-bold text-text-primary">Practice</p>
            <p className="mt-0.5 text-xs text-text-secondary">Targeted skill exercises</p>
          </div>
          <span className="mt-auto inline-flex items-center gap-1 text-xs font-semibold text-[#FF6B00]">
            Start practicing
            <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
          </span>
        </Link>

        {/* Full Mock card — dark gradient */}
        <Link
          href="/mock"
          className="group relative flex flex-col gap-3 overflow-hidden rounded-2xl bg-gradient-to-br from-[#0F172A] to-[#1E293B] p-5 shadow-lg transition-shadow hover:shadow-xl"
        >
          <div className="absolute -right-6 -top-6 h-24 w-24 rounded-full bg-[#FF6B00]/20 blur-2xl" aria-hidden="true" />
          <div className="relative flex h-11 w-11 items-center justify-center rounded-2xl bg-[#FF6B00]">
            <FileText className="h-5 w-5 text-white" aria-hidden="true" />
          </div>
          <div className="relative">
            <p className="font-bold text-white">Full Mock</p>
            <p className="mt-0.5 text-xs text-white/60">Timed exam simulation</p>
          </div>
          <span className="relative mt-auto inline-flex items-center gap-1 text-xs font-semibold text-[#FF6B00]">
            Start assessment
            <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
          </span>
        </Link>
      </div>
    </section>
  );
}
