"use client";

import Link from "next/link";
import { ArrowRight, BookOpen, Headphones } from "lucide-react";
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

function estimateBand(scorePct: number): number {
  if (scorePct >= 97) return 9.0;
  if (scorePct >= 93) return 8.5;
  if (scorePct >= 87) return 8.0;
  if (scorePct >= 82) return 7.5;
  if (scorePct >= 75) return 7.0;
  if (scorePct >= 67) return 6.5;
  if (scorePct >= 60) return 6.0;
  if (scorePct >= 52) return 5.5;
  if (scorePct >= 47) return 5.0;
  if (scorePct >= 40) return 4.5;
  if (scorePct >= 35) return 4.0;
  if (scorePct >= 30) return 3.5;
  if (scorePct >= 25) return 3.0;
  if (scorePct >= 20) return 2.5;
  return 2.0;
}

export function HeroLevelCard({
  cefrLevel,
  currentBand,
  targetBand,
  placementCompleted,
  reading,
  listening,
}: HeroLevelCardProps) {
  if (!placementCompleted) {
    return (
      <section className="px-5 pt-8 sm:px-8 md:pt-10">
        <div className="rounded-[2rem] border border-slate-100 bg-white p-6 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-text-secondary">
            LinguABC Estimated Level
          </p>
          <h2 className="mt-2 font-heading text-xl font-bold text-text-primary">
            Let&apos;s find your real level
          </h2>
          <p className="mt-1 text-sm text-text-secondary">
            Take the placement test so Tuto can build an accurate study plan for you.
          </p>
          <Link
            href="/assessment/placement"
            className="mt-4 inline-flex items-center gap-2 rounded-2xl bg-[#FF6B00] px-6 py-3 text-sm font-bold text-white shadow-md transition-opacity hover:opacity-90"
          >
            Start Placement
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>
      </section>
    );
  }

  const readingBand = reading ? estimateBand(reading.scorePct) : null;
  const listeningBand = listening ? estimateBand(listening.scorePct) : null;

  return (
    <section className="px-5 pt-8 sm:px-8 md:pt-10">
      <div className="relative overflow-hidden rounded-[2rem] bg-gradient-to-br from-[#0F172A] to-[#1E293B] p-6 shadow-lg">
        {/* Orange ambient glow */}
        <div
          className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-[#FF6B00]/20 blur-2xl"
          aria-hidden="true"
        />

        {/* Top row: label + badge */}
        <div className="relative flex items-start justify-between gap-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-white/50">
            LinguABC Estimated Level
          </p>
          <span className="shrink-0 rounded-full bg-white/10 px-3 py-1 text-[10px] font-semibold text-white/70">
            Not an official IELTS score
          </span>
        </div>

        {/* CEFR level + band */}
        <div className="relative mt-3 flex items-end gap-4">
          <p className="text-5xl font-bold text-white leading-none">
            {cefrLevel ?? "—"}
          </p>
          <div className="pb-1">
            <p className="text-2xl font-bold text-white/80 leading-none">
              {currentBand !== null ? currentBand.toFixed(2) : "—"}
            </p>
            {targetBand !== null && (
              <p className="mt-0.5 text-[11px] text-white/40">
                Target {targetBand.toFixed(1)}
              </p>
            )}
          </div>
        </div>

        {/* Section sub-cards */}
        <div className="relative mt-5 grid grid-cols-2 gap-3">
          <div className="rounded-2xl p-4 backdrop-blur-sm" style={{ background: "rgba(255,255,255,0.10)" }}>
            <div className="flex items-center gap-2">
              <div
                className="flex h-7 w-7 items-center justify-center rounded-lg"
                style={{ background: "rgba(255,107,0,0.18)" }}
              >
                <BookOpen className="h-3.5 w-3.5 text-[#FF6B00]" />
              </div>
              <p className="text-xs font-semibold text-white/70">Reading</p>
            </div>
            {readingBand !== null ? (
              <p className="mt-2 text-xl font-black text-white">
                {readingBand.toFixed(1)}
              </p>
            ) : (
              <p className="mt-2 text-xs text-white/30">Take a mock</p>
            )}
          </div>

          <div className="rounded-2xl p-4 backdrop-blur-sm" style={{ background: "rgba(255,255,255,0.10)" }}>
            <div className="flex items-center gap-2">
              <div
                className="flex h-7 w-7 items-center justify-center rounded-lg"
                style={{ background: "rgba(59,130,246,0.18)" }}
              >
                <Headphones className="h-3.5 w-3.5 text-blue-400" />
              </div>
              <p className="text-xs font-semibold text-white/70">Listening</p>
            </div>
            {listeningBand !== null ? (
              <p className="mt-2 text-xl font-black text-white">
                {listeningBand.toFixed(1)}
              </p>
            ) : (
              <p className="mt-2 text-xs text-white/30">Take a mock</p>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
