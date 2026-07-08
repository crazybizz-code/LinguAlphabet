"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { DASHBOARD_NAV_ITEMS } from "@/components/layout/dashboard-nav-items";

/**
 * Fixed left rail, desktop/laptop only (≥1024px — max-lg:hidden). Tablet and
 * mobile use DashboardBottomNav instead; the IA never changes shape across
 * breakpoints (docs/dashboard-architecture.md §3), only its chrome.
 *
 * The brand mark uses the small gradient "L" icon (public/favicon.svg), not
 * a cropped Tuto — Tuto is the AI coach, never a logo, and our smallest
 * Tuto render (112px) doesn't fit a compact sidebar row anyway.
 */
export function DashboardSidebar() {
  const pathname = usePathname();

  return (
    <aside className="fixed left-0 top-0 bottom-0 z-40 flex w-[260px] flex-col border-r border-border bg-bg-card px-6 py-8 max-lg:hidden">
      <div className="flex items-center gap-3 px-2">
        <Image src="/favicon.svg" alt="" width={36} height={36} className="rounded-md" />
        <div>
          <p className="text-sm font-bold text-text-primary">LinguAlphabet</p>
          <p className="text-xs text-text-tertiary">Learn with Tuto</p>
        </div>
      </div>

      <nav className="mt-10 flex flex-col gap-1">
        {DASHBOARD_NAV_ITEMS.map(({ label, href, icon: Icon, activeMatch }) => {
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
              <Icon className="h-5 w-5" strokeWidth={isActive ? 2.4 : 2} />
              {label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
