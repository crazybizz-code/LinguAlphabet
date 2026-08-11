import { Calendar, ClipboardList, Dumbbell, Home, TrendingUp, User } from "lucide-react";
import type { LucideIcon } from "lucide-react";

export interface DashboardNavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  activeMatch: (pathname: string) => boolean;
}

/**
 * Six primary nav destinations shared by DashboardSidebar (desktop) and
 * DashboardBottomNav (mobile). Matches the Base44 navigation structure:
 * Home · Practice · Mock · Plan · Progress · Profile.
 *
 * /explore and /tuto remain accessible as routes; they're no longer
 * primary nav items now that Practice and Mock are dedicated destinations.
 */
export const DASHBOARD_NAV_ITEMS: DashboardNavItem[] = [
  {
    label: "Home",
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
    label: "Profile",
    href: "/profile",
    icon: User,
    activeMatch: (pathname) => pathname === "/profile" || pathname === "/settings",
  },
];
