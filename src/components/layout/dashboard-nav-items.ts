import { Compass, Home, TrendingUp, User } from "lucide-react";
import type { LucideIcon } from "lucide-react";

export interface DashboardNavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  /** Extra route prefixes that should also highlight this tab (docs/dashboard-architecture.md §2/§3 — content one level under a tab counts as that tab). */
  activeMatch: (pathname: string) => boolean;
}

/**
 * The 4 flat top-level destinations (docs/dashboard-architecture.md §2/§3) —
 * exactly 4, no 5th tab, no overflow menu. Shared by the desktop sidebar and
 * the mobile bottom nav so the two chrome treatments never drift apart.
 */
export const DASHBOARD_NAV_ITEMS: DashboardNavItem[] = [
  {
    label: "Home",
    href: "/dashboard",
    icon: Home,
    activeMatch: (pathname) => pathname === "/dashboard",
  },
  {
    label: "Explore",
    href: "/explore",
    icon: Compass,
    activeMatch: (pathname) => pathname === "/explore" || pathname.startsWith("/podcast"),
  },
  {
    label: "Progress",
    href: "/progress",
    icon: TrendingUp,
    activeMatch: (pathname) => pathname === "/progress",
  },
  {
    label: "Profile",
    href: "/profile",
    icon: User,
    activeMatch: (pathname) => pathname === "/profile" || pathname === "/settings",
  },
];
