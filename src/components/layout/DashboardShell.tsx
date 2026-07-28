import type { ReactNode } from "react";
import { DashboardSidebar } from "@/components/layout/DashboardSidebar";
import { DashboardBottomNav } from "@/components/layout/DashboardBottomNav";
import type { LearnerSidebarStats } from "@/lib/content/sidebar-stats";

/**
 * Shared shell for every post-onboarding screen except the full-bleed
 * Podcast Player, Learning Session, and Tuto Workspace (those routes
 * render outside this shell's normal scrolling content entirely — see
 * src/app/podcast/[id]/play, .../learn, and TutoWorkspace.tsx's own
 * `fixed inset-0`). Renders the left rail on desktop/laptop and the
 * floating bottom nav on tablet/mobile.
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
  return (
    <div className="min-h-dvh bg-bg">
      <DashboardSidebar learnerStats={learnerStats} />
      <main className="pl-[260px] max-lg:pl-0">
        {children}
        {/* Clears the floating bottom nav on tablet/mobile so every page's
            last card gets real breathing room instead of ending directly
            under it. */}
        <div className="h-[calc(6rem+env(safe-area-inset-bottom))] lg:hidden" aria-hidden="true" />
      </main>
      <DashboardBottomNav />
    </div>
  );
}
