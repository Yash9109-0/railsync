"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
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
import { NAV_LINKS, type NavLink } from "@/lib/roles";
import { cn } from "@/lib/utils";
import {
  ChevronLeft,
  ChevronRight,
  LogOut,
  Moon,
  Sun,
  TrainFront,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { useTheme } from "@/components/theme-provider";

interface DashboardSidebarProps {
  role: string | null;
  fullName: string | null;
  userEmail: string | null;
}

const COLLAPSED_STORAGE_KEY = "rail-sync-sidebar-collapsed";

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

export function DashboardSidebar({
  role,
  fullName,
  userEmail,
}: DashboardSidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [isSigningOut, setIsSigningOut] = useState(false);

  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    const saved = localStorage.getItem(COLLAPSED_STORAGE_KEY);
    setCollapsed(saved === "true");
  }, []);
  useEffect(() => {
    localStorage.setItem(COLLAPSED_STORAGE_KEY, String(collapsed));
  }, [collapsed]);

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
              "text-xl font-bold whitespace-nowrap text-foreground",
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
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-primary-hover hover:text-foreground",
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

      <Separator className="mx-3" />

      <div className="flex items-center justify-between gap-3 px-3 py-4">
        <div className="flex min-w-0 items-center gap-3">
          <Avatar className="h-9 w-9 shrink-0">
            <AvatarFallback className="bg-primary text-primary-foreground font-semibold">
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

        <TooltipProvider delayDuration={350}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                className="shrink-0 hover:bg-primary-hover"
                onClick={handleSignOut}
                disabled={isSigningOut}
                aria-label="Sign out"
              >
                {isSigningOut ? (
                  <LogOut className="h-4 w-4 animate-pulse" />
                ) : (
                  <LogOut className="h-4 w-4" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top">Sign out</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
    </aside>
  );
}
