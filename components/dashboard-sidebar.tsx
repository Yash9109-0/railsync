"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import {
  Tooltip,
  TooltipProvider,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import { NAV_LINKS, type NavLink } from "@/lib/roles";
import { cn } from "@/lib/utils";
import {
  AlertTriangle,
  CheckCircle,
  ChevronLeft,
  ChevronRight,
  Loader2,
  LogOut,
  Moon,
  Sparkles,
  Sun,
  TrainFront,
  Settings,
  HelpCircle,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { useTheme } from "@/components/theme-provider";
import { useOnboardingTour } from "@/components/OnboardingTour";

interface DashboardSidebarProps {
  role: string | null;
  fullName: string | null;
  userEmail: string | null;
  userId: string;
}

const COLLAPSED_STORAGE_KEY = "rail-sync-sidebar-collapsed";
const WELCOME_BACK_KEY = "rail-sync-welcome-back-shown";

const NARROW_QUERY = "(max-width: 768px)";

function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(false);
  useEffect(() => {
    const media = window.matchMedia(query);
    const update = () => setMatches(media.matches);
    setMatches(media.matches);
    media.addEventListener?.("change", update);
    return () => media.removeEventListener?.("change", update);
  }, [query]);
  return matches;
}

type ActivityKind = "scored" | "approved" | "completed" | "defect";

interface ActivityItem {
  id: string;
  kind: ActivityKind;
  description: string;
  timestamp: string;
}

interface ActivityRequestRow {
  id: string;
  work_type: string;
  created_at: string;
}

interface ActivityApprovalRow {
  id: string;
  decision: string | null;
  decided_at: string;
}

interface ActivityLogRow {
  id: string;
  actual_end: string | null;
}

interface ActivityDefectRow {
  id: string;
  defect_type: string;
  created_at: string;
}

const ACTIVITY_ICONS: Record<ActivityKind, LucideIcon> = {
  scored: Sparkles,
  approved: CheckCircle,
  completed: Wrench,
  defect: AlertTriangle,
};

const ACTIVITY_ICON_CLS: Record<ActivityKind, string> = {
  scored: "text-primary",
  approved: "text-success",
  completed: "text-success",
  defect: "text-warning",
};

const ACTIVITY_POLL_MS = 30_000;
const ACTIVITY_LIMIT = 4;

