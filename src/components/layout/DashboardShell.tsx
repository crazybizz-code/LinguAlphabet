"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { DashboardSidebar } from "@/components/layout/DashboardSidebar";
import { DashboardBottomNav } from "@/components/layout/DashboardBottomNav";
import type { LearnerSidebarStats } from "@/lib/content/sidebar-stats";

/**
 * Routes that manage their own full-bleed, fixed-position layout (Tuto
 * Workspace today; Article/Podcast Coach will join it once they migrate
 * onto the same component) — see the trailing spacer note below.
 */
const FULL_BLEED_ROUTE_PREFIXES = ["/tuto"];

/**
 * Shared shell for every post-onboarding screen. Renders the left rail on
 * desktop/laptop and the floating bottom nav on tablet/mobile. The
 * Podcast Player and Learning Session render outside this shell entirely
 * (see src/app/podcast/[id]/play, .../learn) — they're not in the (app)
 * route group at all. Tuto Workspace IS in this group (so it shares
 * auth/sidebar-stats plumbing with every other page) but still renders
 * its own full-bleed `fixed` layout inside `{children}`
 * (TutoWorkspace.tsx) rather than this shell's normal scrolling content;
 * `isFullBleed` below is what lets this shell recognize that and skip the
 * spacer such a route doesn't need.
 *
 * The global "Ask Tuto" floating entry point (FloatingTuto.tsx) is gone —
 * Tuto is now its own primary nav destination (/tuto, see
 * dashboard-nav-items.ts), not a popup layered on top of every screen.
 *
 * `learnerStats` is fetched once by (app)/layout.tsx and threaded straight
 * through to DashboardSidebar's "Learning Status" panel — `null` while
 * signed out/mid-onboarding, same as the layout's own fetch.
 */
export function DashboardShell({ children, learnerStats = null }: { children: ReactNode; learnerStats?: LearnerSidebarStats | null }) {
  const pathname = usePathname();
  const isFullBleed = FULL_BLEED_ROUTE_PREFIXES.some((prefix) => pathname.startsWith(prefix));

  return (
    <div className="min-h-dvh bg-bg">
      <DashboardSidebar learnerStats={learnerStats} />
      <main className="pl-[260px] max-lg:pl-0">
        {children}
        {/* Clears the floating bottom nav on tablet/mobile so every page's
            last card gets real breathing room instead of ending directly
            under it — skipped on full-bleed routes, which render fixed and
            manage their own scroll/clearance entirely; this spacer would
            just leave the underlying page scrollable by a few extra
            invisible pixels behind their fixed overlay for no reason. */}
        {!isFullBleed && <div className="h-[calc(6rem+env(safe-area-inset-bottom))] lg:hidden" aria-hidden="true" />}
      </main>
      <DashboardBottomNav />
    </div>
  );
}
