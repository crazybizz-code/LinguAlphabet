"use client";

import { BookOpen, Headphones } from "lucide-react";
import type { CefrLevel } from "@/types/content";

export interface SectionScore {
  correct: number;
  total: number;
  scorePct: number;
}

export interface HeroLevelCardProps {
  cefrLevel: CefrLevel | null;
  currentBand: number | null;
  targetBand: number | null;
  placementCompleted: boolean;
  reading?: SectionScore | null;
  listening?: SectionScore | null;
}

const LEVEL_COLORS: Record<string, string> = {
  A1: "#34C759",
  A2: "#30B0C7",
  B1: "#007AFF",
  B2: "#AF52DE",
  C1: "#FF9500",
  C2: "#FFCC00",
};

export function HeroLevelCard({
  cefrLevel,
  currentBand,
  targetBand,
  placementCompleted,
  reading,
  listening,
}: HeroLevelCardProps) {
  const levelColor = cefrLevel ? (LEVEL_COLORS[cefrLevel] ?? "#FFFFFF") : "#FFFFFF";

  return (
    <section className="px-5 pt-8 sm:px-8 md:pt-10">
      <div className="rounded-[2rem] bg-gradient-to-br from-[#0F172A] to-[#1E293B] p-6 shadow-lg">
        {/* Top row: level + band */}
        <div className="flex items-start justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-white/50">
              English Level
            </p>
            <p
              className="mt-1 text-5xl font-black leading-none"
              style={{ color: levelColor }}
            >
              {cefrLevel ?? "—"}
            </p>
            {!placementCompleted && (
              <p className="mt-1 text-[11px] text-white/40">Self-reported</p>
            )}
          </div>

          <div className="text-right">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-white/50">
              Est. Band
            </p>
            <p className="mt-1 text-3xl font-black text-white">
              {currentBand !== null ? currentBand.toFixed(1) : "—"}
            </p>
            {targetBand !== null && (
              <p className="mt-0.5 text-[11px] text-white/40">
                Target {targetBand.toFixed(1)}
              </p>
            )}
          </div>
        </div>

        {/* Section sub-cards */}
        <div className="mt-5 grid grid-cols-2 gap-3">
          <div className="rounded-2xl p-4" style={{ background: "rgba(255,255,255,0.07)" }}>
            <div className="flex items-center gap-2">
              <div
                className="flex h-7 w-7 items-center justify-center rounded-lg"
                style={{ background: "rgba(255,107,0,0.18)" }}
              >
                <BookOpen className="h-3.5 w-3.5 text-[#FF6B00]" />
              </div>
              <p className="text-xs font-semibold text-white/70">Reading</p>
            </div>
            {reading ? (
              <>
                <p className="mt-2 text-xl font-black text-white">
                  {Math.round(reading.scorePct)}%
                </p>
                <p className="text-[10px] text-white/40">
                  {reading.correct}/{reading.total} correct
                </p>
              </>
            ) : (
              <p className="mt-2 text-xs text-white/30">
                {placementCompleted ? "Take a mock" : "After placement"}
              </p>
            )}
          </div>

          <div className="rounded-2xl p-4" style={{ background: "rgba(255,255,255,0.07)" }}>
            <div className="flex items-center gap-2">
              <div
                className="flex h-7 w-7 items-center justify-center rounded-lg"
                style={{ background: "rgba(59,130,246,0.18)" }}
              >
                <Headphones className="h-3.5 w-3.5 text-blue-400" />
              </div>
              <p className="text-xs font-semibold text-white/70">Listening</p>
            </div>
            {listening ? (
              <>
                <p className="mt-2 text-xl font-black text-white">
                  {Math.round(listening.scorePct)}%
                </p>
                <p className="text-[10px] text-white/40">
                  {listening.correct}/{listening.total} correct
                </p>
              </>
            ) : (
              <p className="mt-2 text-xs text-white/30">
                {placementCompleted ? "Take a mock" : "After placement"}
              </p>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
