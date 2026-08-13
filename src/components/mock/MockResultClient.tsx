"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import {
  BookOpen,
  CalendarClock,
  CheckCircle,
  Headphones,
  RotateCcw,
  TrendingUp,
} from "lucide-react";

const LEVEL_COLORS: Record<string, string> = {
  A1: "#34C759",
  A2: "#30B0C7",
  B1: "#007AFF",
  B2: "#AF52DE",
  C1: "#FF9500",
  C2: "#FFCC00",
};

const AREA_LABELS: Record<string, string> = {
  reading_comprehension: "Reading Comprehension",
  reading_detail: "Reading — Detail Questions",
  listening_comprehension: "Listening Comprehension",
  listening_detail: "Listening — Detail Questions",
  grammar: "Grammar",
  vocabulary: "Vocabulary",
};

const READING_WEAK_AREAS = new Set(["reading_comprehension", "reading_detail"]);
const LISTENING_WEAK_AREAS = new Set(["listening_comprehension", "listening_detail"]);

interface Props {
  attemptId: string;
  readingCorrect: number;
  readingTotal: number;
  readingScorePct: number;
  listeningCorrect: number;
  listeningTotal: number;
  listeningScorePct: number;
  overallScorePct: number;
  estimatedBand: number;
  resultCefrLevel: string;
  targetCefrLevel: string;
  weakAreas: string[];
  nextMockDate: string | null;
}

function ScoreBar({ pct, color }: { pct: number; color: string }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-border">
      <motion.div
        className="h-full rounded-full"
        style={{ backgroundColor: color }}
        initial={{ width: 0 }}
        animate={{ width: `${pct}%` }}
        transition={{ duration: 0.8, ease: "easeOut" }}
      />
    </div>
  );
}

function feedbackMessage(pct: number): string {
  if (pct >= 80) return "Excellent performance! You're well-prepared.";
  if (pct >= 65) return "Good work. Keep practising to reach your target.";
  if (pct >= 50) return "Solid effort. Focus on your weak areas to improve.";
  return "Keep going — every mock reveals exactly what to work on next.";
}

function areaLabel(area: string): string {
  return (
    AREA_LABELS[area] ??
    area.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
  );
}

