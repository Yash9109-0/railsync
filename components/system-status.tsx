"use client";

import { useEffect, useState } from "react";
import { ChevronDown, CheckCircle, AlertCircle, XCircle, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

interface HealthCheck {
  status: "operational" | "degraded" | "unreachable";
  latencyMs: number;
  error?: string;
  lastChecked: string;
}

interface HealthResponse {
  overall: "operational" | "degraded" | "unreachable";
  lastChecked: string;
  checks: Record<string, HealthCheck>;
}

const STATUS_COLORS = {
  operational: "text-success",
  degraded: "text-warning",
  unreachable: "text-destructive",
};

const STATUS_LABELS = {
  operational: "All systems operational",
  degraded: "Degraded",
  unreachable: "Model unreachable",
};

const STATUS_ICONS = {
  operational: CheckCircle,
  degraded: AlertCircle,
  unreachable: XCircle,
};

function formatTime(iso: string) {
  const date = new Date(iso);
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export function SystemStatus() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchHealth = async () => {
    try {
      const res = await fetch("/api/health", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        setHealth(data);
      }
    } catch {
      // ignore network errors, keep previous state
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHealth();
    const interval = setInterval(fetchHealth, 60_000);
    return () => clearInterval(interval);
  }, []);

  if (loading || !health) {
    return (
      <div className="flex items-center gap-2 px-3 py-2">
        <span className="h-2 w-2 rounded-full bg-gray-400 animate-pulse" />
        <span className="text-xs text-muted-foreground hidden md:inline-block">Checking...</span>
      </div>
    );
  }

  const overallColor = STATUS_COLORS[health.overall];
  const overallLabel = STATUS_LABELS[health.overall];
  const OverallIcon = STATUS_ICONS[health.overall];

  const checkEntries = Object.entries(health.checks);

  return (
    <div className="px-3 pb-3">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className={cn(
          "flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors",
          "hover:bg-accent",
          "focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
        )}
        aria-expanded={expanded}
        aria-label="System status"
      >
        <div className="flex items-center gap-2 shrink-0">
          <OverallIcon className={cn("h-3.5 w-3.5 flex-shrink-0", overallColor)} />
          <span className={cn("text-xs font-medium truncate hidden md:block", overallColor)}>
            {overallLabel}
          </span>
        </div>
        <ChevronDown
          className={cn(
            "h-3.5 w-3.5 flex-shrink-0 text-muted-foreground transition-transform",
            expanded && "rotate-180",
            "hidden md:block",
            collapsed && "md:hidden"
          )}
          aria-hidden="true"
        />
      </button>

      {expanded && (
        <div className="mt-2 space-y-2 border-t pt-2">
          {checkEntries.map(([name, check]) => {
            const CheckIcon = STATUS_ICONS[check.status];
            const color = STATUS_COLORS[check.status];
            const label = check.status.charAt(0).toUpperCase() + check.status.slice(1);
            return (
              <div
                key={name}
                className="flex items-center gap-2 text-xs"
                title={`${name}: ${label}${check.error ? ` - ${check.error}` : ""} (${check.latencyMs}ms)`}
              >
                <CheckIcon className={cn("h-3 w-3 flex-shrink-0", color)} />
                <span className="font-medium text-foreground hidden md:inline-block">{name}</span>
                <span className={cn("font-medium flex-1 truncate", color)}>{label}</span>
                <span className="text-muted-foreground hidden md:inline-block">
                  {formatTime(check.lastChecked)}
                </span>
              </div>
            );
          })}
          <button
            type="button"
            onClick={() => {
              setLoading(true);
              fetchHealth();
            }}
            disabled={loading}
            className="flex w-full items-center justify-center gap-2 text-xs text-muted-foreground hover:text-foreground"
          >
            <RefreshCw className={cn("h-3 w-3", loading && "animate-spin")} />
                Refresh
          </button>
        </div>
      )}
    </div>
  );
}