import Link from "next/link";
import { ClipboardList, Dumbbell } from "lucide-react";

export function PracticeAssessGrid() {
  return (
    <section className="mt-5 px-5 sm:px-8">
      <h2 className="mb-3 text-sm font-semibold text-text-primary">Practice &amp; Assess</h2>
      <div className="grid grid-cols-2 gap-3">
        <Link
          href="/practice"
          className="flex flex-col gap-3 rounded-2xl border border-border bg-bg-card p-5 shadow-sm transition-shadow hover:shadow-md"
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-lighter">
            <Dumbbell className="h-5 w-5 text-primary" aria-hidden="true" />
          </div>
          <div>
            <p className="text-sm font-semibold text-text-primary">Practice</p>
            <p className="mt-0.5 text-xs text-text-secondary">Targeted skill exercises</p>
          </div>
        </Link>

        <Link
          href="/mock"
          className="flex flex-col gap-3 rounded-2xl border border-border bg-bg-card p-5 shadow-sm transition-shadow hover:shadow-md"
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-lighter">
            <ClipboardList className="h-5 w-5 text-primary" aria-hidden="true" />
          </div>
          <div>
            <p className="text-sm font-semibold text-text-primary">Mock Test</p>
            <p className="mt-0.5 text-xs text-text-secondary">Timed exam practice</p>
          </div>
        </Link>
      </div>
    </section>
  );
}
