import { BookOpen, CalendarDays, FileText, Home, TrendingUp, User } from "lucide-react";
import type { LucideIcon } from "lucide-react";

export interface DashboardNavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  activeMatch: (pathname: string) => boolean;
  isTuto?: boolean;
}

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
    icon: BookOpen,
    activeMatch: (pathname) => pathname === "/practice" || pathname.startsWith("/practice/"),
  },
  {
    label: "Mock",
    href: "/mock",
    icon: FileText,
    activeMatch: (pathname) => pathname === "/mock" || pathname.startsWith("/mock/"),
  },
  {
    label: "Plan",
    href: "/plan",
    icon: CalendarDays,
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
