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
import { useOnboardingTour, type UserRole } from "@/components/OnboardingTour";

interface DashboardSidebarProps {
  role: string | null;
  fullName: string | null;
  userEmail: string | null;
  userId: string;
}

const WELCOME_BACK_KEY = "rail-sync-welcome-back-shown";

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

  const { isOpen: tourOpen, startTour, closeTour, completeTour, TourComponent } = useOnboardingTour(userId);

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

  const visibleLinks: NavLink[] = NAV_LINKS;

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
    "relative isolate flex h-[46px] items-center gap-3 rounded-xl px-4 py-3 text-[15px] font-bold leading-none transition-all";

  const activePillCls =
    "absolute inset-x-0 top-1/2 -z-10 h-[38px] -translate-y-1/2 rounded-xl bg-gradient-primary";

  const labelCls = "min-w-0 whitespace-normal leading-tight";

  const activeLinkCls = "text-primary-foreground";
  const inactiveLinkCls = "text-muted-foreground hover:bg-primary-hover hover:text-foreground";

  // `h-full min-h-0` (not `h-screen`) so the sidebar tracks the shell's height
  // instead of redeclaring it. It keeps its own `no-scrollbar` scroller for long
  // nav menus, which is independent of the page's single `main` scrollbar.
  return (
    <aside className="flex h-full min-h-0 w-[260px] min-w-[260px] max-w-[260px] flex-col overflow-y-auto overflow-x-hidden no-scrollbar border-r bg-background">
      {/* Logo area */}
      <div className="flex h-[60px] items-center px-4">
        <Link href="/dashboard" className="flex items-center gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <TrainFront className="h-4 w-4" />
          </div>
          <span className="text-[22px] font-black whitespace-nowrap text-foreground font-heading">
            RailSync
          </span>
        </Link>
      </div>

      <nav className="flex flex-1 flex-col gap-1.5 px-2 py-2">
        {visibleLinks.map((link) => {
          const Icon: LucideIcon = link.icon;
          const active = isActive(link.href);
          const linkCls = cn(
            baseLinkCls,
            active ? activeLinkCls : inactiveLinkCls,
          );

          return (
            <Link href={link.href} className={linkCls} key={link.href}>
              {active && <span aria-hidden="true" className={activePillCls} />}
              <Icon className="w-[22px] h-[22px] shrink-0" />
              <span className={labelCls}>{link.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* Recent activity — compact live feed of the latest actions */}
      <div className="px-2 pb-2">
        <p className="px-3 pb-1 text-[13px] font-bold text-black dark:text-slate-300">
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
                  className="flex items-start gap-2 rounded-md px-3 py-1 transition-colors hover:bg-primary-hover"
                >
                  <Icon
                    className={cn(
                      "mt-0.5 h-3 w-3 shrink-0",
                      ACTIVITY_ICON_CLS[item.kind],
                    )}
                  />
                  <span
                    className="min-w-0 flex-1 whitespace-normal text-[12px] font-bold leading-4 text-black dark:text-slate-400"
                    title={item.description}
                  >
                    {item.description}
                  </span>
                  <span className="shrink-0 whitespace-nowrap text-[12px] text-muted-foreground">
                    {relativeTime(item.timestamp, activityNow)}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Bottom section: stacked flex column */}
      <div className="flex flex-col gap-3 p-4 border-t border-gray-100 dark:border-slate-800">
        {/* User Profile Card */}
        <div className="flex items-center justify-between gap-3 p-3 rounded-xl border border-gray-100 dark:border-slate-800 bg-white dark:bg-slate-900">
          <div className="flex items-center gap-3 min-w-0">
            {/* Avatar */}
            <div className="w-9 h-9 rounded-full bg-purple-100 dark:bg-slate-800 text-purple-700 dark:text-purple-300 font-semibold text-xs flex items-center justify-center shrink-0">
              {initials}
            </div>
            {/* Name & Role */}
            <div className="flex flex-col min-w-0">
              <span className="text-sm font-semibold text-gray-900 dark:text-slate-100 truncate leading-tight">
                {displayName}
              </span>
              <span className="text-[11px] font-medium text-gray-500 dark:text-slate-400 leading-tight">
                {roleLabel}
              </span>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-1.5 shrink-0 text-gray-500 dark:text-slate-400">
            <TooltipProvider delayDuration={350}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    className="h-8 w-8 shrink-0 hover:bg-gray-100 dark:hover:bg-slate-800 text-gray-500 hover:text-gray-900 dark:text-slate-400 dark:hover:text-slate-100"
                    onClick={toggleTheme}
                    aria-label={
                      theme === "dark"
                        ? "Switch to light mode"
                        : "Switch to dark mode"
                    }
                  >
                    {theme === "dark" ? (
                      <Sun className="h-4 w-4" />
                    ) : (
                      <Moon className="h-4 w-4" />
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top">
                  {theme === "dark"
                    ? "Switch to light mode"
                    : "Switch to dark mode"}
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
                        className="h-8 w-8 shrink-0 hover:bg-gray-100 dark:hover:bg-slate-800 text-gray-500 hover:text-gray-900 dark:text-slate-400 dark:hover:text-slate-100"
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
                <DropdownMenuLabel className="font-semibold">
                  Settings
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={startTour}
                  className="flex items-center gap-2 cursor-pointer"
                >
                  <HelpCircle className="h-4 w-4" />
                  Show tour again
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={handleSignOut}
                  disabled={isSigningOut}
                  className="flex items-center gap-2 text-destructive focus:text-destructive cursor-pointer"
                >
                  <LogOut className="h-4 w-4" />
                  {isSigningOut ? "Signing out..." : "Sign out"}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Tour Trigger Button: secondary link placed neatly below profile row */}
        <button
          type="button"
          onClick={startTour}
          className="w-full flex items-center gap-2 text-xs text-gray-500 hover:text-purple-600 dark:text-slate-200 dark:hover:text-purple-400 transition-colors py-1.5"
        >
          <HelpCircle className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">Show {roleLabel} tour again</span>
        </button>
      </div>

      <TourComponent
        userId={userId}
        role={((role as UserRole) || "admin")}
        isOpen={tourOpen}
        onClose={closeTour}
        onComplete={completeTour}
      />
    </aside>
  );
}
