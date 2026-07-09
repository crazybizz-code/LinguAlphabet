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
        <div className="h-24 lg:hidden" />
      </main>
      <DashboardBottomNav />
      <FloatingTuto />
    </div>
  );
}
