"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useCorridor } from "@/context/CorridorContext";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Progress,
  Separator,
  Skeleton,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui";
import {
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  LabelList,
  Label,
} from "recharts";
import {
  Building2,
  Check,
  CheckCircle,
  Clock,
  Edit,
  Gauge,
  Lightbulb,
  Loader2,
  RefreshCw,
  Sparkles,
  ArrowRight,
  TrainFront,
  TrendingDown,
  TrendingUp,
  AlertCircle,
  AlertTriangle,
  Route,
  Train,
  FileText,
  Package,
} from "lucide-react";
import LiveTrackMap from "@/components/LiveTrackMap";
import { LIVE_TRAIN_DATASET } from "@/components/MapPreview";
import { getSegmentDisplayName } from "@/lib/corridors";
import CorridorAvailability from "@/components/CorridorAvailability";
import HorizonPlanReview from "@/components/HorizonPlanReview";
import type {
  ApprovalDecision,
  BlockPlanOption,
  BlockRequestStatus,
  BlockRequestWorkType,
  Department,
  SafetyCriticality,
  TimetableStatus,
} from "@/lib/types";
import type { User } from "@supabase/supabase-js";

type PlanOptionWithLabel = BlockPlanOption & {
  option_label?: string | null;
  is_recommended?: boolean | null;
};

interface SegmentName {
  name: string;
}
interface TimetableRow {
  id: number;
  train_number: string;
  segment_id: number | null;
  scheduled_time: string;
  status: TimetableStatus;
  segments: SegmentName | null;
}
interface BlockRequestRow {
  id: string;
  segment_id: number | null;
  requested_start: string;
  requested_duration_mins: number;
  safety_criticality: SafetyCriticality;
  work_type: BlockRequestWorkType;
  status: BlockRequestStatus;
  priority_score: number | null;
  delay_risk: string | null;
  ai_explanation: string | null;
  department: Department | null;
  created_at: string;
  segments: SegmentName | null;
  block_plan_options: PlanOptionWithLabel[] | null;
}
interface ApprovalRow {
  id: string;
  block_request_id: string | null;
  officer_id: string | null;
  decision: ApprovalDecision | null;
  modified_start: string | null;
  modified_duration_mins: number | null;
  decided_at: string;
  block_requests: { created_at: string } | null;
}

interface VerifyLogRow {
  id: string;
  block_request_id: string | null;
  before_image_url: string | null;
  after_image_url: string | null;
  actual_start: string | null;
  actual_end: string | null;
  geo_lat: number | null;
  geo_lng: number | null;
  created_at: string;
  status: string | null;
  verified: boolean | null;
  work_done_notes?: string | null;
  block_requests: {
    work_description: string | null;
    work_type: BlockRequestWorkType;
    requested_duration_mins: number | null;
    segment_id?: number | null;
    segments: { name: string; corridor_id?: number } | null;
  } | null;
}
const POLL_INTERVAL_MS = 30_000;
const MANUAL_BASELINE_MINS = 18;



function statusVariant(
  status: TimetableStatus,
): "default" | "secondary" | "destructive" | "outline" | "ghost" | "link" {
  switch (status) {
    case "in_progress":
      return "secondary";
    case "completed":
      return "default";
    case "delayed":
    case "cancelled":
      return "destructive";
    default:
      return "outline";
  }
}

function statusLabel(status: TimetableStatus) {
  return status.charAt(0).toUpperCase() + status.slice(1).replace("_", " ");
}

function fmtDateTime(iso: string) {
  if (!iso) return "-";
  return new Date(iso)
    .toLocaleString("en-US", {
      dateStyle: "medium",
      timeStyle: "short",
    })
    .toLowerCase(); // <-- ye add kar diya, ab dono jagah 'pm' hi aayega
}

function fmtDateTimeLocal(iso: string) {
  return new Date(iso).toISOString().slice(0, 16);
}

function fmtDuration(mins: number) {
  if (!isFinite(mins) || mins <= 0) return "—";
  if (mins < 1) return `${Math.round(mins)} min`;
  const h = Math.floor(mins / 60);
  const m = Math.round(mins % 60);
  return h > 0 ? `${h}h ${m}m` : `${m} min`;
}

function humanizeMs(ms: number) {
  if (!isFinite(ms) || ms <= 0) return "—";
  const secs = Math.round(ms / 1000);
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return m > 0 ? `${m} min ${s}s` : `${s} sec`;
}

function priorityLabel(score: number | null) {
  if (score === null) return "—";
  if (score >= 8) return "High";
  if (score >= 5) return "Medium";
  return "Low";
}

function priorityBadge(score: number | null) {
  if (score === null) return "outline" as const;
  if (score >= 8) return "destructive" as const;
  if (score >= 5) return "default" as const;
  return "secondary" as const;
}

function delayRiskKey(
  risk: string | null,
): "low" | "medium" | "high" | "critical" | "none" {
  if (!risk) return "none";
  const r = risk.toLowerCase().trim();
  if (r.includes("low") || r.includes("minor") || r === "l") return "low";
  if (r.includes("medium") || r.includes("moderate") || r === "m")
    return "medium";
  if (r.includes("critical") || r.includes("severe")) return "critical";
  if (r.includes("high") || r.includes("major") || r === "h") return "high";
  return "none";
}

function delayRiskLabel(risk: string | null): string {
  if (!risk) return "Unknown";
  return risk.charAt(0).toUpperCase() + risk.slice(1);
}

const WORK_TYPE_LABEL: Record<string, string> = {
  track: "Track",
  signal: "Signal",
  electrical: "Electrical",
  other: "Other",
};

function workTypeLabel(workType: BlockRequestWorkType): string {
  return WORK_TYPE_LABEL[workType] ?? workType;
}

function fmtVarianceMins(mins: number): string {
  if (mins === 0) return "0 min (on schedule)";
  const abs = Math.abs(mins);
  if (mins > 0) return `+${abs} min over planned`;
  return `${abs} min under planned`;
}

