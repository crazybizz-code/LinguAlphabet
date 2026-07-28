import type { ReactNode } from "react";
import { DashboardSidebar } from "@/components/layout/DashboardSidebar";
import { DashboardBottomNav } from "@/components/layout/DashboardBottomNav";

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
 * FloatingTuto.tsx itself is kept, unused, only as long as it takes to
 * confirm nothing else still imports it.
 */
export function DashboardShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-bg">
      <DashboardSidebar />
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