export function MockResultClient({
  readingCorrect,
  readingTotal,
  readingScorePct,
  listeningCorrect,
  listeningTotal,
  listeningScorePct,
  overallScorePct,
  estimatedBand,
  resultCefrLevel,
  targetCefrLevel,
  weakAreas,
  nextMockDate,
}: Props) {
  const levelColor = LEVEL_COLORS[resultCefrLevel] ?? "#FF6B00";
  const roundedBand = estimatedBand.toFixed(1);

  const readingWeakAreas = weakAreas.filter((a) => READING_WEAK_AREAS.has(a));
  const listeningWeakAreas = weakAreas.filter((a) => LISTENING_WEAK_AREAS.has(a));
  const weaker =
    readingWeakAreas.length > 0 && listeningWeakAreas.length === 0
      ? "reading"
      : listeningWeakAreas.length > 0 && readingWeakAreas.length === 0
        ? "listening"
        : readingScorePct < listeningScorePct
          ? "reading"
          : "listening";

  return (
    <div className="mx-auto max-w-3xl px-5 py-10 sm:px-8">
      {/* Hero result card */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="mb-6 overflow-hidden rounded-[2rem] shadow-xl"
        style={{
          background: "linear-gradient(135deg, #0F172A 0%, #1E293B 100%)",
        }}
      >
        <div className="px-8 py-8 text-center">
          <div className="mb-4 flex justify-center">
            <CheckCircle className="h-12 w-12 text-green-400" aria-hidden="true" />
          </div>
          <p className="text-sm font-semibold uppercase tracking-widest text-white/60">
            Mock Complete
          </p>
          <div className="mt-3 flex items-end justify-center gap-3">
            <span className="font-heading text-6xl font-extrabold text-white">
              {roundedBand}
            </span>
            <span className="mb-2 text-lg font-semibold text-white/70">Band</span>
          </div>
          <div
            className="mt-3 inline-flex items-center rounded-full px-4 py-1.5"
            style={{ backgroundColor: `${levelColor}22`, border: `1px solid ${levelColor}55` }}
          >
            <span className="text-sm font-bold" style={{ color: levelColor }}>
              {resultCefrLevel}
            </span>
          </div>
          <p className="mt-4 text-sm text-white/60">{feedbackMessage(overallScorePct)}</p>

          {/* Overall score bar */}
          <div className="mt-6">
            <div className="mb-2 flex items-center justify-between text-xs text-white/50">
              <span>Overall score</span>
              <span className="font-bold text-white">{Math.round(overallScorePct)}%</span>
            </div>
            <div
              className="h-2 w-full overflow-hidden rounded-full"
              style={{ background: "rgba(255,255,255,0.1)" }}
            >
              <motion.div
                className="h-full rounded-full bg-primary"
                initial={{ width: 0 }}
                animate={{ width: `${overallScorePct}%` }}
                transition={{ duration: 0.9, ease: "easeOut" }}
              />
            </div>
          </div>
        </div>
      </motion.div>

      {/* Section breakdown */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.1 }}
        className="mb-6 overflow-hidden rounded-2xl border border-border bg-bg-card shadow-sm"
      >
        <div className="border-b border-border/40 px-6 py-4">
          <h2 className="text-sm font-semibold text-text-primary">Section Breakdown</h2>
        </div>

        {/* Reading */}
        <div className="border-b border-border/40 px-6 py-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-50">
                <BookOpen className="h-4 w-4 text-amber-500" aria-hidden="true" />
              </div>
              <div>
                <p className="text-sm font-semibold text-text-primary">Reading</p>
                <p className="text-[11px] text-text-secondary">
                  {readingCorrect} / {readingTotal} correct
                </p>
              </div>
            </div>
            <span className="text-base font-bold text-text-primary">
              {Math.round(readingScorePct)}%
            </span>
          </div>
          <ScoreBar pct={readingScorePct} color="#F59E0B" />
        </div>

        {/* Listening */}
        <div className="px-6 py-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50">
                <Headphones className="h-4 w-4 text-blue-500" aria-hidden="true" />
              </div>
              <div>
                <p className="text-sm font-semibold text-text-primary">Listening</p>
                <p className="text-[11px] text-text-secondary">
                  {listeningCorrect} / {listeningTotal} correct
                </p>
              </div>
            </div>
            <span className="text-base font-bold text-text-primary">
              {Math.round(listeningScorePct)}%
            </span>
          </div>
          <ScoreBar pct={listeningScorePct} color="#3B82F6" />
        </div>
      </motion.div>

      {/* Weak areas */}
      {weakAreas.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.15 }}
          className="mb-6 rounded-2xl border border-border bg-bg-card p-5 shadow-sm"
        >
          <h2 className="mb-3 text-sm font-semibold text-text-primary">Focus areas</h2>
          <div className="flex flex-wrap gap-2">
            {weakAreas.map((area) => (
              <span
                key={area}
                className="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary"
              >
                {areaLabel(area)}
              </span>
            ))}
          </div>
          <p className="mt-3 text-xs text-text-secondary">
            Based on your recent practice and this mock.{" "}
            <Link href="/practice" className="font-semibold text-primary hover:underline">
              Practice these areas →
            </Link>
          </p>
        </motion.div>
      )}

      {/* What to practice next */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.18 }}
        className="mb-6 rounded-2xl border border-border bg-bg-card p-5 shadow-sm"
      >
        <h2 className="mb-3 text-sm font-semibold text-text-primary">What to practice next</h2>
        <div className="space-y-2">
          <Link
            href={`/practice/${weaker}`}
            className="flex items-center gap-3 rounded-xl bg-primary/[.07] px-4 py-3 transition-colors hover:bg-primary/[.12]"
          >
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10">
              {weaker === "listening" ? (
                <Headphones className="h-4 w-4 text-primary" aria-hidden="true" />
              ) : (
                <BookOpen className="h-4 w-4 text-primary" aria-hidden="true" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-text-primary capitalize">
                {weaker} Practice
              </p>
              <p className="text-[11px] text-text-secondary">
                {weaker === "reading"
                  ? `Reading scored ${Math.round(readingScorePct)}% — targeted practice will close the gap`
                  : `Listening scored ${Math.round(listeningScorePct)}% — targeted practice will close the gap`}
              </p>
            </div>
            <span className="shrink-0 text-xs font-semibold text-primary">Start →</span>
          </Link>
        </div>
      </motion.div>

      {/* Target comparison */}
      {targetCefrLevel && resultCefrLevel !== targetCefrLevel && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.2 }}
          className="mb-6 rounded-2xl border border-primary/20 bg-primary-lighter px-6 py-4"
        >
          <p className="text-sm text-text-secondary">
            Your target is{" "}
            <span className="font-bold text-primary">{targetCefrLevel}</span>. Keep practising
            — your plan has been updated based on these results.
          </p>
        </motion.div>
      )}

      {/* Next mock timing */}
      {nextMockDate && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.22 }}
          className="mb-6 flex items-center gap-3 rounded-2xl border border-border bg-bg-card px-5 py-4 shadow-sm"
        >
          <CalendarClock className="h-5 w-5 shrink-0 text-text-secondary" aria-hidden="true" />
          <p className="text-sm text-text-secondary">
            <span className="font-semibold text-text-primary">Next recommended mock: </span>
            {nextMockDate}
          </p>
        </motion.div>
      )}

      {/* Actions */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.25 }}
        className="flex flex-col gap-3 sm:flex-row"
      >
        <Link
          href="/dashboard"
          className="flex flex-1 items-center justify-center rounded-2xl bg-primary px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-orange-500/20 transition-all hover:bg-primary-dark"
        >
          Back to Dashboard
        </Link>
        <Link
          href="/progress"
          className="flex flex-1 items-center justify-center gap-2 rounded-2xl border border-border bg-bg-card px-6 py-3 text-sm font-semibold text-text-primary transition-all hover:border-primary/40"
        >
          <TrendingUp className="h-4 w-4" aria-hidden="true" />
          View Progress
        </Link>
        <Link
          href="/mock"
          className="flex flex-1 items-center justify-center gap-2 rounded-2xl border border-border bg-bg-card px-6 py-3 text-sm font-semibold text-text-primary transition-all hover:border-primary/40"
        >
          <RotateCcw className="h-4 w-4" aria-hidden="true" />
          Try Again
        </Link>
      </motion.div>
    </div>
  );
}
