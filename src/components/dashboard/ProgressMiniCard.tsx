"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ChevronRight } from "lucide-react";

export interface BandSnapshot {
  band: number;
  date: string;
}

export interface ProgressMiniCardProps {
  bandHistory: BandSnapshot[];
  nextAssessmentInDays: number | null;
}

export function ProgressMiniCard({ bandHistory, nextAssessmentInDays }: ProgressMiniCardProps) {
  if (bandHistory.length === 0) return null;

  const min = Math.max(0, Math.min(...bandHistory.map((s) => s.band)) - 0.5);
  const max = Math.min(9, Math.max(...bandHistory.map((s) => s.band)) + 0.5);
  const range = max - min || 1;

  return (
    <motion.section
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.3 }}
      className="mt-5 px-5 sm:px-8"
    >
      <div className="rounded-[2rem] border border-slate-100 bg-white p-5 shadow-sm sm:p-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-text-primary">Progress</h2>
          <Link
            href="/progress"
            className="flex items-center gap-0.5 text-xs font-semibold text-[#FF6B00] hover:underline"
          >
            View all
            <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
        </div>

        <p className="mt-1 text-xs text-text-secondary">Estimated band trend</p>

        {/* Bar chart */}
        <div className="mt-3 flex h-16 items-end gap-2" aria-hidden="true">
          {bandHistory.map((snap, i) => {
            const heightPct = ((snap.band - min) / range) * 100;
            return (
              <div
                key={i}
                className="flex-1 rounded-t-lg bg-gradient-to-t from-[#FF6B00] to-[#FF8C33]"
                style={{ height: `${Math.max(8, heightPct)}%` }}
                title={`${snap.band.toFixed(1)}`}
              />
            );
          })}
        </div>

        {/* Footer */}
        {nextAssessmentInDays !== null && (
          <div className="mt-3 flex items-center justify-between text-xs">
            <span className="text-text-secondary">Next assessment</span>
            <span className="font-semibold text-text-primary">
              {nextAssessmentInDays <= 0 ? "Today" : `in ${nextAssessmentInDays} day${nextAssessmentInDays === 1 ? "" : "s"}`}
            </span>
          </div>
        )}
      </div>
    </motion.section>
  );
}
