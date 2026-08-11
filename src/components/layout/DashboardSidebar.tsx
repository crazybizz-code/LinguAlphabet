"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Flame, Star, Target, Trophy } from "lucide-react";
import { cn } from "@/lib/utils";
import { DASHBOARD_NAV_ITEMS } from "@/components/layout/dashboard-nav-items";
import { TutoOnlineAvatar } from "@/components/mascot/TutoOnlineAvatar";
import type { LearnerSidebarStats } from "@/lib/content/sidebar-stats";

/**
 * Fixed left rail, desktop/laptop only (≥1024px — max-lg:hidden). Tablet and
 * mobile use DashboardBottomNav instead; the IA never changes shape across
 * breakpoints (docs/dashboard-architecture.md §3), only its chrome.
 *
 * The brand mark uses the small gradient "L" icon (public/favicon.svg), not
 * a cropped Tuto — Tuto is the AI coach, never a logo, and our smallest
 * Tuto render (112px) doesn't fit a compact sidebar row anyway.
 *
 * "Learning Status" + the "Tuto · Ready to help" card (Base44 reference)
 * fill what used to be dead space below the nav — real numbers
 * (streak/xp/level/daily goal), fetched once in (app)/layout.tsx and
 * passed down, never fabricated here. `null` while signed out/mid-
 * onboarding: the section simply doesn't render rather than show a zero
 * that isn't really the learner's.
 */
export function DashboardSidebar({ learnerStats = null }: { learnerStats?: LearnerSidebarStats | null }) {
  const pathname = usePathname();

  return (
    <aside className="fixed left-0 top-0 bottom-0 z-40 flex w-[260px] flex-col border-r border-border bg-bg-card px-6 py-8 max-lg:hidden">
      <div className="flex items-center gap-3 px-2">
        <Image src="/favicon.svg" alt="" width={36} height={36} className="rounded-md" />
        <div>
          <p className="text-sm font-bold text-text-primary">LinguABC</p>
          <p className="text-xs text-text-tertiary">Learn with Tuto</p>
        </div>
      </div>

      <nav className="mt-10 flex flex-col gap-1">
        {DASHBOARD_NAV_ITEMS.map(({ label, href, icon: Icon, activeMatch, isTuto }) => {
          const isActive = activeMatch(pathname);
          return (
            <Link
              key={label}
              href={href}
              className={cn(
                "flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-semibold transition-all",
                isActive
                  ? "bg-primary text-text-on-primary shadow-glow"
                  : "text-text-secondary hover:bg-bg-muted hover:text-text-primary",
              )}
            >
              {isTuto ? (
                <TutoOnlineAvatar />
              ) : (
                <Icon className="h-5 w-5" strokeWidth={isActive ? 2.4 : 2} />
              )}
              {label}
            </Link>
          );
        })}
      </nav>

      {learnerStats && (
        <div className="mt-auto flex flex-col gap-4">
          <div className="border-t border-border px-2 pt-5">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-text-tertiary">Learning Status</p>
            <div className="mt-3 flex flex-col gap-2.5">
              <div className="flex items-center gap-2 text-sm">
                <Flame className="h-4 w-4 text-primary" aria-hidden="true" />
                <span className="font-bold text-text-primary">{learnerStats.streak}</span>
                <span className="text-text-tertiary">Day streak</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <Star className="h-4 w-4 text-primary" aria-hidden="true" />
                <span className="font-bold text-text-primary">{learnerStats.xp}</span>
                <span className="text-text-tertiary">Total XP</span>
              </div>
              {/* Bands replace the CEFR level here: CEFR is derived from the
                  band and only calibrates language complexity, so showing it
                  on every screen made the wrong number the visible one. Each
                  row is omitted rather than showing a placeholder — an
                  unassessed learner has no current band, and "—" in a status
                  panel reads like a score of nothing. */}
              {learnerStats.currentBand !== null && (
                <div className="flex items-center gap-2 text-sm">
                  <Trophy className="h-4 w-4 text-primary" aria-hidden="true" />
                  <span className="font-bold text-text-primary">{learnerStats.currentBand.toFixed(1)}</span>
                  <span className="text-text-tertiary">Current band</span>
                </div>
              )}
              {learnerStats.targetBand !== null && (
                <div className="flex items-center gap-2 text-sm">
                  <Target className="h-4 w-4 text-primary" aria-hidden="true" />
                  <span className="font-bold text-text-primary">{learnerStats.targetBand.toFixed(1)}</span>
                  <span className="text-text-tertiary">Target band</span>
                </div>
              )}
            </div>

            <div className="mt-4">
              <div className="flex items-center justify-between text-xs font-semibold">
                <span className="text-text-secondary">Daily Goal</span>
                <span className="text-primary">{learnerStats.dailyGoalPercent}%</span>
              </div>
              <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-bg-muted">
                <div
                  className="h-full rounded-full bg-primary transition-all duration-500"
                  style={{ width: `${learnerStats.dailyGoalPercent}%` }}
                />
              </div>
            </div>
          </div>

          <Link
            href="/tuto"
            className="flex items-center gap-3 rounded-2xl bg-primary-lighter px-3 py-2.5 transition-colors hover:bg-primary-light"
          >
            <TutoOnlineAvatar />
            <div>
              <p className="text-sm font-bold text-text-primary">Tuto</p>
              <p className="flex items-center gap-1.5 text-xs text-text-tertiary">
                <span className="h-1.5 w-1.5 rounded-full bg-success" aria-hidden="true" />
                Ready to help
              </p>
            </div>
          </Link>
        </div>
      )}
    </aside>
  );
}
