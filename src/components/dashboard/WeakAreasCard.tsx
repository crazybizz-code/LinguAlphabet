import { AlertTriangle } from "lucide-react";
import Link from "next/link";

const AREA_LABELS: Record<string, string> = {
  reading_comprehension: "Reading Comprehension",
  reading_detail: "Reading — Detail Questions",
  listening_comprehension: "Listening Comprehension",
  listening_detail: "Listening — Detail Questions",
  grammar: "Grammar",
  vocabulary: "Vocabulary",
};

const AREA_PILL: Record<string, string> = {
  reading_comprehension: "Reading",
  reading_detail: "Reading",
  listening_comprehension: "Listening",
  listening_detail: "Listening",
  grammar: "Grammar",
  vocabulary: "Vocabulary",
};

export function WeakAreasCard({ weakAreas }: { weakAreas: string[] }) {
  if (weakAreas.length === 0) return null;

  return (
    <section className="mt-5 px-5 sm:px-8">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-primary" aria-hidden="true" />
          <h2 className="text-sm font-semibold text-text-primary">Weak Areas</h2>
        </div>
        <Link
          href="/practice"
          className="text-xs font-semibold text-primary hover:underline"
        >
          Practice these →
        </Link>
      </div>

      <div className="flex flex-col gap-2">
        {weakAreas.slice(0, 3).map((area) => (
          <div
            key={area}
            className="flex items-center justify-between rounded-xl bg-[#FF6B00]/[.06] p-3"
          >
            <span className="text-sm font-medium text-text-primary">
              {AREA_LABELS[area] ?? area.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
            </span>
            <span className="rounded-full bg-[#FF6B00]/[.12] px-2.5 py-0.5 text-[11px] font-semibold text-primary">
              {AREA_PILL[area] ?? "Mixed"}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
