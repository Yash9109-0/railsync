"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { Bell, Loader2, Check } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Notification } from "@/lib/types";

interface NotificationBellProps {
  className?: string;
}

export function NotificationBell({ className }: NotificationBellProps) {
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [mounted, setMounted] = useState(false);

  const supabase = createClient();

  const fetchNotifications = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from("notifications")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(20);

      if (error) throw error;

      const notifs = (data ?? []) as Notification[];
      setNotifications(notifs);
      setUnreadCount(notifs.filter((n) => !n.read).length);
    } catch (err) {
      console.error("Failed to fetch notifications:", err);
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  const markAsRead = async (notificationId: string) => {
    const { error } = await supabase
      .from("notifications")
      .update({ read: true })
      .eq("id", notificationId);

    if (error) {
      console.error("Failed to mark notification as read:", error);
      return;
    }

    setNotifications((prev) =>
      prev.map((n) => (n.id === notificationId ? { ...n, read: true } : n))
    );
    setUnreadCount((prev) => Math.max(0, prev - 1));
  };

  const markAllAsRead = async () => {
    const unreadIds = notifications.filter((n) => !n.read).map((n) => n.id);
    if (unreadIds.length === 0) return;

    const { error } = await supabase
      .from("notifications")
      .update({ read: true })
      .in("id", unreadIds);

    if (error) {
      console.error("Failed to mark all notifications as read:", error);
      return;
    }

    setNotifications((prev) =>
      prev.map((n) => (n.read ? n : { ...n, read: true }))
    );
    setUnreadCount(0);
  };

  const handleNotificationClick = (notification: Notification) => {
    if (!notification.read) {
      markAsRead(notification.id);
    }
    if (notification.link) {
      window.location.href = notification.link;
    }
  };

  useEffect(() => {
    setMounted(true);
    fetchNotifications();

    const channel = supabase
      .channel("notifications-realtime")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "notifications",
        },
        (payload) => {
          if (payload.eventType === "INSERT") {
            const newNotif = payload.new as Notification;
            setNotifications((prev) => [newNotif, ...prev.slice(0, 19)]);
            if (!newNotif.read) {
              setUnreadCount((prev) => prev + 1);
            }
          } else if (payload.eventType === "UPDATE") {
            const updatedNotif = payload.new as Notification;
            setNotifications((prev) =>
              prev.map((n) => (n.id === updatedNotif.id ? updatedNotif : n))
            );
            const wasUnread = payload.old && !(payload.old as Notification).read;
            const nowRead = updatedNotif.read;
            if (wasUnread && nowRead) {
              setUnreadCount((prev) => Math.max(0, prev - 1));
            } else if (!wasUnread && !nowRead) {
              setUnreadCount((prev) => prev + 1);
            }
          } else if (payload.eventType === "DELETE") {
            const deletedId = (payload.old as Notification).id;
            setNotifications((prev) => prev.filter((n) => n.id !== deletedId));
            const wasUnread = !(payload.old as Notification).read;
            if (wasUnread) {
              setUnreadCount((prev) => Math.max(0, prev - 1));
            }
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, fetchNotifications]);

  if (!mounted) {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className={cn("relative", className)}>
            <Bell className="h-5 w-5" />
            <span className="absolute -top-1 -right-1 h-5 w-5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-80">
          <Loader2 className="h-5 w-5 animate-spin mx-auto py-4" />
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={cn("relative", className)}
          aria-label={`Notifications${unreadCount > 0 ? `, ${unreadCount} unread` : ""}`}
        >
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <span
              className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-destructive text-xs text-destructive-foreground font-medium"
              aria-live="polite"
              aria-atomic="true"
            >
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 max-h-[500px] overflow-y-auto p-0">
        <div className="p-3 border-b">
          <div className="flex items-center justify-between">
            <DropdownMenuLabel className="font-semibold">Notifications</DropdownMenuLabel>
            {unreadCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="text-xs h-auto px-2 py-0.5"
                onClick={markAllAsRead}
              >
                <Check className="h-3 w-3 mr-1" />
                Mark all as read
              </Button>
            )}
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : notifications.length === 0 ? (
          <div className="p-6 text-center text-muted-foreground">
            <Bell className="h-10 w-10 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No notifications yet</p>
          </div>
        ) : (
          <>
            {notifications.map((notification) => (
              <div
                key={notification.id}
                className={cn(
                  "flex items-start gap-3 px-3 py-3 hover:bg-accent cursor-pointer transition-colors border-l-4",
                  notification.read
                    ? "border-transparent"
                    : "border-purple-500 bg-purple-500/5",
                  "first:border-t-0"
                )}
                onClick={() => handleNotificationClick(notification)}
              >
                <div className="flex-1 min-w-0">
                  <p className={cn("font-medium text-sm", notification.read ? "text-foreground" : "text-foreground")}>
                    {notification.title}
                  </p>
                  {notification.body && (
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                      {notification.body}
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground mt-2">
                    {new Date(notification.created_at).toLocaleString(undefined, {
                      dateStyle: "short",
                      timeStyle: "short",
                    })}
                  </p>
                </div>
                {!notification.read && (
                  <div className="flex items-center justify-center w-5 h-5">
                    <span className="h-2 w-2 rounded-full bg-primary" />
                  </div>
                )}
              </div>
            ))}
            <DropdownMenuSeparator className="my-1" />
            <DropdownMenuItem
              className="text-center text-sm text-muted-foreground px-3 py-2"
              onClick={() => window.location.href = "/dashboard/notifications"}
              disabled={true}
            >
              View all notifications
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}