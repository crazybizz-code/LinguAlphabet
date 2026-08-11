import Link from "next/link";
import { ClipboardList, Dumbbell } from "lucide-react";

export function PracticeAssessGrid() {
  return (
    <section className="mt-5 px-5 sm:px-8">
      <h2 className="mb-3 text-sm font-semibold text-text-primary">Practice &amp; Assess</h2>
      <div className="grid grid-cols-2 gap-3">
        {/* Practice card — light */}
        <Link
          href="/practice"
          className="flex flex-col gap-3 rounded-2xl border border-border bg-bg-card p-5 shadow-sm transition-shadow hover:shadow-md"
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-50">
            <Dumbbell className="h-5 w-5 text-[#FF6B00]" aria-hidden="true" />
          </div>
          <div>
            <p className="text-sm font-semibold text-text-primary">Practice</p>
            <p className="mt-0.5 text-xs text-text-secondary">Targeted skill exercises</p>
          </div>
          <span className="mt-auto text-xs font-semibold text-[#FF6B00]">Start practicing →</span>
        </Link>

        {/* Full Mock card — dark gradient */}
        <Link
          href="/mock"
          className="relative flex flex-col gap-3 overflow-hidden rounded-2xl bg-gradient-to-br from-[#0F172A] to-[#1E293B] p-5 shadow-lg transition-shadow hover:shadow-xl"
        >
          <div className="absolute -right-6 -top-6 h-24 w-24 rounded-full bg-[#FF6B00]/20 blur-2xl" aria-hidden="true" />
          <div className="relative flex h-10 w-10 items-center justify-center rounded-xl bg-[#FF6B00]">
            <ClipboardList className="h-5 w-5 text-white" aria-hidden="true" />
          </div>
          <div className="relative">
            <p className="text-sm font-semibold text-white">Full Mock</p>
            <p className="mt-0.5 text-xs text-white/60">Timed exam simulation</p>
          </div>
          <span className="relative mt-auto text-xs font-semibold text-[#FF6B00]">Start assessment →</span>
        </Link>
      </div>
    </section>
  );
}
