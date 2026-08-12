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

export function HeroLevelCard({ cefrLevel, currentBand, targetBand, placementCompleted, reading, listening }: HeroLevelCardProps) {
  return (
    <section className="px-5 pt-2 sm:px-8">
      <div className="relative overflow-hidden rounded-[2rem] bg-gradient-to-br from-[#0F172A] to-[#1E293B] p-6 shadow-lg sm:p-8">
        <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-[#FF6B00]/20 blur-2xl" />
        <div className="relative">
          <div className="flex items-center justify-between gap-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-white/60">LinguABC Estimated Level</p>
            <span className="rounded-full bg-white/10 px-3 py-1 text-[10px] font-semibold text-white/60">
              {placementCompleted ? "Not an official IELTS score" : "Self-reported"}
            </span>
          </div>
          <div className="mt-3 flex items-end gap-3">
            <span className="text-5xl font-bold tracking-tight text-white">{cefrLevel ?? "-"}</span>
            <span className="mb-1.5 text-2xl font-bold text-white/80">{currentBand !== null ? currentBand.toFixed(2) : "-"}</span>
            {targetBand !== null && <span className="mb-2 rounded-full bg-[#FF6B00]/20 px-2.5 py-1 text-[10px] font-bold text-[#FFB27A]">Target {targetBand.toFixed(1)}</span>}
          </div>
          <div className="mt-5 grid grid-cols-2 gap-3">
            <div className="rounded-2xl bg-white/10 p-4 backdrop-blur-sm">
              <div className="flex items-center gap-2"><BookOpen className="h-4 w-4 text-white/60" aria-hidden="true" /><p className="text-xs text-white/60">Reading</p></div>
              <p className="mt-1 text-2xl font-bold text-white">{reading ? Math.round(reading.scorePct) : "-"}{reading ? "%" : ""}</p>
            </div>
            <div className="rounded-2xl bg-white/10 p-4 backdrop-blur-sm">
              <div className="flex items-center gap-2"><Headphones className="h-4 w-4 text-white/60" aria-hidden="true" /><p className="text-xs text-white/60">Listening</p></div>
              <p className="mt-1 text-2xl font-bold text-white">{listening ? Math.round(listening.scorePct) : "-"}{listening ? "%" : ""}</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
