import type { ReactNode } from "react";
import { DashboardSidebar } from "@/components/layout/DashboardSidebar";
import { DashboardBottomNav } from "@/components/layout/DashboardBottomNav";
import { FloatingTuto } from "@/components/layout/FloatingTuto";

/**
 * Shared shell for every post-onboarding screen except the full-bleed
 * Podcast Player and Learning Session (those routes render outside this
 * shell entirely — see src/app/podcast/[id]/play and .../learn). Renders
 * the left rail on desktop/laptop, the floating bottom nav on tablet/
 * mobile, and the global "Ask Tuto" entry point on top of both.
 */
export function DashboardShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-bg">
      <DashboardSidebar />
      <main className="pl-[260px] max-lg:pl-0">
        {children}
        {/* Clears BOTH the floating bottom nav and the Ask Tuto FAB above it
            (FloatingTuto.tsx) on tablet/mobile — 96px alone only cleared the
            nav bar, leaving the FAB (which rests higher, at ~104-160px from
            the viewport bottom, safe-area included) free to sit on top of
            whatever content happened to end at the bottom of the page. This
            gives every page's last card real breathing room to scroll clear
            of both fixed elements instead of ending directly under them. */}
        <div className="h-[calc(11rem+env(safe-area-inset-bottom))] lg:hidden" aria-hidden="true" />
      </main>
      <DashboardBottomNav />
      <FloatingTuto />
    </div>
  );
}