function computeActualDurationMins(log: VerifyLogRow): number | null {
  if (!log.actual_start || !log.actual_end) return null;
  const start = new Date(log.actual_start).getTime();
  let end = new Date(log.actual_end).getTime();
  if (isNaN(start) || isNaN(end)) return null;

  // Handle data anomaly where end date preceded start date
  if (end < start) {
    const startDate = new Date(log.actual_start);
    const endDate = new Date(log.actual_end);
    endDate.setFullYear(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
    if (endDate.getTime() >= start) {
      end = endDate.getTime();
    } else {
      end = start + Math.abs(end - start);
    }
  }

  const durationMs = Math.max(0, end - start);
  return Math.round(durationMs / 60000);
}

function computeVarianceMins(log: VerifyLogRow): number | null {
  const actualMins = computeActualDurationMins(log);
  if (actualMins == null) return null;
  const requested = log.block_requests?.requested_duration_mins ?? null;
  if (requested == null) return null;
  return actualMins - requested;
}

const DELAY_RISK_BADGE: Record<
  NonNullable<ReturnType<typeof delayRiskKey>>,
  {
    variant:
      "default" | "secondary" | "destructive" | "outline" | "ghost" | "link";
    label: string;
  }
> = {
  low: { variant: "default", label: "Low" },
  medium: { variant: "secondary", label: "Medium" },
  high: { variant: "destructive", label: "High" },
  critical: { variant: "destructive", label: "Critical" },
  none: { variant: "outline", label: "Unknown" },
};

interface StatCardProps {
  title: string;
  value: string;
  icon: React.ReactNode;
  desc?: string;
}

function StatCard({ title, value, icon, desc }: StatCardProps) {
  const numericValue = Number(value.replace(/[^0-9.-]/g, "")) || 0
  const [displayValue, setDisplayValue] = useState(0)
  const [hasAnimated, setHasAnimated] = useState(false)

  useEffect(() => {
    if (hasAnimated) {
      setDisplayValue(numericValue)
      return
    }
    const duration = 600
    const startTime = performance.now()
    const animate = (now: number) => {
      const progress = Math.min((now - startTime) / duration, 1)
      const eased = 1 - Math.pow(1 - progress, 3)
      setDisplayValue(Math.round(numericValue * eased))
      if (progress < 1) {
        requestAnimationFrame(animate)
      } else {
        setHasAnimated(true)
      }
    }
    requestAnimationFrame(animate)
  }, [numericValue, hasAnimated])

  const formattedValue = Number.isInteger(numericValue)
    ? displayValue.toLocaleString()
    : displayValue.toFixed(2)

  return (
    <Card className="transition-shadow duration-base hover:shadow-md bg-gradient-card">
      <CardContent className="py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            {icon}
          </div>
          <span className="text-2xl font-bold tabular-nums font-heading">{formattedValue}</span>
        </div>
        <p className="mt-1.5 text-sm text-muted-foreground">{title}</p>
        {desc ? <p className="mt-0.5 text-xs text-muted-foreground">{desc}</p> : null}
      </CardContent>
    </Card>
  );
}

interface CorridorSnapshotProps {
  selectedCorridorId: number | null;
}

function CorridorSnapshot({ selectedCorridorId }: CorridorSnapshotProps) {
  const [activeSegments, setActiveSegments] = useState(0);
  const [trainsToday, setTrainsToday] = useState(0);
  const [pendingPlans, setPendingPlans] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (selectedCorridorId == null) {
        if (!cancelled) {
          setActiveSegments(0);
          setTrainsToday(0);
          setPendingPlans(0);
          setLoading(false);
        }
        return;
      }

      const supabase = createClient();

      try {
        // 1. Active segments count for this corridor
        const { count: segmentsCount } = await supabase
          .from("segments")
          .select("*", { count: "exact", head: true })
          .eq("corridor_id", selectedCorridorId);
        if (!cancelled) setActiveSegments(segmentsCount ?? 0);

        // 2. Trains scheduled today for this corridor's segments
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        const todayEnd = new Date();
        todayEnd.setHours(23, 59, 59, 999);

        const { data: segmentIds } = await supabase
          .from("segments")
          .select("id")
          .eq("corridor_id", selectedCorridorId);
        const corridorSegmentIds = (segmentIds ?? []).map((s) => s.id);

        if (corridorSegmentIds.length > 0) {
          const { count: trainsCount } = await supabase
            .from("timetable")
            .select("*", { count: "exact", head: true })
            .in("segment_id", corridorSegmentIds)
            .gte("scheduled_time", todayStart.toISOString())
            .lte("scheduled_time", todayEnd.toISOString());
          if (!cancelled) setTrainsToday(trainsCount ?? 0);
        } else if (!cancelled) {
          setTrainsToday(0);
        }

        // 3. Pending plans (scored block requests) for this corridor
        if (corridorSegmentIds.length > 0) {
          const { count: pendingCount } = await supabase
            .from("block_requests")
            .select("*", { count: "exact", head: true })
            .eq("status", "scored")
            .in("segment_id", corridorSegmentIds);
          if (!cancelled) setPendingPlans(pendingCount ?? 0);
        } else if (!cancelled) {
          setPendingPlans(0);
        }
      } catch {
        if (!cancelled) {
          setActiveSegments(0);
          setTrainsToday(0);
          setPendingPlans(0);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [selectedCorridorId]);

  if (selectedCorridorId == null) {
    return (
      <Card className="bg-gradient-card border-dashed">
        <CardContent className="py-3 px-4 text-center text-sm text-muted-foreground">
          Select a corridor to see the snapshot.
        </CardContent>
      </Card>
    );
  }

  const statItems = [
    {
      label: "Active Segments",
      value: String(activeSegments),
      icon: <Route className="h-4 w-4 text-primary" />,
    },
    {
      label: "Trains Today",
      value: String(trainsToday),
      icon: <Train className="h-4 w-4 text-primary" />,
    },
    {
      label: "Pending Plans",
      value: String(pendingPlans),
      icon: <FileText className="h-4 w-4 text-primary" />,
    },
  ];

  return (
    <Card className="bg-gradient-card">
      <CardContent className="py-3">
        <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground mb-3">
          <span className="font-medium text-sm">Corridor Snapshot</span>
          {loading && <Loader2 className="h-3 w-3 animate-spin" />}
        </div>
        <div className="grid grid-cols-3 gap-3 sm:gap-4">
          {statItems.map((item) => (
            <div
              key={item.label}
              className="flex flex-col items-start gap-1.5 p-3 rounded-lg bg-card border border-border/50 hover:bg-muted/30 transition-colors"
            >
              <div className="flex-shrink-0">{item.icon}</div>
              <div className="min-w-0">
                <p className="text-lg font-bold tabular-nums font-heading leading-tight">{loading ? "—" : item.value}</p>
                <p className="text-xs text-muted-foreground truncate">{item.label}</p>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

interface AnalyticsSummary {
  estimated_passenger_delay_reduction_mins: number;
  track_asset_availability_gain_pct: number;
  total_approved: number;
  total_time_saved_mins: number;
  avg_priority_score: number;
}



interface ApprovedPlanRow {
  id: string;
  segment_id: number | null;
  requested_duration_mins: number | null;
  delay_risk: string | null;
  segments: { name: string } | null;
  block_plan_options: PlanOptionWithLabel[] | null;
}

interface ChartSeries {
  key: string;
  saved: number;
}

const OVERVIEW_DEPARTMENTS: Department[] = ["TMS", "TDMS", "SMMS"];

const DEPARTMENT_BAR_CLS: Record<Department, string> = {
  TMS: "bg-primary",
  TDMS: "bg-success",
  SMMS: "bg-warning",
};

interface DepartmentOverviewProps {
  counts: Record<Department, number>;
  loading: boolean;
}

function DepartmentOverview({ counts, loading }: DepartmentOverviewProps) {
  const total = OVERVIEW_DEPARTMENTS.reduce(
    (sum, dept) => sum + counts[dept],
    0,
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Building2 className="h-5 w-5 text-primary" />
          Department Overview
        </CardTitle>
        <CardDescription>
          Scored requests awaiting approval, grouped by owning department
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {loading ? (
          OVERVIEW_DEPARTMENTS.map((dept) => (
            <div key={dept} className="space-y-1">
              <Skeleton className="h-3 w-28" />
              <Skeleton className="h-2 w-full" />
            </div>
          ))
        ) : total === 0 ? (
          <p className="text-sm text-muted-foreground">
            No scored requests for this corridor yet.
          </p>
        ) : (
          OVERVIEW_DEPARTMENTS.map((dept) => {
            const count = counts[dept];
            const pct = Math.round((count / total) * 100);
            return (
              <div key={dept} className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium">{dept}</span>
                  <span className="text-muted-foreground">
                    {count} {count === 1 ? "request" : "requests"}
                  </span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className={cn(
                      "h-full rounded-full",
                      DEPARTMENT_BAR_CLS[dept],
                    )}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}

interface InsightRequestRow {
  status: BlockRequestStatus;
  work_type: BlockRequestWorkType;
  safety_criticality: SafetyCriticality;
  created_at: string;
  segments: SegmentName | null;
}

interface QuickInsight {
  icon: "lightbulb" | "trending";
  text: string;
}

// Statuses that mean a request is still awaiting action (AI scoring or
// officer approval) rather than being closed out.
const PENDING_INSIGHT_STATUSES: BlockRequestStatus[] = [
  "submitted",
  "pending",
  "scored",
];

// Trailing window used for the "this week" safety-critical observation.
const INSIGHT_WEEK_MS = 7 * 24 * 60 * 60 * 1000;

function computeQuickInsights(rows: InsightRequestRow[]): QuickInsight[] {
  const insights: QuickInsight[] = [];

  const pendingRows = rows.filter((r) =>
    PENDING_INSIGHT_STATUSES.includes(r.status),
  );

  // Observation 1: which segment carries the most pending work.
  if (pendingRows.length > 0) {
    const bySegment = new Map<string, number>();
    for (const row of pendingRows) {
      const segmentName = row.segments?.name;
      if (!segmentName) continue;
      bySegment.set(segmentName, (bySegment.get(segmentName) ?? 0) + 1);
    }
    const topSegment = Array.from(bySegment.entries()).sort(
      (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
    )[0];
    if (topSegment) {
      insights.push({
        icon: "lightbulb",
        text: `Segment ${topSegment[0]} has the most pending requests (${topSegment[1]} of ${pendingRows.length}).`,
      });
    }
  } else {
    insights.push({
      icon: "lightbulb",
      text: "No pending requests right now — the approval queue is clear.",
    });
  }

  // Observation 2: safety-critical share of requests created this week
  // (trailing 7 days).
  const weekAgoMs = Date.now() - INSIGHT_WEEK_MS;
  const weekRows = rows.filter((r) => {
    const parsed = Date.parse(r.created_at);
    return !Number.isNaN(parsed) && parsed >= weekAgoMs;
  });
  if (weekRows.length > 0) {
    const criticalCount = weekRows.filter(
      (r) => r.safety_criticality === "safety_critical",
    ).length;
    const pct = Math.round((criticalCount / weekRows.length) * 100);
    insights.push({
      icon: "trending",
      text: `${pct}% of requests this week are safety-critical (${criticalCount} of ${weekRows.length}).`,
    });
  } else {
    insights.push({
      icon: "trending",
      text: "No new block requests were created in the last 7 days.",
    });
  }

  // Observation 3: which work type dominates the pending queue.
  if (pendingRows.length > 0) {
    const byWork = new Map<string, number>();
    for (const row of pendingRows) {
      const key = row.work_type ?? "other";
      byWork.set(key, (byWork.get(key) ?? 0) + 1);
    }
    const topWork = Array.from(byWork.entries()).sort(
      (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
    )[0];
    if (topWork) {
      const pct = Math.round((topWork[1] / pendingRows.length) * 100);
      insights.push({
        icon: "lightbulb",
        text: `${workTypeLabel(topWork[0] as BlockRequestWorkType)} work accounts for ${pct}% of pending requests.`,
      });
    }
  }

  // 2-3 lines: the two always-present observations plus the work-type one.
  return insights.slice(0, 3);
}

function QuickInsightsCard({
  insights,
  loading,
}: {
  insights: QuickInsight[];
  loading: boolean;
}) {
  return (
    <Card className="transition-shadow duration-base hover:shadow-md bg-gradient-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Lightbulb className="h-5 w-5 text-primary" />
          Quick Insights
        </CardTitle>
        <CardDescription>
          Auto-generated observations from current block request data.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {loading ? (
          <>
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-5/6" />
            <Skeleton className="h-4 w-2/3" />
          </>
        ) : insights.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Not enough activity yet to generate insights.
          </p>
        ) : (
          insights.map((insight) => (
            <div key={insight.text} className="flex items-start gap-2.5 text-sm">
              {insight.icon === "trending" ? (
                <TrendingUp className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              ) : (
                <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              )}
              <span className="leading-snug text-muted-foreground">
                {insight.text}
              </span>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}

function analyticsBaselineOption(
  options: PlanOptionWithLabel[] | null,
): PlanOptionWithLabel | undefined {
  const opts = options ?? [];
  return (
    opts.find((o) =>
      (o.option_label ?? "").toLowerCase().includes("as requested"),
    ) ??
    opts.find((o) =>
      (o.option_label ?? "").toLowerCase().includes("option a"),
    ) ??
    opts[0]
  );
}

interface TimeSavedAnalyticsProps {
  approvedCount: number;
  avgMs: number;
  sessionStart: number;
  selectedCorridorId: number | null;
}

function TimeSavedAnalytics({
  approvedCount,
  avgMs,
  sessionStart,
  selectedCorridorId,
}: TimeSavedAnalyticsProps) {
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [segmentSeries, setSegmentSeries] = useState<ChartSeries[]>([]);
  const [riskSeries, setRiskSeries] = useState<ChartSeries[]>([]);
  const [quickInsights, setQuickInsights] = useState<QuickInsight[]>([]);
  const [loading, setLoading] = useState(true);
  const [corridorName, setCorridorName] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadCorridorName() {
      if (selectedCorridorId == null) {
        if (!cancelled) setCorridorName(null);
        return;
      }
      const supabase = createClient();
      const { data, error } = await supabase
        .from("corridors")
        .select("name")
        .eq("id", selectedCorridorId)
        .maybeSingle();
      if (!cancelled && !error) {
        setCorridorName((data as { name: string } | null)?.name ?? null);
      }
    }

    async function load() {
      setLoading(true);

      // 4 stat cards: aggregates from the analytics endpoint, scoped to the
      // currently selected corridor when one is chosen.
      try {
        const url =
          selectedCorridorId != null
            ? `/api/analytics?corridor_id=${selectedCorridorId}`
            : "/api/analytics";
        const res = await fetch(url);
        if (res.ok) {
          const json: AnalyticsSummary = await res.json();
          if (!cancelled) setSummary(json);
        } else if (!cancelled) {
          setSummary(null);
        }
      } catch {
        if (!cancelled) setSummary(null);
      }

      // Breakdown series: approved plans joined with segment + Option A baseline
      const supabase = createClient();

      let segmentQuery = supabase
        .from("segments")
        .select("id, name")
        .order("id");
      if (selectedCorridorId != null) {
        segmentQuery = segmentQuery.eq("corridor_id", selectedCorridorId);
      }
      const { data: segmentRows, error: segmentError } = await segmentQuery;

      if (segmentError) {
        if (!cancelled) {
          setSegmentSeries([]);
          setRiskSeries([]);
          setQuickInsights([]);
          setLoading(false);
        }
        return;
      }

      const corridorSegmentIds = (segmentRows ?? []).map((s) => s.id);
      if (selectedCorridorId != null && corridorSegmentIds.length === 0) {
        if (!cancelled) {
          setSegmentSeries([]);
          setRiskSeries([]);
          setQuickInsights([]);
          setLoading(false);
        }
        return;
      }

      // Quick Insights: pending + recently created requests, scoped to the
      // corridor, used to auto-generate observation lines.
      try {
        let insightQuery = supabase
          .from("block_requests")
          .select("status, work_type, safety_criticality, created_at, segments(name)");
        if (selectedCorridorId != null && corridorSegmentIds.length > 0) {
          insightQuery = insightQuery.in("segment_id", corridorSegmentIds);
        }
        const { data: insightRows } = await insightQuery;
        if (!cancelled) {
          setQuickInsights(
            computeQuickInsights(
              (insightRows as InsightRequestRow[] | null) ?? [],
            ),
          );
        }
      } catch {
        if (!cancelled) setQuickInsights([]);
      }

      let query = supabase
        .from("block_requests")
        .select("*, segments!inner(name), block_plan_options(*)")
        .eq("status", "approved");

      if (selectedCorridorId != null && corridorSegmentIds.length > 0) {
        query = query.in("segment_id", corridorSegmentIds);
      }

      const { data, error: fetchError } = await query;
      void fetchError;

      if (!cancelled) {
        const plans = (data as ApprovedPlanRow[] | null) ?? [];

        if (plans.length === 0) {
          setSegmentSeries([]);
          setRiskSeries([]);
        } else {
          // Pre-populate all expected segments for the corridor/system with 0
          const expectedSegments = (segmentRows ?? []).map((s) => s.name);
          const bySegment = new Map<string, number>();
          for (const segName of expectedSegments) {
            bySegment.set(segName, 0);
          }

          // Pre-populate all expected delay risk tiers with 0
          const EXPECTED_RISK_TIERS = ["Low", "Medium", "High"];
          const byRisk = new Map<string, number>();
          for (const tier of EXPECTED_RISK_TIERS) {
            byRisk.set(tier, 0);
          }

          for (const req of plans) {
            // Exclude block_requests where the segment join doesn't resolve to a real segment
            if (!req.segments?.name) continue;

            const baseline = analyticsBaselineOption(req.block_plan_options);
            if (!baseline || baseline.adjusted_duration_mins == null) continue;
            const approvedDuration = Number(req.requested_duration_mins ?? 0);
            const saved =
              Number(baseline.adjusted_duration_mins) - approvedDuration;

            const segmentName = req.segments.name;
            bySegment.set(segmentName, (bySegment.get(segmentName) ?? 0) + saved);

            const rawRisk = req.delay_risk?.trim();
            const riskName = rawRisk
              ? rawRisk.charAt(0).toUpperCase() + rawRisk.slice(1).toLowerCase()
              : null;
            if (riskName) {
              byRisk.set(riskName, (byRisk.get(riskName) ?? 0) + saved);
            }
          }

          const toSeries = (
            map: Map<string, number>,
            tieBreaker?: (a: string, b: string) => number,
          ): ChartSeries[] =>
            Array.from(map, ([key, saved]) => ({ key, saved })).sort(
              (a, b) =>
                b.saved - a.saved ||
                (tieBreaker
                  ? tieBreaker(a.key, b.key)
                  : a.key.localeCompare(b.key)),
            );

          const RISK_ORDER: Record<string, number> = {
            Low: 1,
            Medium: 2,
            High: 3,
            Critical: 4,
          };

          setSegmentSeries(toSeries(bySegment));
          setRiskSeries(
            toSeries(
              byRisk,
              (a, b) => (RISK_ORDER[a] ?? 99) - (RISK_ORDER[b] ?? 99),
            ),
          );
        }
      }

      if (!cancelled) setLoading(false);
    }

    void loadCorridorName();
    void load();
    return () => {
      cancelled = true;
    };
  }, [selectedCorridorId]);

  const avgMins = avgMs > 0 ? Number((avgMs / 60000).toFixed(2)) : 0;
  const isBenchmark = approvedCount === 0 || avgMins === 0;
  const effectiveAiMins = isBenchmark ? 1.8 : avgMins;
  const chartData = [
    {
      metric: "AI-Assisted",
      minutes: effectiveAiMins,
      fill: "#10b981",
    },
    {
      metric: "Manual Baseline",
      minutes: MANUAL_BASELINE_MINS,
      fill: "#94a3b8",
    },
  ];

  const fmtNumber = (n: number) =>
    Number.isInteger(n) ? String(n) : n.toFixed(2);
  const fmtPct = (n: number) =>
    Number.isInteger(n) ? `${n}%` : `${n.toFixed(2)}%`;
  const fmtMins = (n: number) => `${fmtNumber(n)} min`;

  const chartDomain = (series: ChartSeries[]) => [
    0,
    Math.max(1, ...series.map((s) => s.saved)) + 5,
  ];

  const corridorSubtitle =
    selectedCorridorId != null && corridorName != null
      ? `Showing: Corridor ${selectedCorridorId} - ${corridorName}`
      : selectedCorridorId != null
        ? `Showing: Corridor ${selectedCorridorId}`
        : "Showing: All corridors";

  return (
    <section className="mt-6 space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Time Saved Analytics
          </CardTitle>
          <CardDescription>
            Track-time savings from approved block requests. Aggregates are
            served by /api/analytics against the as-requested Option A baseline;
            breakdown charts are estimated from per-request Option A baselines.
          </CardDescription>
          <CardDescription className="text-xs text-muted-foreground/80">
            {corridorSubtitle}
          </CardDescription>
        </CardHeader>
      </Card>

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            title="Total Time Saved"
            value={summary ? fmtMins(summary.total_time_saved_mins) : ""}
            icon={<Clock className="h-5 w-5 text-primary" />}
          />
          <StatCard
            title="Track Asset Availability Gain"
            value={
              summary ? fmtPct(summary.track_asset_availability_gain_pct) : ""
            }
            icon={<TrendingUp className="h-5 w-5 text-primary" />}
          />
          <StatCard
            title="Total Plans Approved"
            value={summary ? String(summary.total_approved) : ""}
            icon={<CheckCircle className="h-5 w-5 text-primary" />}
          />
          <StatCard
            title="Avg Priority Score"
            value={summary ? fmtNumber(summary.avg_priority_score) : ""}
            icon={<Gauge className="h-5 w-5 text-primary" />}
          />
        </div>
      )}

      <QuickInsightsCard insights={quickInsights} loading={loading} />

      <Card>
        <CardHeader>
          <CardTitle>Time Saved by Segment</CardTitle>
          <CardDescription>
            Aggregate track time recovered per segment.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {segmentSeries.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No segment breakdown available for approved plans yet.
            </p>
          ) : (
            <div className="h-[280px] w-full">
              <ResponsiveContainer>
                <BarChart
                  data={segmentSeries}
                  margin={{ top: 12, right: 16, left: 60, bottom: 0 }}
                >
                  <defs>
                    <linearGradient
                      id="timeSavedSegmentGradient"
                      x1="0"
                      y1="0"
                      x2="0"
                      y2="1"
                    >
                      <stop offset="0%" stopColor="hsl(var(--primary))" />
                      <stop offset="100%" stopColor="hsl(var(--primary) / 0.7)" />
                    </linearGradient>
                  </defs>
<CartesianGrid
                    strokeDasharray="3 3"
                    vertical={false}
                    stroke="hsl(var(--border-subtle))"
                    strokeOpacity={0.6}
                  />
                  <XAxis
                    dataKey="key"
                    tickLine={false}
                    axisLine={false}
                    tickMargin={10}
                    minTickGap={6}
                    angle={-35}
                    textAnchor="end"
                    height={60}
                    tick={{
                      fontSize: 11,
                      fill: "hsl(var(--muted-foreground))",
                    }}
                  />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    tickMargin={8}
                    tick={{
                      fontSize: 11,
                      fill: "hsl(var(--muted-foreground))",
                    }}
                    tickFormatter={(v) => `${v} min`}
                    domain={chartDomain(segmentSeries)}
                  >
                    <Label
                      angle={-90}
                      position="insideLeft"
                      offset={10}
                      style={{ textAnchor: "middle" }}
                      className="fill-muted-foreground text-xs"
                    >
                      Time saved (min)
                    </Label>
                  </YAxis>
                  <Tooltip
                    cursor={{ fill: "hsl(var(--primary) / 0.06)" }}
                    contentStyle={{
                      backgroundColor: "hsl(var(--card))",
                      color: "hsl(var(--card-foreground))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "8px",
                      boxShadow:
                        "0 4px 12px -2px rgba(0, 0, 0, 0.08), 0 2px 6px -2px rgba(0, 0, 0, 0.04)",
                      padding: "8px 12px",
                      fontSize: "12px",
                    }}
                    itemStyle={{ color: "hsl(var(--card-foreground))", fontWeight: 500 }}
                    labelStyle={{
                      color: "hsl(var(--muted-foreground))",
                      fontWeight: 600,
                      marginBottom: "2px",
                    }}
                    formatter={(v) => [
                      `${Number(v ?? 0).toFixed(1)} min`,
                      "Time saved",
                    ]}
                  />
                  <Bar
                    dataKey="saved"
                    name="Time saved (min)"
                    fill="url(#chart-gradient-primary-vertical)"
                    radius={[6, 6, 0, 0]}
                    animationDuration={600}
                  >
                    <LabelList
                      position="top"
                      offset={4}
                      formatter={(v) =>
                        Number(v ?? 0) > 0
                          ? `${Number(v).toFixed(1)} min`
                          : ""
                      }
                    />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Time Saved by Delay Risk</CardTitle>
          <CardDescription>
            Track time recovered grouped by the request's delay risk tier.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {riskSeries.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No delay-risk breakdown available for approved plans yet.
            </p>
          ) : (
            <div className="h-[280px] w-full">
              <ResponsiveContainer>
                <BarChart
                  data={riskSeries}
                  margin={{ top: 12, right: 16, left: 60, bottom: 0 }}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    vertical={false}
                    stroke="hsl(var(--border-subtle))"
                    strokeOpacity={0.6}
                  />
                  <XAxis
                    dataKey="key"
                    tickLine={false}
                    axisLine={false}
                    tickMargin={10}
                    minTickGap={6}
                    angle={-35}
                    textAnchor="end"
                    height={60}
                    tick={{
                      fontSize: 11,
                      fill: "hsl(var(--muted-foreground))",
                    }}
                  />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    tickMargin={8}
                    tick={{
                      fontSize: 11,
                      fill: "hsl(var(--muted-foreground))",
                    }}
                    tickFormatter={(v) => `${v} min`}
                    domain={chartDomain(riskSeries)}
                  >
                    <Label
                      angle={-90}
                      position="insideLeft"
                      offset={10}
                      style={{ textAnchor: "middle" }}
                      className="fill-muted-foreground text-xs"
                    >
                      Time saved (min)
                    </Label>
                  </YAxis>
                  <Tooltip
                    cursor={{ fill: "hsl(var(--primary) / 0.06)" }}
                    contentStyle={{
                      backgroundColor: "hsl(var(--card))",
                      color: "hsl(var(--card-foreground))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "8px",
                      boxShadow:
                        "0 4px 12px -2px rgba(0, 0, 0, 0.08), 0 2px 6px -2px rgba(0, 0, 0, 0.04)",
                      padding: "8px 12px",
                      fontSize: "12px",
                    }}
                    itemStyle={{ color: "hsl(var(--card-foreground))", fontWeight: 500 }}
                    labelStyle={{
                      color: "hsl(var(--muted-foreground))",
                      fontWeight: 600,
                      marginBottom: "2px",
                    }}
                    formatter={(v) => [
                      `${Number(v ?? 0).toFixed(1)} min`,
                      "Time saved",
                    ]}
                  />
                  <Bar
                    dataKey="saved"
                    name="Time saved (min)"
                    fill="url(#chart-gradient-primary-vertical)"
                    radius={[6, 6, 0, 0]}
                    animationDuration={600}
                  >
                    <LabelList
                      position="top"
                      offset={4}
                      formatter={(v) =>
                        Number(v ?? 0) > 0
                          ? `${Number(v).toFixed(1)} min`
                          : ""
                      }
                    />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="flex items-center gap-2">
              <Check className="h-5 w-5 text-primary" />
              <span>Approval Processing Time</span>
              {isBenchmark && (
                <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-800">
                  Initial Benchmark
                </span>
              )}
            </CardTitle>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/80 dark:text-emerald-300 dark:border-emerald-800 shadow-sm">
              <span>⚡ 90% Faster than manual workflow</span>
            </span>
          </div>
          <CardDescription>
            Comparison of AI-automated sanction throughput against standard Indian Railways manual procedure (SECR baseline).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-5 py-2">
            {/* AI-Assisted Row */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-sm font-semibold">
                <span className="flex items-center gap-2 text-slate-800 dark:text-slate-200">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse shrink-0" />
                  AI-Assisted Throughput
                  {isBenchmark && (
                    <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-800 ml-1">
                      Benchmark
                    </span>
                  )}
                </span>
                <span className="text-emerald-600 dark:text-emerald-400 font-bold tabular-nums">
                  {effectiveAiMins.toFixed(1)} min
                </span>
              </div>
              <div className="w-full h-3 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-400 transition-all duration-700"
                  style={{ width: `${Math.max(2, (effectiveAiMins / MANUAL_BASELINE_MINS) * 100).toFixed(1)}%` }}
                />
              </div>
              <p className="text-[11px] text-muted-foreground">
                {isBenchmark
                  ? "No approvals yet this session — showing initial benchmark value."
                  : `Average across ${approvedCount} approval${approvedCount !== 1 ? "s" : ""} this session.`}
              </p>
            </div>

            {/* Divider */}
            <div className="border-t border-slate-100 dark:border-slate-800" />

            {/* Manual Baseline Row */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-sm font-medium text-slate-500 dark:text-slate-400">
                <span>Manual Sanction (SECR Baseline)</span>
                <span className="font-semibold text-slate-700 dark:text-slate-300 tabular-nums">
                  {MANUAL_BASELINE_MINS.toFixed(1)} min
                </span>
              </div>
              <div className="w-full h-3 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                <div
                  className="h-full rounded-full bg-slate-400 dark:bg-slate-600 transition-all duration-700"
                  style={{ width: "100%" }}
                />
              </div>
              <p className="text-[11px] text-muted-foreground">
                SECR reference figure for manual block-sanction processing.
              </p>
            </div>

            {/* Efficiency Summary */}
            <div className="flex items-center justify-between rounded-xl border border-emerald-100 dark:border-emerald-900/50 bg-emerald-50/60 dark:bg-emerald-950/30 px-4 py-3">
              <div className="text-xs text-emerald-700 dark:text-emerald-300 font-medium">
                Time saved per sanction
              </div>
              <div className="text-sm font-bold text-emerald-700 dark:text-emerald-300 tabular-nums">
                ↓ {(MANUAL_BASELINE_MINS - effectiveAiMins).toFixed(1)} min
                <span className="ml-1.5 text-[11px] font-semibold opacity-70">
                  ({Math.round(((MANUAL_BASELINE_MINS - effectiveAiMins) / MANUAL_BASELINE_MINS) * 100)}% reduction)
                </span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2">
        <StatCard
          title="Total approved this session"
          value={String(approvedCount)}
          icon={<Check className="h-4 w-4 text-muted-foreground" />}
          desc="Approvals recorded during this session"
        />
        <StatCard
          title="Average approval time"
          value={humanizeMs(avgMs)}
          icon={<Clock className="h-4 w-4 text-muted-foreground" />}
          desc="Mean time from request to decision"
        />
      </div>
    </section>
  );
}

export default function ControlPage() {
  const { selectedCorridorId } = useCorridor();
  const supabaseRef = useRef<ReturnType<typeof createClient>>();
  if (!supabaseRef.current) supabaseRef.current = createClient();
  const supabase = supabaseRef.current;
  const [liveTime, setLiveTime] = useState("");
  useEffect(() => {
    const tick = () => setLiveTime(new Date().toLocaleTimeString());
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  const [user, setUser] = useState<User | null>(null);

  const [timetable, setTimetable] = useState<TimetableRow[]>([]);
  const [loadingTimetable, setLoadingTimetable] = useState(true);
  const [pending, setPending] = useState<BlockRequestRow[]>([]);
  const [loadingPending, setLoadingPending] = useState(true);
  const [approvals, setApprovals] = useState<ApprovalRow[]>([]);
  const [loadingApprovals, setLoadingApprovals] = useState(true);
  const [verifyLogs, setVerifyLogs] = useState<VerifyLogRow[]>([]);
  const [loadingVerify, setLoadingVerify] = useState(true);
  const [showUnverifiedOnly, setShowUnverifiedOnly] = useState(false);

  const [refreshing, setRefreshing] = useState(false);
  const [actingId, setActingId] = useState<string | null>(null);
  const [confirmApproveOpen, setConfirmApproveOpen] = useState(false);
  const [approveTarget, setApproveTarget] = useState<BlockRequestRow | null>(
    null,
  );
  const [confirmModifyOpen, setConfirmModifyOpen] = useState(false);
  const [modifyOpen, setModifyOpen] = useState(false);
  const [modifyTarget, setModifyTarget] = useState<BlockRequestRow | null>(
    null,
  );
  const [modifyStart, setModifyStart] = useState("");
  const [modifyDuration, setModifyDuration] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [selectedOptions, setSelectedOptions] = useState<
    Record<string, string>
  >({});

  const sessionStartRef = useRef<number>(Date.now());

  const fetchTimetable = useCallback(async () => {
    setLoadingTimetable(true);
    let query = supabase
      .from("timetable")
      .select("*, segments(name)")
      .order("scheduled_time", { ascending: true });

    if (selectedCorridorId != null) {
      const { data: segs } = await supabase
        .from("segments")
        .select("id")
        .eq("corridor_id", selectedCorridorId);
      if (segs && segs.length > 0) {
        query = query.in("segment_id", segs.map((s) => s.id));
      }
    }

    const { data, error } = await query;
    if (error) {
      toast.error("Failed to load timetable", { description: error.message });
      setTimetable([]);
    } else {
      setTimetable((data as TimetableRow[]) ?? []);
    }
    setLoadingTimetable(false);
  }, [supabase, selectedCorridorId]);

  const fetchPending = useCallback(async () => {
    setLoadingPending(true);
    let corridorSegmentIds: number[] | null = null;

    if (selectedCorridorId != null) {
      const { data, error } = await supabase
        .from("segments")
        .select("id")
        .eq("corridor_id", selectedCorridorId);

      if (error) {
        toast.error("Failed to load corridor segments", {
          description: error.message,
        });
        setPending([]);
        setLoadingPending(false);
        return;
      }

      corridorSegmentIds = (data ?? []).map((segment) => segment.id);
      if (corridorSegmentIds.length === 0) {
        setPending([]);
        setLoadingPending(false);
        return;
      }
    }

        let query = supabase
      .from("block_requests")
      .select("*, segments(name), block_plan_options(*)")
      .eq("status", "scored" as BlockRequestStatus)
      .order("priority_score", { ascending: false, nullsFirst: false });

    if (selectedCorridorId != null && corridorSegmentIds) {
      query = query.in("segment_id", corridorSegmentIds);
    }

    const { data: pendingData, error: pendingError } = await query;
if (pendingError) {
  toast.error("Failed to load pending plans", {
    description: pendingError.message,
  });
  setPending([]);
} else {
  setPending((pendingData as BlockRequestRow[]) ?? []);
}
    setLoadingPending(false);
  }, [supabase, selectedCorridorId]);

  const fetchApprovals = useCallback(async () => {
    if (!user) {
      setApprovals([]);
      return;
    }
    setLoadingApprovals(true);
    const since = new Date(sessionStartRef.current).toISOString();
    const { data, error } = await supabase
      .from("approvals")
      .select("*, block_requests(created_at)")
      .eq("officer_id", user.id)
      .gte("decided_at", since);
    if (error) {
      setApprovals([]);
    } else {
      setApprovals((data as ApprovalRow[]) ?? []);
    }
    setLoadingApprovals(false);
  }, [supabase, user]);

  const fetchVerifyLogs = useCallback(async () => {
    setLoadingVerify(true);
    const { data, error } = await supabase
      .from("execution_logs")
      .select(
        "*, block_requests(work_description, work_type, requested_duration_mins, segment_id, segments(name, corridor_id))",
      )
      .eq("status", "completed")
      .order("actual_start", { ascending: false });
    if (error) {
      toast.error("Failed to load field work", { description: error.message });
      setVerifyLogs([]);
    } else {
      setVerifyLogs((data as VerifyLogRow[]) ?? []);
    }
    setLoadingVerify(false);
  }, [supabase]);

  useEffect(() => {
    const loadUser = async () => {
      const { data } = await supabase.auth.getUser();
      setUser(data.user ?? null);
    };
    loadUser();
  }, [supabase]);

  useEffect(() => {
    fetchTimetable();
    fetchPending();
    fetchVerifyLogs();
    const id = setInterval(() => {
      fetchTimetable();
    }, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [fetchTimetable, fetchPending, fetchVerifyLogs]);

  useEffect(() => {
    if (user) fetchApprovals();
    else setApprovals([]);
  }, [user, fetchApprovals]);

  const approvedCount = approvals.filter(
    (a) => a.decision === "approved" || a.decision === "modified",
  ).length;
  const avgMs = (() => {
    const diffs = approvals
      .map((a) => {
        const created = a.block_requests?.created_at;
        if (!created) return NaN;
        const diff = Date.parse(a.decided_at) - Date.parse(created);
        return diff > 0 ? diff : NaN;
      })
      .filter((n) => !Number.isNaN(n));
    if (diffs.length === 0) return 0;
    return diffs.reduce((s, n) => s + n, 0) / diffs.length;
  })();

  async function refreshTimetable() {
    setRefreshing(true);
    try {
      const res = await fetch("/api/simulate-timetable", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ corridorId: selectedCorridorId }),
      });
      const text = await res.text();
      let json: { error?: string; count?: number; message?: string } = {};
      try {
        json = text ? JSON.parse(text) : {};
      } catch {
        json = { error: text || `HTTP error ${res.status}` };
      }
      if (!res.ok) {
        throw new Error(json?.error || "Failed to simulate timetable");
      }
      toast.success("Timetable refreshed", {
        description: `${json?.count ?? "?"} trains re-seeded into the live feed.`,
      });
      await fetchTimetable();
    } catch (err) {
      toast.error("Failed to refresh timetable", {
        description: err instanceof Error ? err.message : "Unknown error",
      });
    } finally {
      setRefreshing(false);
    }
  }

  function getSelectedOption(br: BlockRequestRow): BlockPlanOption | undefined {
    const selId = selectedOptions[br.id];
    return (
      br.block_plan_options?.find((o) => o.id === selId) ??
      br.block_plan_options?.find((o) => o.is_recommended) ??
      br.block_plan_options?.[0]
    );
  }

  async function handleApproveSelected(br: BlockRequestRow) {
    const opt = getSelectedOption(br);
    const start = opt ? opt.adjusted_start : br.requested_start;
    const duration = opt
      ? opt.adjusted_duration_mins
      : br.requested_duration_mins;
    setActingId(br.id);
    try {
      const { error } = await supabase.from("approvals").insert({
        block_request_id: br.id,
        officer_id: user?.id ?? null,
        decision: "approved" as ApprovalDecision,
        modified_start: new Date(start).toISOString(),
        modified_duration_mins: duration,
        decided_at: new Date().toISOString(),
      });
      if (error) {
        toast.error("Failed to approve", { description: error.message });
        return;
      }
      const { error: updErr } = await supabase
        .from("block_requests")
        .update({
          status: "approved" as BlockRequestStatus,
          requested_start: new Date(start).toISOString(),
          requested_duration_mins: duration,
        })
        .eq("id", br.id);
      if (updErr) {
        toast.error("Failed to update block request", {
          description: updErr.message,
        });
        return;
      }
      toast.success("Request approved", {
        description: `Block request #${br.id.slice(0, 8)} approved with selected plan.`,
      });
      setPending((prev) => prev.filter((r) => r.id !== br.id));
      setSelectedOptions((prev) => {
        const next = { ...prev };
        delete next[br.id];
        return next;
      });
      setApproveTarget(null); // modal target clear
      setConfirmApproveOpen(false);
      fetchApprovals();
    } finally {
      setActingId(null); // <-- YEH MISSING THA, iske bina dusra button dead
    }
  }

  async function handleMarkVerified(log: VerifyLogRow) {
    if (!user) return;
    setActingId(log.id);
    const { error } = await supabase
      .from("execution_logs")
      .update({ verified: true })
      .eq("id", log.id);
    if (error) {
      toast.error("Failed to mark verified", { description: error.message });
      setActingId(null);
      return;
    }
    toast.success("Field work marked as verified");
    setVerifyLogs((prev) =>
      prev.map((l) => (l.id === log.id ? { ...l, verified: true } : l)),
    );
    setActingId(null);
  }

  function openModify(br: BlockRequestRow) {
    setModifyTarget(br);
    const opt = getSelectedOption(br);
    const start = opt ? opt.adjusted_start : br.requested_start;
    const duration = opt
      ? opt.adjusted_duration_mins
      : br.requested_duration_mins;
    setModifyStart(fmtDateTimeLocal(start));
    setModifyDuration(String(duration));
    setModifyOpen(true);
  }

  async function handleModifySubmit() {
    if (!modifyTarget) return;
    const start = modifyStart;
    const duration = Number(modifyDuration);
    if (!start) {
      toast.error("Start time is required");
      return;
    }
    if (Number.isNaN(duration) || duration <= 0) {
      toast.error("Duration must be a positive number of minutes");
      return;
    }
    setSubmitting(true);
    const { error } = await supabase.from("approvals").insert({
      block_request_id: modifyTarget.id,
      officer_id: user?.id ?? null,
      decision: "modified" as ApprovalDecision,
      modified_start: new Date(start).toISOString(),
      modified_duration_mins: duration,
      decided_at: new Date().toISOString(),
    });
    if (error) {
      toast.error("Failed to record modification", {
        description: error.message,
      });
      setSubmitting(false);
      return;
    }
    const { error: updErr } = await supabase
      .from("block_requests")
      .update({
        status: "approved" as BlockRequestStatus,
        requested_start: new Date(start).toISOString(),
        requested_duration_mins: duration,
      })
      .eq("id", modifyTarget.id);
    if (updErr) {
      toast.error("Failed to update block request", {
        description: updErr.message,
      });
      setSubmitting(false);
      return;
    }
    toast.success("Request modified and approved", {
      description: `Block request #${modifyTarget.id.slice(0, 8)} updated.`,
    });
    setModifyOpen(false);
    setModifyTarget(null);
    setPending((prev) => prev.filter((r) => r.id !== modifyTarget.id));
    fetchApprovals();
    setSubmitting(false);
  }

  const departmentCounts: Record<Department, number> = {
    TMS: 0,
    TDMS: 0,
    SMMS: 0,
  };
  for (const request of pending) {
    if (request.department) departmentCounts[request.department] += 1;
  }

return (
    <div className="w-full space-y-8 lg:space-y-10">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="flex shrink-0 items-center justify-center rounded-xl bg-purple-100 dark:bg-purple-950/60 p-2 text-[#7009c6] shadow-sm border border-purple-200/50 dark:border-purple-800/50">
            <Gauge className="h-6 w-6" />
          </div>
          <h1 className="text-2xl font-bold text-[#7009c6]">Control Center</h1>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={refreshTimetable}
          disabled={refreshing}
        >
          {refreshing ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
          Refresh Live Timetable
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-2">
        <DepartmentOverview counts={departmentCounts} loading={loadingPending} />
        <CorridorSnapshot selectedCorridorId={selectedCorridorId} />
      </div>

      <Tabs defaultValue="timetable" className="space-y-6">
        <TabsList>
          <TabsTrigger value="timetable">Timetable</TabsTrigger>
          <TabsTrigger value="pending">Pending Plans</TabsTrigger>
          <TabsTrigger value="verify">Verify Field Work</TabsTrigger>
          <TabsTrigger value="horizons">Horizon Plans</TabsTrigger>
          <TabsTrigger value="corridor">Corridor</TabsTrigger>
        </TabsList>

<TabsContent value="timetable" className="space-y-5">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <h2 className="text-sm font-semibold flex items-center gap-2">
              Live Timetable
              <Badge variant="success" className="gap-1.5">
                <span className="w-2 h-2 bg-success dark:bg-success/80 rounded-full animate-pulse"></span> Live
              </Badge>
            </h2>
            <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success/80 dark:bg-success/60 opacity-75"></span>
                <span className="relative inline-flex h-2 w-2 rounded-full bg-success dark:bg-success/80"></span>
              </span>
              <span>Live</span>
              <Separator orientation="vertical" className="h-3" />
              <span>Auto-refreshes every 15s</span>
              <Separator orientation="vertical" className="h-3" />
              <span suppressHydrationWarning>Last updated: {liveTime}</span>
            </div>
          </div>

          <Card>
            <CardContent className="p-0">
              <LiveTrackMap timetable={timetable} />
            </CardContent>
          </Card>

          {loadingTimetable ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <Card key={i} size="sm">
                  <CardContent className="flex items-center justify-between p-4">
                    <div className="flex items-center gap-3">
                      <Skeleton className="h-9 w-9 rounded-full" />
                      <div className="space-y-1.5">
                        <Skeleton className="h-4 w-16" />
                        <Skeleton className="h-3 w-44" />
                      </div>
                    </div>
                    <Skeleton className="h-5 w-16" />
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : timetable.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-sm text-muted-foreground">
                <TrainFront className="mx-auto mb-2 h-6 w-6" />
                No timetable entries. Hit "Refresh Live Timetable" to seed the
                feed.
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-3">
              {timetable.map((train) => {
                const trainMeta = LIVE_TRAIN_DATASET.find(
                  (t) =>
                    t.trainNo === train.train_number ||
                    t.id === train.train_number
                );
                const isMaterial = trainMeta?.category === "Material";
                const segmentLabel = getSegmentDisplayName(
                  train.segment_id,
                  train.segments?.name
                );

                return (
                  <Card
                    key={train.id}
                    size="sm"
                    className="hover:shadow-md transition-all border border-border/70 overflow-hidden"
                  >
                    <CardContent className="flex flex-col sm:flex-row sm:items-center justify-between p-4 gap-3">
                      <div className="flex items-start sm:items-center gap-3.5">
                        <div
                          className={cn(
                            "w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 shadow-sm",
                            isMaterial
                              ? "bg-amber-500/10 text-amber-600 border border-amber-500/20"
                              : "bg-[#7c3aed]/10 text-[#7c3aed] border border-[#7c3aed]/20"
                          )}
                        >
                          {isMaterial ? (
                            <Package className="w-5 h-5 text-amber-600" />
                          ) : (
                            <TrainFront className="w-5 h-5 text-[#7c3aed]" />
                          )}
                        </div>
                        <div className="space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-bold font-mono text-sm text-foreground">
                              {train.train_number}
                            </span>
                            <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                              {trainMeta ? trainMeta.name : `Train #${train.train_number}`}
                            </span>
                            {trainMeta && (
                              <Badge
                                className={cn(
                                  "text-[10px] font-bold text-white px-2 py-0.5 min-h-[20px] h-auto leading-none uppercase",
                                  isMaterial
                                    ? "bg-amber-600 hover:bg-amber-600"
                                    : "bg-[#7c3aed] hover:bg-[#7c3aed]"
                                )}
                              >
                                {trainMeta.category}
                              </Badge>
                            )}
                            {trainMeta?.track && (
                              <Badge
                                variant="outline"
                                className="text-[10px] font-mono font-medium px-2 py-0.5 min-h-[20px] h-auto leading-none border-slate-300 text-slate-600"
                              >
                                {trainMeta.track}
                              </Badge>
                            )}
                          </div>

                          <div className="text-xs text-muted-foreground flex items-center gap-1.5 flex-wrap">
                            <span className="font-medium text-slate-700 dark:text-slate-300">
                              {segmentLabel}
                            </span>
                            <ArrowRight className="w-3 h-3 text-muted-foreground" />
                            <span suppressHydrationWarning className="font-mono">
                              {fmtDateTime(train.scheduled_time)}
                            </span>
                            {trainMeta?.speed != null && (
                              <>
                                <span>•</span>
                                <span className="font-bold text-slate-700 dark:text-slate-300">
                                  {trainMeta.speed} km/h
                                </span>
                              </>
                            )}
                          </div>

                          {trainMeta?.cargo && (
                            <div className="text-[11px] text-muted-foreground flex items-center gap-1 pt-0.5">
                              <span className="inline-block bg-muted/80 px-2 py-0.5 rounded border border-border/50 text-[10.5px]">
                                {trainMeta.cargo}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 sm:self-center self-end">
                        <Badge
                          variant={statusVariant(train.status)}
                          className="gap-1.5 capitalize px-2.5 py-1 text-xs font-semibold"
                        >
                          <span
                            className={cn(
                              "w-2 h-2 rounded-full animate-pulse",
                              train.status === "delayed" || train.status === "cancelled"
                                ? "bg-warning"
                                : "bg-success"
                            )}
                          />
                          {trainMeta ? trainMeta.status : statusLabel(train.status)}
                        </Badge>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        <TabsContent value="pending" className="space-y-3">
          <h2 className="text-sm font-semibold">
            AI-Scored Block Requests ({pending.length} pending)
          </h2>
          {loadingPending ? (
            Array.from({ length: 5 }).map((_, i) => (
              <Card key={i}>
                <CardHeader>
                  <Skeleton className="h-5 w-3/4" />
                  <Skeleton className="h-4 w-1/2" />
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-3 gap-3 sm:grid-cols-3">
                    <Skeleton className="h-24 w-full" />
                    <Skeleton className="h-24 w-full" />
                    <Skeleton className="h-24 w-full" />
                  </div>
                </CardContent>
              </Card>
            ))
          ) : pending.length === 0 ? (
            <Card>
              <CardContent className="py-10 text-center text-sm text-muted-foreground">
                All scored requests have been handled. Nothing pending.
              </CardContent>
            </Card>
          ) : (
            pending.map((br) => {
              const options = br.block_plan_options ?? [];
              const reqRiskKey = delayRiskKey(br.delay_risk);
              const reqRiskInfo = DELAY_RISK_BADGE[reqRiskKey];
              return (
                <Card key={br.id}>
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div>
                        <CardTitle className="text-lg">
                          {br.segments?.name ?? `ID ${br.id.slice(0, 8)}`}
                        </CardTitle>
                        <CardDescription>
                          <span suppressHydrationWarning>
                            {fmtDateTime(br.requested_start)}
                          </span>{" "}
                          • {fmtDuration(br.requested_duration_mins)}
                        </CardDescription>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge
                          variant={priorityBadge(br.priority_score)}
                          className="capitalize"
                        >
                          {priorityLabel(br.priority_score)} Priority
                        </Badge>
                        <Badge
                          variant={reqRiskInfo.variant}
                          className="capitalize"
                        >
                          {delayRiskLabel(reqRiskInfo.label)}
                        </Badge>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex items-start gap-1.5 text-sm text-muted-foreground">
                      <Sparkles className="mt-0.5 h-4 w-4 text-primary/70 shrink-0" />
                      {br.ai_explanation ?? "No explanation provided."}
                    </div>
                    {options.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        No plan options available for this request.
                      </p>
                    ) : (
                      <div className="flex flex-col sm:flex-row sm:items-stretch gap-3">
                        {options.map((opt) => {
                          const optRiskKey = delayRiskKey(opt.delay_risk);
                          const optRiskInfo = DELAY_RISK_BADGE[optRiskKey];
                          const isRecommended = !!opt.is_recommended;
                          const isSelected =
                            selectedOptions[br.id] === opt.id ||
                            (!selectedOptions[br.id] && isRecommended) ||
                            (!selectedOptions[br.id] && !options.some((o) => o.is_recommended) && opt === options[0]);
                          const score = opt.priority_score;
                          const scorePct =
                            score != null
                              ? Math.max(0, Math.min(10, score)) * 10
                              : 0;
                          return (
                            <label
                              key={opt.id}
                              className={cn(
                                "relative flex-1 cursor-pointer rounded-xl border-2 p-4 text-left transition-all duration-base sm:basis-1/3 sm:min-w-0 flex flex-col gap-3",
                                isSelected
                                  ? "border-primary animate-selectGlow"
                                  : isRecommended
                                    ? "border-primary"
                                    : "border-muted hover:border-muted-foreground/50",
                              )}
                            >
                              <input
                                type="radio"
                                name={`plan-${br.id}`}
                                value={opt.id}
                                checked={isSelected}
                                onChange={() =>
                                  setSelectedOptions((prev) => ({
                                    ...prev,
                                    [br.id]: opt.id,
                                  }))
                                }
                                className="sr-only"
                              />
                              {isRecommended && (
                                <Badge className="absolute -top-2 left-3 bg-primary text-primary-foreground shadow-md">
                                  AI Recommended
                                </Badge>
                              )}
                              <div className="flex items-start justify-between">
                                <div className="flex items-center gap-2">
                                  {isRecommended && (
                                    <Sparkles className="mt-0.5 h-4 w-4 text-primary" />
                                  )}
                                  <span className="text-sm font-medium">
                                    {fmtDateTime(opt.adjusted_start)} •{" "}
                                    {fmtDuration(opt.adjusted_duration_mins)}
                                  </span>
                                </div>
                                <div
                                  className={cn(
                                    "flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 transition-all",
                                    isSelected
                                      ? "border-primary bg-primary"
                                      : "border-muted-foreground/40",
                                  )}
                                >
                                  {isSelected && (
                                    <div className="h-1.5 w-1.5 rounded-full bg-white" />
                                  )}
                                </div>
                              </div>

                              <div className="flex items-center justify-between">
                                <Badge
                                  variant={optRiskInfo.variant}
                                  className="capitalize"
                                >
                                  {delayRiskLabel(optRiskInfo.label)}
                                </Badge>
                                {opt.option_label ? (
                                  <span className="text-xs font-medium text-muted-foreground">
                                    {opt.option_label}
                                  </span>
                                ) : null}
                              </div>

                              <div className="mt-auto space-y-2">
                                <div className="flex items-center justify-between text-xs">
                                  <span className="text-muted-foreground">
                                    Priority Score
                                  </span>
                                  <span className="font-medium">
                                    {score ?? "—"}
                                  </span>
                                </div>
                                <Progress
                                  value={scorePct}
                                  max={100}
                                  className="h-2 w-full"
                                />
                              </div>

                              <p className="text-xs text-muted-foreground">
                                {opt.explanation ?? "No explanation provided."}
                              </p>
                            </label>
                          );
                        })}
                      </div>
                    )}
                  </CardContent>
                  <CardFooter className="flex justify-end gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => openModify(br)}
                      disabled={!user}
                    >
                      <Edit className="h-3 w-3" />
                      Modify
                    </Button>
                    <Button
                      size="sm"
                      className={cn(
                        "transition-all",
                        selectedOptions[br.id]
                          ? "bg-primary text-primary-foreground hover:bg-primary/90"
                          : "bg-muted text-muted-foreground",
                      )}
                      onClick={() => {
                        setApproveTarget(br);
                        setConfirmApproveOpen(true);
                      }}
                      disabled={
                        !selectedOptions[br.id] || actingId === br.id || !user
                      }
                    >
                      {actingId === br.id ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : selectedOptions[br.id] ? (
                        <Check className="h-3 w-3" />
                      ) : (
                        <Clock className="h-3 w-3" />
                      )}
                      Approve Selected Plan
                    </Button>
                  </CardFooter>
                </Card>
              );
            })
          )}
        </TabsContent>

        <TabsContent value="verify" className="space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <h2 className="text-sm font-semibold flex items-center gap-2">
              <span className="font-bold text-foreground">Completed Field Work</span>
              <span className="text-muted-foreground">•</span>
              <span className="text-muted-foreground font-normal">
                {showUnverifiedOnly
                  ? `${verifyLogs.filter((l) => !l.verified).length} unverified`
                  : `${verifyLogs.length} total`}
              </span>
            </h2>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant={showUnverifiedOnly ? "default" : "outline"}
                className="h-8 text-xs font-semibold rounded-lg"
                onClick={() => setShowUnverifiedOnly(!showUnverifiedOnly)}
              >
                {showUnverifiedOnly ? "Unverified Only" : "All Completed Work"}
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-8 text-xs font-semibold rounded-lg"
                onClick={fetchVerifyLogs}
                disabled={loadingVerify}
              >
                {loadingVerify ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                ) : (
                  <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                )}
                Refresh
              </Button>
            </div>
          </div>

          {loadingVerify ? (
            Array.from({ length: 3 }).map((_, i) => (
              <Card key={i} className="border border-border/70 overflow-hidden">
                <CardHeader>
                  <Skeleton className="h-5 w-3/4" />
                  <Skeleton className="h-4 w-1/2" />
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Skeleton className="h-64 w-full rounded-xl" />
                    <Skeleton className="h-64 w-full rounded-xl" />
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 p-3.5 rounded-xl border">
                    <Skeleton className="h-8 w-full" />
                    <Skeleton className="h-8 w-full" />
                    <Skeleton className="h-8 w-full" />
                    <Skeleton className="h-8 w-full" />
                  </div>
                </CardContent>
              </Card>
            ))
          ) : verifyLogs.filter((l) =>
              showUnverifiedOnly ? !l.verified : true,
            ).length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-sm text-muted-foreground">
                {showUnverifiedOnly
                  ? "All field work has been verified. Nothing unverified to review."
                  : "No completed field work is currently awaiting verification."}
              </CardContent>
            </Card>
          ) : (
            verifyLogs
              .filter((l) => (showUnverifiedOnly ? !l.verified : true))
              .map((log) => {
                const req = log.block_requests ?? null;
                const segmentId =
                  req?.segment_id ??
                  (req?.segments?.name === "B-C" ? 2 : req?.segments?.name === "A-B" ? 1 : null);
                const rawName =
                  req?.segments?.name === "B-C"
                    ? "Saraswati Nagar → Sarona"
                    : req?.segments?.name;
                const segmentName = getSegmentDisplayName(
                  segmentId,
                  rawName ?? "Saraswati Nagar → Sarona"
                );
                const wt = req?.work_type ?? ("other" as BlockRequestWorkType);
                const actualMins = computeActualDurationMins(log);
                const varianceMins = computeVarianceMins(log);
                const verified = !!log.verified;
                const isActing = actingId === log.id;
                const varianceOver = varianceMins != null && varianceMins > 0;

                return (
                  <Card key={log.id} className="overflow-hidden border border-border/80 shadow-sm hover:shadow-md transition-all">
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="space-y-1">
                          <CardTitle className="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                            <span>{segmentName}</span>
                          </CardTitle>
                          <CardDescription className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            <span className="font-semibold text-slate-700 dark:text-slate-300">
                              {workTypeLabel(wt)}
                            </span>
                            <span>•</span>
                            <span suppressHydrationWarning>
                              {log.actual_start
                                ? fmtDateTime(log.actual_start)
                                : "—"}
                            </span>
                          </CardDescription>
                          {req?.work_description ? (
                            <p className="mt-1 text-xs text-slate-600 dark:text-slate-400 leading-relaxed max-w-3xl">
                              {req.work_description}
                            </p>
                          ) : null}
                        </div>
                        <Badge
                          variant={verified ? "default" : "secondary"}
                          className={cn(
                            "px-2.5 py-1 text-xs font-semibold capitalize tracking-wide flex-shrink-0",
                            verified
                              ? "bg-emerald-100 text-emerald-800 border border-emerald-300 dark:bg-emerald-950 dark:text-emerald-300"
                              : "bg-amber-100 text-amber-800 border border-amber-300 dark:bg-amber-950 dark:text-amber-300",
                          )}
                        >
                          <span
                            className={cn(
                              "w-2 h-2 rounded-full mr-1.5",
                              verified
                                ? "bg-emerald-600"
                                : "bg-amber-500 animate-pulse"
                            )}
                          />
                          {verified ? "Verified" : "Pending verification"}
                        </Badge>
                      </div>
                    </CardHeader>

                    <CardContent className="space-y-4">
                      {/* Responsive Grid with Before and After Inspection Images */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        {/* Before Inspection Image */}
                        <div className="group relative rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900 shadow-sm hover:shadow-md transition-all">
                          <Badge
                            className="absolute top-2.5 left-2.5 z-10 bg-slate-900/80 hover:bg-slate-900/90 text-white text-[11px] font-semibold backdrop-blur-md shadow-sm border border-white/20"
                          >
                            Before: Ballast Overgrowth / Wear
                          </Badge>
                          {log.before_image_url ? (
                            <img
                              src={log.before_image_url}
                              alt="Before: Ballast Overgrowth / Wear"
                              className="h-64 w-full object-cover group-hover:scale-[1.02] transition-transform duration-300"
                            />
                          ) : (
                            <div className="flex h-64 w-full items-center justify-center text-xs text-muted-foreground">
                              No before inspection image
                            </div>
                          )}
                        </div>

                        {/* After Inspection Image */}
                        <div className="group relative rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900 shadow-sm hover:shadow-md transition-all">
                          <Badge
                            className="absolute top-2.5 left-2.5 z-10 bg-emerald-700/90 hover:bg-emerald-700 text-white text-[11px] font-semibold backdrop-blur-md shadow-sm border border-emerald-400/30"
                          >
                            After: Tamped &amp; Cleared
                          </Badge>
                          {log.after_image_url ? (
                            <img
                              src={log.after_image_url}
                              alt="After: Tamped &amp; Cleared"
                              className="h-64 w-full object-cover group-hover:scale-[1.02] transition-transform duration-300"
                            />
                          ) : (
                            <div className="flex h-64 w-full items-center justify-center text-xs text-muted-foreground">
                              No after inspection image
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Field Worker Fix Notes / Work Description */}
                      {log.work_done_notes ? (
                        <div className="flex items-start gap-3 p-3.5 rounded-xl border border-primary/25 bg-primary/[0.04] dark:bg-primary/[0.08]">
                          <FileText className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                          <div className="space-y-1 min-w-0 flex-1">
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-[11px] font-bold uppercase tracking-wider text-primary">
                                Field Worker Fix Notes / Work Performed
                              </span>
                              <Badge
                                variant="outline"
                                className="text-[10px] px-2 py-0.5 min-h-[20px] h-auto leading-none font-semibold text-primary border-primary/30 bg-primary/10"
                              >
                                Reported from Field
                              </Badge>
                            </div>
                            <p className="text-xs text-foreground/90 leading-relaxed break-words font-medium">
                              {log.work_done_notes}
                            </p>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl border border-dashed border-border/70 bg-muted/20 text-xs text-muted-foreground">
                          <FileText className="h-3.5 w-3.5 text-muted-foreground/60 shrink-0" />
                          <span>No specific fix notes submitted by field crew for this work</span>
                        </div>
                      )}

                      {/* 4-column summary bar */}
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 p-3.5 rounded-xl border border-slate-200/80 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/40">
                        <div className="space-y-0.5">
                          <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground block">
                            Actual Start
                          </span>
                          <p className="text-xs font-semibold text-slate-900 dark:text-slate-100 font-mono" suppressHydrationWarning>
                            {log.actual_start ? fmtDateTime(log.actual_start) : "—"}
                          </p>
                        </div>

                        <div className="space-y-0.5 border-l border-slate-200/80 dark:border-slate-800 pl-3">
                          <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground block">
                            Actual End
                          </span>
                          <p className="text-xs font-semibold text-slate-900 dark:text-slate-100 font-mono" suppressHydrationWarning>
                            {log.actual_end ? fmtDateTime(log.actual_end) : "—"}
                          </p>
                        </div>

                        <div className="space-y-0.5 border-l border-slate-200/80 dark:border-slate-800 pl-3">
                          <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground block">
                            Actual Duration
                          </span>
                          <p className="text-xs font-bold text-slate-900 dark:text-slate-100">
                            {actualMins != null ? `${actualMins} min` : "—"}
                          </p>
                        </div>

                        <div className="space-y-0.5 border-l border-slate-200/80 dark:border-slate-800 pl-3">
                          <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground block">
                            Variance vs Planned
                          </span>
                          <p
                            className={cn(
                              "text-xs font-bold inline-flex items-center gap-1",
                              varianceOver ? "text-destructive" : "text-emerald-600 dark:text-emerald-400"
                            )}
                          >
                            {varianceMins != null && !varianceOver ? (
                              <TrendingDown className="h-3.5 w-3.5" />
                            ) : null}
                            {varianceMins != null && varianceOver ? (
                              <TrendingUp className="h-3.5 w-3.5" />
                            ) : null}
                            {varianceMins != null ? fmtVarianceMins(varianceMins) : "—"}
                          </p>
                        </div>
                      </div>
                    </CardContent>

                    {!verified && (
                      <CardFooter className="flex justify-end border-t border-border bg-muted/20 px-6 py-3">
                        <Button
                          size="sm"
                          variant="default"
                          className="bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm font-semibold"
                          onClick={() => handleMarkVerified(log)}
                          disabled={isActing || !user}
                        >
                          {isActing ? (
                            <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
                          ) : (
                            <Check className="h-4 w-4 mr-1.5" />
                          )}
                          <span>{isActing ? "Marking…" : "Mark Verified"}</span>
                        </Button>
                      </CardFooter>
                    )}
                  </Card>
                );
              })
          )}
        </TabsContent>

        <TabsContent value="horizons" className="space-y-3">
          <HorizonPlanReview />
        </TabsContent>
        <TabsContent value="corridor" className="space-y-3">
          <CorridorAvailability />
        </TabsContent>
      </Tabs>

      {loadingApprovals && !approvals.length ? (
        <TimeSavedAnalytics
          approvedCount={0}
          avgMs={0}
          sessionStart={sessionStartRef.current}
          selectedCorridorId={selectedCorridorId}
        />
      ) : (
        <TimeSavedAnalytics
          approvedCount={approvedCount}
          avgMs={avgMs}
          sessionStart={sessionStartRef.current}
          selectedCorridorId={selectedCorridorId}
        />
      )}

      <Dialog open={modifyOpen} onOpenChange={setModifyOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Modify Block Request</DialogTitle>
            <DialogDescription>
              Further override the selected plan option's start time and
              duration. Saving records a "modified" approval with the new values
              and sets the request to approved.
            </DialogDescription>
          </DialogHeader>
          {modifyTarget &&
            (() => {
              const modOpt = getSelectedOption(modifyTarget);
              const baseStart = modOpt
                ? modOpt.adjusted_start
                : modifyTarget.requested_start;
              const baseDuration = modOpt
                ? modOpt.adjusted_duration_mins
                : modifyTarget.requested_duration_mins;
              return (
                <div className="space-y-4 py-2 text-sm">
                  <div className="grid grid-cols-2 gap-2">
                    <span className="text-muted-foreground">Segment</span>
                    <span>{modifyTarget.segments?.name ?? "—"}</span>
                    <span className="text-muted-foreground">Priority</span>
                    <span>{priorityLabel(modifyTarget.priority_score)}</span>
                    <span className="text-muted-foreground">
                      Selected start
                    </span>
                    <span>{fmtDateTime(baseStart)}</span>
                    <span className="text-muted-foreground">
                      Selected duration
                    </span>
                    <span>{baseDuration} min</span>
                  </div>
                  <div className="space-y-1.5">
                    <label
                      className="text-sm font-medium leading-none"
                      htmlFor="modify-start"
                    >
                      New start time
                    </label>
                    <Input
                      id="modify-start"
                      type="datetime-local"
                      value={modifyStart}
                      onChange={(e) => setModifyStart(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label
                      className="text-sm font-medium leading-none"
                      htmlFor="modify-duration"
                    >
                      New duration (minutes)
                    </label>
                    <Input
                      id="modify-duration"
                      type="number"
                      min={1}
                      value={modifyDuration}
                      onChange={(e) => setModifyDuration(e.target.value)}
                    />
                  </div>
                </div>
              );
            })()}
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline" disabled={submitting}>
                Cancel
              </Button>
            </DialogClose>
            <Button
              variant="default"
              className="bg-success text-success-foreground hover:bg-success/90"
              onClick={handleModifySubmit}
              disabled={submitting || !modifyTarget}
            >
              {submitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                "Save modification"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={confirmApproveOpen} onOpenChange={setConfirmApproveOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-warning" />
              Confirm Approval
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to approve this block request
              {approveTarget?.segments?.name
                ? ` on Segment ${approveTarget.segments.name}`
                : ""}
              ?
              <br />
              This will approve the <strong>selected</strong> plan option and
              record an approved decision. The request's start time and duration
              will be updated to match the chosen option.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button
                type="button"
                variant="outline"
                disabled={actingId != null}
              >
                Cancel
              </Button>
            </DialogClose>
            <Button
              variant="default"
              className="bg-success text-success-foreground hover:bg-success/90"
              onClick={() => {
                if (approveTarget) handleApproveSelected(approveTarget);
                setConfirmApproveOpen(false);
              }}
              disabled={actingId != null}
            >
              Confirm Approve
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={confirmModifyOpen} onOpenChange={setConfirmModifyOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-warning" />
              Confirm Modification
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to modify this block request
              {modifyTarget?.segments?.name
                ? ` on Segment ${modifyTarget.segments.name}`
                : ""}
              ?
              <br />
              You will be prompted to set the new start time and duration before
              the modification is recorded.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Cancel
              </Button>
            </DialogClose>
            <Button
              variant="default"
              className="bg-warning text-warning-foreground hover:bg-warning/90"
              onClick={() => {
                if (modifyTarget) {
                  openModify(modifyTarget);
                }
                setConfirmModifyOpen(false);
              }}
            >
              Proceed to Edit
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