function relativeTime(iso: string, now: number) {
  const diffMs = now - Date.parse(iso);
  if (!Number.isFinite(diffMs)) return "";
  const mins = Math.floor(Math.max(0, diffMs) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function humanizeDefectType(type: string) {
  const spaced = type.replace(/_/g, " ").trim();
  return spaced ? spaced.charAt(0).toUpperCase() + spaced.slice(1) : "Defect";
}

export function DashboardSidebar({
  role,
  fullName,
  userEmail,
  userId,
}: DashboardSidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [showWelcome, setShowWelcome] = useState(false);

  const { hasCompleted, startTour } = useOnboardingTour(
    userId,
    (role as "admin" | "maintenance" | "control" | "field") || "maintenance"
  );

  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    const saved = localStorage.getItem(COLLAPSED_STORAGE_KEY);
    setCollapsed(saved === "true");
  }, []);
  useEffect(() => {
    localStorage.setItem(COLLAPSED_STORAGE_KEY, String(collapsed));
  }, [collapsed]);

  useEffect(() => {
    const hasShown = sessionStorage.getItem(WELCOME_BACK_KEY);
    if (!hasShown) {
      setShowWelcome(true);
      sessionStorage.setItem(WELCOME_BACK_KEY, "true");
    }
  }, []);

  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [loadingActivity, setLoadingActivity] = useState(true);
  const [activityNow, setActivityNow] = useState(() => Date.now());

  const fetchActivity = useCallback(async () => {
    const supabase = createClient();
    const [scoredRes, approvedRes, completedRes, defectsRes] =
      await Promise.all([
        supabase
          .from("block_requests")
          .select("id, work_type, created_at")
          .not("priority_score", "is", null)
          .order("created_at", { ascending: false })
          .limit(ACTIVITY_LIMIT),
        supabase
          .from("approvals")
          .select("id, decision, decided_at")
          .in("decision", ["approved", "modified"])
          .order("decided_at", { ascending: false })
          .limit(ACTIVITY_LIMIT),
        supabase
          .from("execution_logs")
          .select("id, actual_end")
          .eq("status", "completed")
          .not("actual_end", "is", null)
          .order("actual_end", { ascending: false })
          .limit(ACTIVITY_LIMIT),
        supabase
          .from("defects")
          .select("id, defect_type, created_at")
          .order("created_at", { ascending: false })
          .limit(ACTIVITY_LIMIT),
      ]);

    const error =
      scoredRes.error ?? approvedRes.error ?? completedRes.error ?? defectsRes.error;
    if (error) {
      console.error("Failed to load recent activity:", error.message);
    }

    const items: ActivityItem[] = [];

    for (const row of (scoredRes.data ?? []) as ActivityRequestRow[]) {
      items.push({
        id: `scored-${row.id}`,
        kind: "scored",
        description: `AI scored a ${row.work_type} request`,
        timestamp: row.created_at,
      });
    }

    for (const row of (approvedRes.data ?? []) as ActivityApprovalRow[]) {
      items.push({
        id: `approved-${row.id}`,
        kind: "approved",
        description:
          row.decision === "modified"
            ? "Block plan approved (modified)"
            : "Block plan approved",
        timestamp: row.decided_at,
      });
    }

    for (const row of (completedRes.data ?? []) as ActivityLogRow[]) {
      if (!row.actual_end) continue;
      items.push({
        id: `completed-${row.id}`,
        kind: "completed",
        description: "Field work completed",
        timestamp: row.actual_end,
      });
    }

    for (const row of (defectsRes.data ?? []) as ActivityDefectRow[]) {
      items.push({
        id: `defect-${row.id}`,
        kind: "defect",
        description: `Defect logged — ${humanizeDefectType(row.defect_type)}`,
        timestamp: row.created_at,
      });
    }

    items.sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp));
    setActivity(items.slice(0, ACTIVITY_LIMIT));
    setLoadingActivity(false);
  }, []);

  useEffect(() => {
    const supabase = createClient();

    const refresh = () => {
      setActivityNow(Date.now());
      fetchActivity();
    };

    refresh();

    // Live updates; a 30s poll doubles as a fallback and keeps timestamps fresh.
    const channel = supabase
      .channel("recent-activity")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "block_requests" },
        refresh,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "approvals" },
        refresh,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "execution_logs" },
        refresh,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "defects" },
        refresh,
      )
      .subscribe();

    const interval = setInterval(refresh, ACTIVITY_POLL_MS);

    return () => {
      clearInterval(interval);
      supabase.removeChannel(channel);
    };
  }, [fetchActivity]);

  const isNarrow = useMediaQuery(NARROW_QUERY);
  const showIconsOnly = collapsed || isNarrow;

  const visibleLinks: NavLink[] =
    role === "admin"
      ? NAV_LINKS
      : NAV_LINKS.filter((link) => link.role === role);

  const handleSignOut = async () => {
    setIsSigningOut(true);
    const supabase = createClient();
    const { error } = await supabase.auth.signOut();
    if (error) {
      toast.error("Failed to sign out");
      setIsSigningOut(false);
    } else {
      toast.success("Signed out successfully");
      router.replace("/login");
    }
  };

  const { theme, toggleTheme } = useTheme();

  const displayName = fullName || userEmail || "User";
  const initials = displayName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  const roleLabel = role
    ? role.charAt(0).toUpperCase() + role.slice(1)
    : "User";

  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(href + "/");

  const baseLinkCls =
    "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all";

  const labelCls = cn(
    "truncate transition-all",
    "hidden md:inline-block",
    collapsed && "md:hidden",
  );

  const activeLinkCls = "bg-gradient-primary text-primary-foreground";
  const inactiveLinkCls = "text-muted-foreground hover:bg-primary-hover hover:text-foreground";

  return (
    <aside
      className={cn(
        "flex flex-col border-r bg-background transition-[width] duration-250 ease-in-out",
        "w-16 md:w-64",
        collapsed && "md:w-16",
      )}
    >
      <div className="flex h-14 items-center justify-between px-3">
        <Link href="/dashboard" className="flex items-center gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <TrainFront className="h-4 w-4" />
          </div>
          <span
            className={cn(
              "text-xl font-bold whitespace-nowrap text-foreground font-heading",
              "hidden md:inline-block",
              collapsed && "md:hidden",
            )}
          >
            RailSync
          </span>
        </Link>

        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          className="hidden shrink-0 md:inline-flex"
          onClick={() => setCollapsed((v) => !v)}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? (
            <ChevronRight className="h-4 w-4" />
          ) : (
            <ChevronLeft className="h-4 w-4" />
          )}
        </Button>
      </div>

      <TooltipProvider delayDuration={350}>
        <nav className="flex-1 space-y-1 px-2 py-4">
          {visibleLinks.map((link) => {
            const Icon: LucideIcon = link.icon;
            const linkCls = cn(
              baseLinkCls,
              isActive(link.href)
                ? activeLinkCls
                : inactiveLinkCls,
              showIconsOnly && "justify-center",
            );

            const linkNode = (
              <Link href={link.href} className={linkCls} key={link.href}>
                <Icon className="h-5 w-5 shrink-0" />
                <span className={labelCls}>{link.label}</span>
              </Link>
            );

            if (showIconsOnly) {
              return (
                <Tooltip key={link.href}>
                  <TooltipTrigger asChild>{linkNode}</TooltipTrigger>
                  <TooltipContent side="right">{link.label}</TooltipContent>
                </Tooltip>
              );
            }
            return linkNode;
          })}
        </nav>
      </TooltipProvider>

      {/* Recent activity — compact live feed of the latest actions */}
      <div
        className={cn(
          "px-2 pb-2",
          "hidden md:block",
          collapsed && "md:hidden",
        )}
      >
        <p className="px-3 pb-1 text-xs font-semibold text-muted-foreground">
          Recent Activity
        </p>
        {loadingActivity ? (
          <div className="flex items-center justify-center py-3">
            <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
          </div>
        ) : activity.length === 0 ? (
          <p className="px-3 py-1 text-xs text-muted-foreground/70">
            No recent activity
          </p>
        ) : (
          <ul className="space-y-1">
            {activity.map((item) => {
              const Icon = ACTIVITY_ICONS[item.kind];
              return (
                <li
                  key={item.id}
                  className="flex items-center gap-2 rounded-md px-3 py-1 transition-colors hover:bg-primary-hover"
                >
                  <Icon
                    className={cn(
                      "h-3 w-3 shrink-0",
                      ACTIVITY_ICON_CLS[item.kind],
                    )}
                  />
                  <span
                    className="min-w-0 flex-1 truncate text-xs"
                    title={item.description}
                  >
                    {item.description}
                  </span>
                  <span className="shrink-0 whitespace-nowrap text-xs text-muted-foreground">
                    {relativeTime(item.timestamp, activityNow)}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <Separator className="mx-3" />

      <div
        className={cn(
          "flex items-center justify-between gap-3 px-3 py-4 transition-all duration-500",
          showWelcome
            ? "animate-in fade-in-0 zoom-in-95"
            : "",
        )}
      >
        <div className="flex min-w-0 items-center gap-3">
          <Avatar className="h-9 w-9 shrink-0">
            <AvatarFallback userId={userId} name={displayName}>
              {initials}
            </AvatarFallback>
          </Avatar>

          <div
            className={cn(
              "flex min-w-0 flex-1 flex-col",
              "hidden md:block",
              collapsed && "md:hidden",
            )}
          >
            <span className="block font-medium truncate">{displayName}</span>
            <Badge variant="outline" className="w-fit text-xs">
              {roleLabel}
            </Badge>
            {showWelcome && (
              <span className="text-xs text-primary font-medium animate-in fade-in slide-in-from-bottom-2 duration-300 delay-200">
                Welcome back!
              </span>
            )}
          </div>
        </div>

        <TooltipProvider delayDuration={350}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                className="shrink-0 hover:bg-primary-hover"
                onClick={toggleTheme}
                aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
              >
                {theme === "dark" ? (
                  <Sun className="h-4 w-4" />
                ) : (
                  <Moon className="h-4 w-4" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top">
              {theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <TooltipProvider delayDuration={350}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    className="shrink-0 hover:bg-primary-hover"
                    aria-label="Settings"
                  >
                    <Settings className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top">Settings</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuLabel className="font-semibold">Settings</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {hasCompleted && (
              <DropdownMenuItem
                onClick={startTour}
                className="flex items-center gap-2"
              >
                <HelpCircle className="h-4 w-4" />
                Show tour again
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={handleSignOut}
              disabled={isSigningOut}
              className="flex items-center gap-2 text-destructive focus:text-destructive"
            >
              <LogOut className="h-4 w-4" />
              {isSigningOut ? "Signing out..." : "Sign out"}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </aside>
  );
}
