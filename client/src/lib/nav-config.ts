import {
  LayoutDashboard,
  CalendarDays,
  Clock,
  DollarSign,
  Users,
  Palette,
  Store,
  Sparkles,
  Sofa,
  User,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export type NavRole = "admin" | "crew" | "client";

export interface NavItem {
  label: string;
  path: string;
  icon: LucideIcon;
  allowedRoles: NavRole[];
  group: string;
}

export const NAV_ITEMS: NavItem[] = [
  {
    label: "Dashboard",
    path: "/",
    icon: LayoutDashboard,
    allowedRoles: ["admin", "crew", "client"],
    group: "Overview",
  },
  {
    label: "Master Calendar",
    path: "/master-calendar",
    icon: CalendarDays,
    allowedRoles: ["admin", "crew"],
    group: "Operations",
  },
  {
    label: "Log Hours",
    path: "/timesheets",
    icon: Clock,
    allowedRoles: ["admin", "crew"],
    group: "Operations",
  },
  {
    label: "Payroll",
    path: "/payroll",
    icon: DollarSign,
    allowedRoles: ["admin"],
    group: "Operations",
  },
  {
    label: "Colour Portfolio",
    path: "/colors",
    icon: Palette,
    allowedRoles: ["admin", "crew"],
    group: "Operations",
  },
  {
    label: "Crew & Trade",
    path: "/crew-and-trade",
    icon: Users,
    allowedRoles: ["admin", "crew"],
    group: "Operations",
  },
  {
    label: "Supplier Prices",
    path: "/supplier-prices",
    icon: Store,
    allowedRoles: ["admin"],
    group: "Tools",
  },
  {
    label: "Social Media",
    path: "/social-media",
    icon: Sparkles,
    allowedRoles: ["admin"],
    group: "Tools",
  },
  {
    label: "Furniture Planner",
    path: "/table-redesign",
    icon: Sofa,
    allowedRoles: ["admin"],
    group: "Tools",
  },
  {
    label: "Profile",
    path: "/profile",
    icon: User,
    allowedRoles: ["admin", "crew", "client"],
    group: "Personal",
  },
];

export function getNavItemsForRole(effectiveRole: NavRole): NavItem[] {
  return NAV_ITEMS.filter((item) => item.allowedRoles.includes(effectiveRole));
}

export function groupNavItems(items: NavItem[]): Record<string, NavItem[]> {
  const groups: Record<string, NavItem[]> = {};
  for (const item of items) {
    if (!groups[item.group]) groups[item.group] = [];
    groups[item.group].push(item);
  }
  return groups;
}
