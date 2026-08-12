"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { DashboardSidebar } from "@/components/layout/DashboardSidebar";
import { DashboardBottomNav } from "@/components/layout/DashboardBottomNav";
import type { LearnerSidebarStats } from "@/lib/content/sidebar-stats";

const FULL_BLEED_ROUTE_PREFIXES = ["/tuto"];

export function DashboardShell({
  children,
  learnerStats = null,
}: {
  children: ReactNode;
  learnerStats?: LearnerSidebarStats | null;
}) {
  const pathname = usePathname();
  const isFullBleed = FULL_BLEED_ROUTE_PREFIXES.some((prefix) => pathname.startsWith(prefix));

  return (
    <div className="min-h-dvh bg-bg">
      <DashboardSidebar learnerStats={learnerStats} />
      <main className="pl-[260px] max-lg:pl-0">
        {children}
        {!isFullBleed && (
          <div className="h-[calc(6rem+env(safe-area-inset-bottom))] lg:hidden" aria-hidden="true" />
        )}
      </main>
      <DashboardBottomNav />
    </div>
  );
}
