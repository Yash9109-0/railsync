"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useCorridor } from "@/context/CorridorContext";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { GlobeLock, MapPin, Clock } from "lucide-react";
import type { Corridor } from "@/lib/types";

function formatTime(date: Date): string {
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatDate(date: Date): string {
  return date.toLocaleDateString([], {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

interface DashboardTopBarProps {
  className?: string;
}

export function DashboardTopBar({ className }: DashboardTopBarProps) {
  const [corridors, setCorridors] = useState<Corridor[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentTime, setCurrentTime] = useState(new Date());
  const { selectedCorridorId, setSelectedCorridorId } = useCorridor();

  useEffect(() => {
    const fetchCorridors = async () => {
      setLoading(true);
      const supabase = createClient();
      const { data, error } = await supabase
        .from("corridors")
        .select("id, name")
        .order("name");

      if (error) {
        toast.error("Failed to load corridors", {
          description: error.message,
        });
        setCorridors([]);
      } else {
        setCorridors((data ?? []) as Corridor[]);
      }
      setLoading(false);
    };

    void fetchCorridors();
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(new Date());
    }, 60_000);
    return () => clearInterval(interval);
  }, []);

  const selectedName =
    corridors.find((c) => c.id === selectedCorridorId)?.name ?? null;

  return (
    <header
      className={cn(
        "sticky top-0 z-20 flex items-center justify-between gap-3 divider-gradient-primary bg-background/90 backdrop-blur",
        className,
      )}
    >
      <div className="page-container">
        <div className="flex h-14 items-center justify-between">
          <div className="flex items-center gap-3">
            <MapPin className="h-5 w-5 text-primary" />
            <div className="flex flex-col">
              <span className="text-sm font-semibold text-foreground">
                Corridor
              </span>
              {selectedName && (
                <span className="text-xs text-muted-foreground">
                  {selectedName}
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-muted/30 border border-border/50">
            <Clock className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
            <span className="text-xs font-mono text-muted-foreground whitespace-nowrap">
              {formatDate(currentTime)} · {formatTime(currentTime)}
            </span>
          </div>

          <div className="flex items-center gap-3">
            {loading ? (
              <Skeleton className="h-8 w-52 rounded-lg" />
            ) : (
              <Select
                value={selectedCorridorId == null ? "" : String(selectedCorridorId)}
                onValueChange={(value) =>
                  setSelectedCorridorId(
                    value === "" ? null : Number(value),
                  )
                }
                data-tour="corridor-switcher"
              >
                <SelectTrigger
                  size="default"
                  className={cn(
                    "w-64 min-w-56 rounded-lg border-primary/50 bg-background",
                    "focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary",
                    "hover:border-primary/60",
                  )}
                >
                  <SelectValue placeholder="Select a corridor" />
                </SelectTrigger>
                <SelectContent>
                  {corridors.length === 0 ? (
                    <span className="block px-2 py-4 text-sm text-muted-foreground">
                      No corridors available
                    </span>
                  ) : (
                      corridors.map((corridor) => (
                        <SelectItem
                          key={corridor.id}
                          value={String(corridor.id)}
                          textValue={corridor.name}
                          className="data-[selected=true]:bg-primary/5 data-[selected=true]:text-primary"
                      >
                        <div className="flex items-center justify-between w-full">
                          <span>{corridor.name}</span>
                          {corridor.id === selectedCorridorId && (
                            <GlobeLock className="h-3.5 w-3.5 text-primary" />
                          )}
                        </div>
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
