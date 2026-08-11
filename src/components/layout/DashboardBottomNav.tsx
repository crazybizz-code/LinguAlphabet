"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { DASHBOARD_NAV_ITEMS } from "@/components/layout/dashboard-nav-items";
import { TutoOnlineAvatar } from "@/components/mascot/TutoOnlineAvatar";

/**
 * Fixed floating pill nav, tablet/mobile only (<1024px). Same 4
 * destinations as DashboardSidebar — see that file's comment.
 */
export function DashboardBottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed inset-x-0 bottom-0 z-50 hidden max-lg:block">
      <div className="mx-auto max-w-2xl">
        <div className="mx-3 mb-3 flex items-center justify-around rounded-[1.75rem] border border-border bg-bg-card/90 px-2 py-2 shadow-soft backdrop-blur-xl max-md:mb-[calc(12px+env(safe-area-inset-bottom))]">
          {DASHBOARD_NAV_ITEMS.map(({ label, href, icon: Icon, activeMatch, isTuto }) => {
            const isActive = activeMatch(pathname);
            return (
              <Link
                key={label}
                href={href}
                className="group relative flex flex-1 flex-col items-center gap-1 py-1.5"
              >
                <span
                  className={cn(
                    "flex h-9 w-9 items-center justify-center rounded-2xl transition-all duration-300",
                    isActive
                      ? "bg-primary text-text-on-primary shadow-glow"
                      : "text-text-tertiary group-hover:text-text-secondary",
                  )}
                >
                  {isTuto ? (
                    <TutoOnlineAvatar />
                  ) : (
                    <Icon className="h-[18px] w-[18px]" strokeWidth={isActive ? 2.4 : 2} />
                  )}
                </span>
                <span
                  className={cn(
                    "text-[10px] font-semibold tracking-tight transition-colors",
                    isActive ? "text-text-primary" : "text-text-tertiary",
                  )}
                >
                  {label}
                </span>
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
