import { Bot, Compass, Gauge, MapPin, type LucideIcon, Wrench } from "lucide-react";

export type UserRole = "admin" | "maintenance" | "control" | "field";

export interface NavLink {
  label: string;
  href: string;
  role: UserRole;
  icon: LucideIcon;
}

export const ROLE_DASHBOARD_ROUTE: Record<UserRole, string> = {
  admin: "/dashboard/ai",
  maintenance: "/dashboard/maintenance",
  control: "/dashboard/control",
  field: "/dashboard/field",
};

export const NAV_LINKS: NavLink[] = [
  {
    label: "Maintenance",
    href: "/dashboard/maintenance",
    role: "maintenance",
    icon: Wrench,
  },
  {
    label: "AI",
    href: "/dashboard/ai",
    role: "admin",
    icon: Bot,
  },
  {
    label: "Control",
    href: "/dashboard/control",
    role: "control",
    icon: Gauge,
  },
  {
    label: "Field",
    href: "/dashboard/field",
    role: "field",
    icon: Compass,
  },
];

export function getDashboardRouteForRole(role: string | null): string {
  switch (role) {
    case "admin":
      return ROLE_DASHBOARD_ROUTE.admin;
    case "maintenance":
      return ROLE_DASHBOARD_ROUTE.maintenance;
    case "control":
      return ROLE_DASHBOARD_ROUTE.control;
    case "field":
      return ROLE_DASHBOARD_ROUTE.field;
    default:
      return "/login";
  }
}

export function getNavLinksForRole(role: string | null): NavLink[] {
  if (role === "admin") return NAV_LINKS;
  return NAV_LINKS.filter((link) => link.role === role);
}

export function isAdminRole(role: string | null): boolean {
  return role === "admin";
}

export const ROLES = ["admin", "maintenance", "control", "field"] as const;
