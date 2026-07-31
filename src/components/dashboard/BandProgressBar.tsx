"use client";

import { BAND_SCALE_MAX, type BandProgress } from "@/lib/dashboard/exam-snapshot";
import { formatBandValue } from "@/lib/dashboard/exam-snapshot";

export interface BandProgressBarProps {
  progress: BandProgress;
  currentBand: number;
  targetBand: number;
}

/**
 * The band gap, drawn against the full 0–9 IELTS scale rather than
 * against the gap itself.
 *
 * Scaling to the gap would make every learner look ~two thirds of the way
 * there regardless of whether they're at 4.0 or 8.0, which is flattering
 * and useless. Against the real scale, a 6.0 sits where a 6.0 actually
 * sits, and the ghost segment between the two markers is the honest
 * picture of the work left.
 *
 * Radius note: Base44's `rounded-2xl` here is Tailwind's stock 16px, but
 * this project overrides --radius-2xl to 36px, so the token is
 * `rounded-choice` (docs/coding-standards.md).
 */
export function BandProgressBar({ progress, currentBand, targetBand }: BandProgressBarProps) {
  const { currentPercent, targetPercent, bandsToGo } = progress;
  // A target at or below the current band is legitimate (onboarding warns
  // but doesn't block) — the ghost segment simply has nothing to draw.
  const gapWidth = Math.max(0, targetPercent - currentPercent);

  return (
    <div className="mt-3 rounded-choice border border-border bg-bg-card p-5 shadow-sm sm:p-6">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-text-primary">Band Progress</p>
        <div className="flex items-center gap-2 text-sm">
          <span className="font-bold text-primary">{formatBandValue(currentBand)}</span>
          <span className="text-text-tertiary" aria-hidden="true">
            &rarr;
          </span>
          <span className="font-bold text-text-primary">{formatBandValue(targetBand)}</span>
        </div>
      </div>

      <div
        className="relative mt-4 h-3 rounded-full bg-bg-muted"
        role="progressbar"
        aria-label={`Band ${formatBandValue(currentBand)} of a possible ${BAND_SCALE_MAX}, target ${formatBandValue(targetBand)}`}
        aria-valuenow={currentBand}
        aria-valuemin={0}
        aria-valuemax={BAND_SCALE_MAX}
      >
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-primary to-[#FF8C33] transition-all duration-700"
          style={{ width: `${currentPercent}%` }}
        />
        <div
          className="absolute inset-y-0 rounded-full bg-primary-light"
          style={{ left: `${currentPercent}%`, width: `${gapWidth}%` }}
        />
        <div
          className="absolute top-1/2 h-5 w-5 -translate-y-1/2 rounded-full border-2 border-bg-card bg-primary shadow-md"
          style={{ left: `calc(${currentPercent}% - 10px)` }}
        />
        <div
          className="absolute top-1/2 h-5 w-5 -translate-y-1/2 rounded-full border-2 border-primary bg-bg-card shadow-md"
          style={{ left: `calc(${targetPercent}% - 10px)` }}
        />
      </div>

      <div className="mt-2.5 flex justify-between text-[10px] font-medium text-text-tertiary">
        <span>Band 0</span>
        <span className="font-semibold text-primary">
          {bandsToGo > 0 ? `${bandsToGo.toFixed(1)} bands to go` : "You're at your target band"}
        </span>
        <span>Band {BAND_SCALE_MAX}</span>
      </div>
    </div>
  );
}
