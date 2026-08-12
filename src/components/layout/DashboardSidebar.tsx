"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpen, Flame, Star } from "lucide-react";
import { cn } from "@/lib/utils";
import { DASHBOARD_NAV_ITEMS } from "@/components/layout/dashboard-nav-items";
import { TutoOnlineAvatar } from "@/components/mascot/TutoOnlineAvatar";
import type { LearnerSidebarStats } from "@/lib/content/sidebar-stats";

export function DashboardSidebar({ learnerStats = null }: { learnerStats?: LearnerSidebarStats | null }) {
  const pathname = usePathname();

  return (
    <aside className="fixed left-0 top-0 bottom-0 z-40 flex w-[260px] flex-col border-r border-border bg-bg-card px-6 py-8 max-lg:hidden">
      {/* Brand */}
      <div className="flex items-center gap-3 px-2">
        <div className="relative h-9 w-9 shrink-0 overflow-hidden rounded-full border border-border">
          <Image
            src="/assets/mascot/master-tuto.png"
            alt="LinguABC"
            fill
            className="object-cover"
          />
        </div>
        <div>
          <p className="text-sm font-bold text-text-primary">LinguABC</p>
          <p className="text-xs text-text-tertiary">IELTS, with Tuto</p>
        </div>
      </div>

      {/* Nav */}
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
              {learnerStats.cefrLevel && (
                <div className="flex items-center gap-2 text-sm">
                  <BookOpen className="h-4 w-4 text-primary" aria-hidden="true" />
                  <span className="font-bold text-text-primary">{learnerStats.cefrLevel}</span>
                  <span className="text-text-tertiary">Est. level</span>
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
