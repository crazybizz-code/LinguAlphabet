import { Calendar, ClipboardList, Dumbbell, Home, TrendingUp, User } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { ComponentType } from "react";

export interface DashboardNavItem {
  label: string;
  href: string;
  icon: LucideIcon | ComponentType<{ className?: string }>;
  activeMatch: (pathname: string) => boolean;
  isTuto?: boolean;
}

/**
 * Seven primary nav destinations shared by DashboardSidebar (desktop) and
 * DashboardBottomNav (mobile). Matches the Base44 navigation structure:
 * Dashboard · Practice · Mock · Plan · Progress · Tuto · Profile.
 */
export const DASHBOARD_NAV_ITEMS: DashboardNavItem[] = [
  {
    label: "Dashboard",
    href: "/dashboard",
    icon: Home,
    activeMatch: (pathname) => pathname === "/dashboard",
  },
  {
    label: "Practice",
    href: "/practice",
    icon: Dumbbell,
    activeMatch: (pathname) => pathname === "/practice" || pathname.startsWith("/practice/"),
  },
  {
    label: "Mock",
    href: "/mock",
    icon: ClipboardList,
    activeMatch: (pathname) => pathname === "/mock" || pathname.startsWith("/mock/"),
  },
  {
    label: "Plan",
    href: "/plan",
    icon: Calendar,
    activeMatch: (pathname) => pathname === "/plan",
  },
  {
    label: "Progress",
    href: "/progress",
    icon: TrendingUp,
    activeMatch: (pathname) => pathname === "/progress",
  },
  {
    label: "Tuto",
    href: "/tuto",
    icon: User,
    activeMatch: (pathname) => pathname === "/tuto" || pathname.startsWith("/tuto/"),
    isTuto: true,
  },
  {
    label: "Profile",
    href: "/profile",
    icon: User,
    activeMatch: (pathname) => pathname === "/profile" || pathname === "/settings",
  },
];
