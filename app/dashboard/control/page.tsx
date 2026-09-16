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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  LabelList,
  Cell,
  Label,
} from "recharts";
import {
  Check,
  CheckCircle,
  Clock,
  Edit,
  Gauge,
  Loader2,
  RefreshCw,
  Sparkles,
  ArrowRight,
  TrainFront,
  TrendingDown,
  TrendingUp,
  AlertCircle,
  AlertTriangle,
} from "lucide-react";
import LiveTrackMap from "@/components/LiveTrackMap";
// import CorridorAvailability from "@/components/CorridorAvailability";
// import { HorizonPlanReview } from "@/components/HorizonPlanReview";
import type {
  ApprovalDecision,
  BlockPlanOption,
  BlockRequestStatus,
  BlockRequestWorkType,
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
  block_requests: {
    work_description: string | null;
    work_type: BlockRequestWorkType;
    requested_duration_mins: number | null;
    segments: { name: string } | null;
  } | null;
}
const POLL_INTERVAL_MS = 30_000;
const MANUAL_BASELINE_MINS = 18;

const PURPLE_PALETTE = [
  "hsl(268 95% 50%)",
  "hsl(268 95% 42%)",
  "hsl(268 95% 58%)",
  "hsl(268 95% 66%)",
  "hsl(275 90% 37%)",
];

const CHART_TOOLTIP_STYLE: Record<string, string> = {
  backgroundColor: "hsl(var(--popover))",
  color: "hsl(var(--popover-foreground))",
  border: "1px solid hsl(var(--border))",
};

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
  if (mins === 0) return "0 min (on time)";
  const sign = mins > 0 ? "+" : "";
  return `${sign}${mins} min ${mins > 0 ? "over" : "under"} planned`;
}

function computeVarianceMins(log: VerifyLogRow): number | null {
  if (!log.actual_start || !log.actual_end) return null;
  const requested = log.block_requests?.requested_duration_mins ?? null;
  if (requested == null) return null;
  const actualMs =
    new Date(log.actual_end).getTime() - new Date(log.actual_start).getTime();
  const actualMins = Math.round(actualMs / 60000);
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
  return (
    <Card className="transition-shadow duration-200 hover:shadow-md">
      <CardContent className="py-5">
        <div className="flex items-center gap-3">
          {icon}
          <span className="text-3xl font-bold">{value}</span>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">{title}</p>
        {desc ? <p className="text-xs text-muted-foreground">{desc}</p> : null}
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

      let corridorSegmentIds: number[] | null = null;
      if (selectedCorridorId != null) {
        const { data: segmentData, error: segmentError } = await supabase
          .from("segments")
          .select("id")
          .eq("corridor_id", selectedCorridorId);
        if (segmentError || !cancelled) {
          if (!cancelled) {
            corridorSegmentIds = null;
          }
        } else {
          corridorSegmentIds = (segmentData ?? []).map((s) => s.id);
          if (corridorSegmentIds.length === 0) {
            if (!cancelled) {
              setSegmentSeries([]);
              setRiskSeries([]);
              setLoading(false);
            }
            return;
          }
        }
      }

      let query = supabase
        .from("block_requests")
        .select("*, segments(name), block_plan_options(*)")
        .eq("status", "approved");

      if (selectedCorridorId != null && corridorSegmentIds) {
        query = query.in("segment_id", corridorSegmentIds);
      }

      const { data, error: fetchError } = await query;
      void fetchError;

      if (!cancelled) {
        const bySegment = new Map<string, number>();
        const byRisk = new Map<string, number>();

        for (const req of (data as ApprovedPlanRow[] | null) ?? []) {
          const baseline = analyticsBaselineOption(req.block_plan_options);
          if (!baseline || baseline.adjusted_duration_mins == null) continue;
          const approvedDuration = Number(req.requested_duration_mins ?? 0);
          const saved =
            Number(baseline.adjusted_duration_mins) - approvedDuration;

          const segmentName = req.segments?.name ?? "Unknown";
          bySegment.set(segmentName, (bySegment.get(segmentName) ?? 0) + saved);

          const riskName = req.delay_risk ?? "Unknown";
          byRisk.set(riskName, (byRisk.get(riskName) ?? 0) + saved);
        }

        const toSeries = (map: Map<string, number>): ChartSeries[] =>
          Array.from(map, ([key, saved]) => ({ key, saved })).sort(
            (a, b) => b.saved - a.saved,
          );

        setSegmentSeries(toSeries(bySegment));
        setRiskSeries(toSeries(byRisk));
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
  const chartData = [
    {
      metric: "AI-Assisted",
      minutes: avgMins,
      fill: "hsl(268 95% 50%)",
    },
    {
      metric: "Manual Baseline",
      minutes: MANUAL_BASELINE_MINS,
      fill: "hsl(38 92% 50%)",
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
                  margin={{ top: 8, right: 0, left: 0, bottom: 0 }}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    vertical={false}
                    stroke="hsl(var(--border))"
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
                      offset={12}
                      className="fill-muted-foreground text-xs"
                    >
                      Time saved (min)
                    </Label>
                  </YAxis>
                  <Tooltip
                    cursor={false}
                    contentStyle={CHART_TOOLTIP_STYLE}
                    formatter={(v) => [
                      `${Number(v ?? 0).toFixed(1)} min`,
                      "Time saved",
                    ]}
                  />
                  <Bar
                    dataKey="saved"
                    name="Time saved (min)"
                    radius={[8, 8, 0, 0]}
                  >
                    {segmentSeries.map((_, i) => (
                      <Cell
                        key={`segment-cell-${i}`}
                        fill={PURPLE_PALETTE[i % PURPLE_PALETTE.length]}
                      />
                    ))}
                    <LabelList
                      position="top"
                      offset={4}
                      formatter={(v) => `${Number(v ?? 0).toFixed(1)} min`}
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
                  margin={{ top: 8, right: 0, left: 0, bottom: 0 }}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    vertical={false}
                    stroke="hsl(var(--border))"
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
                      offset={12}
                      className="fill-muted-foreground text-xs"
                    >
                      Time saved (min)
                    </Label>
                  </YAxis>
                  <Tooltip
                    cursor={false}
                    contentStyle={CHART_TOOLTIP_STYLE}
                    formatter={(v) => [
                      `${Number(v ?? 0).toFixed(1)} min`,
                      "Time saved",
                    ]}
                  />
                  <Bar
                    dataKey="saved"
                    name="Time saved (min)"
                    radius={[8, 8, 0, 0]}
                  >
                    {riskSeries.map((_, i) => (
                      <Cell
                        key={`risk-cell-${i}`}
                        fill={PURPLE_PALETTE[i % PURPLE_PALETTE.length]}
                      />
                    ))}
                    <LabelList
                      position="top"
                      offset={4}
                      formatter={(v) => `${Number(v ?? 0).toFixed(1)} min`}
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
          <CardTitle className="flex items-center gap-2">
            <Check className="h-5 w-5 text-primary" />
            Approval Processing Time
          </CardTitle>
          <CardDescription>
            AI-assisted average order processing time vs. an illustrative manual
            baseline. Manual baseline is a reference figure, not live data.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-[280px] w-full">
            <ResponsiveContainer>
              <BarChart
                data={chartData}
                margin={{ top: 8, right: 0, left: 0, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="metric" tickLine={false} axisLine={false} />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  tickMargin={4}
                  tickFormatter={(v) => `${v} min`}
                  domain={[0, Math.max(MANUAL_BASELINE_MINS, avgMins) + 5]}
                />
                <Tooltip
                  cursor={false}
                  formatter={(v) => [
                    `${Number(v ?? 0).toFixed(1)} min`,
                    "Processing time",
                  ]}
                />
                <Bar
                  dataKey="minutes"
                  name="Processing time (min)"
                  radius={[8, 8, 0, 0]}
                >
                  {chartData.map((d) => (
                    <Cell key={d.metric} fill={d.fill} />
                  ))}
                  <LabelList
                    position="top"
                    offset={4}
                    formatter={(v) => `${Number(v ?? 0).toFixed(1)} min`}
                  />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <CardDescription className="mt-2 flex items-center gap-1.5 text-xs">
            <AlertCircle className="h-3 w-3" />
            Manual baseline (18 min) is illustrative; no live manual-process
            data is tracked. AI-assisted value reflects the average approval
            time this session (started{" "}
            <span suppressHydrationWarning>
              {sessionStart ? new Date(sessionStart).toLocaleTimeString() : ""}
            </span>
            ).
          </CardDescription>
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
  const [modifyConfirmTarget, setModifyConfirmTarget] =
    useState<BlockRequestRow | null>(null);
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
    const { data, error } = await supabase
      .from("timetable")
      .select("*, segments(name)")
      .order("scheduled_time", { ascending: true });
    if (error) {
      toast.error("Failed to load timetable", { description: error.message });
      setTimetable([]);
    } else {
      setTimetable((data as TimetableRow[]) ?? []);
    }
    setLoadingTimetable(false);
  }, [supabase]);

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
        "*, block_requests(work_description, work_type, requested_duration_mins, segments(name))",
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
      const res = await fetch("/api/simulate-timetable", { method: "POST" });
      const json = await res.json();
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
    return br.block_plan_options?.find((o) => o.id === selId);
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Control Center</h1>
          <p className="text-sm text-muted-foreground">
            Live timetable &amp; block request approvals for the rail network.
          </p>
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

      <Tabs defaultValue="timetable" className="space-y-4">
        <TabsList className="flex flex-wrap gap-1">
          <TabsTrigger value="timetable">Timetable</TabsTrigger>
          <TabsTrigger value="pending">Pending Plans</TabsTrigger>
          <TabsTrigger value="verify">Verify Field Work</TabsTrigger>
          <TabsTrigger value="horizons">Horizon Plans</TabsTrigger>
          <TabsTrigger value="corridor">Corridor</TabsTrigger>
        </TabsList>

        <TabsContent value="timetable" className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold flex items-center gap-2">
              Live Timetable
              <Badge variant="outline" className="gap-1.5 border-green-200 text-green-700 dark:border-green-900 dark:text-green-300">
                <span className="w-2 h-2 bg-green-500 dark:bg-green-400 rounded-full animate-pulse"></span> Live
              </Badge>
            </h2>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-500 dark:bg-green-400 opacity-75"></span>
                <span className="relative inline-flex h-2 w-2 rounded-full bg-green-500 dark:bg-green-400"></span>
              </span>
              <span>Live</span>
              <Separator orientation="vertical" className="h-3" />
              <span>Auto-refreshes every 15s</span>
              <Separator orientation="vertical" className="h-3" />
              <span suppressHydrationWarning>Last updated: {liveTime}</span>
            </div>
          </div>

          <Card>
            <CardContent>
              <LiveTrackMap timetable={timetable} />
            </CardContent>
          </Card>

          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Train #</TableHead>
                  <TableHead>Segment</TableHead>
                  <TableHead>Scheduled Time</TableHead>
                  <TableHead className="text-right">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loadingTimetable ? (
                  Array.from({ length: 6 }).map((_, i) => (
                    <TableRow key={i}>
                      <TableCell>
                        <Skeleton className="h-4 w-16" />
                      </TableCell>
                      <TableCell>
                        <Skeleton className="h-4 w-20" />
                      </TableCell>
                      <TableCell>
                        <Skeleton className="h-4 w-28" />
                      </TableCell>
                      <TableCell className="text-right">
                        <Skeleton className="h-5 w-16" />
                      </TableCell>
                    </TableRow>
                  ))
                ) : timetable.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={4}
                      className="py-8 text-center text-sm text-muted-foreground"
                    >
                      <TrainFront className="mx-auto mb-2 h-6 w-6" />
                      No timetable entries. Hit "Refresh Live Timetable" to seed
                      the feed.
                    </TableCell>
                  </TableRow>
                ) : (
                  timetable.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="font-mono">
                        {row.train_number}
                      </TableCell>
                      <TableCell>{row.segments?.name ?? "—"}</TableCell>
                      <TableCell>
                        <span suppressHydrationWarning>
                          {fmtDateTime(row.scheduled_time)}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        <Badge
                          variant={statusVariant(row.status)}
                          className="gap-1.5 capitalize"
                        >
                          <span className={`w-2 h-2 rounded-full ${row.status === "delayed" || row.status === "cancelled" ? "bg-amber-500 dark:bg-amber-400 animate-pulse" : "bg-emerald-500 dark:bg-emerald-400 animate-pulse"}`}></span>
                          {statusLabel(row.status)}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
            <div className="grid gap-3">
              {timetable.map(train => (
                <div key={train.id} className="flex items-center justify-between p-4 rounded-xl border bg-card hover:shadow-md transition-all">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center">
                      <TrainFront className="w-4 h-4" />
                    </div>
                    <div>
                      <p className="font-bold font-mono">{train.train_number}</p>
                      <p className="text-xs text-muted-foreground flex items-center gap-1">{train.segments?.name ?? "—"} <ArrowRight className="w-3 h-3" /> <span suppressHydrationWarning>{fmtDateTime(train.scheduled_time)}</span></p>
                    </div>
                  </div>
                  <Badge variant={statusVariant(train.status)} className="gap-1.5 capitalize">
                    <span className={`w-2 h-2 rounded-full ${train.status === "delayed" || train.status === "cancelled" ? "bg-amber-500 dark:bg-amber-400 animate-pulse" : "bg-emerald-500 dark:bg-emerald-400 animate-pulse"}`}></span>
                    {statusLabel(train.status)}
                  </Badge>
                </div>
              ))}
            </div>
          </div>
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
                          · {fmtDuration(br.requested_duration_mins)}
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
                          const isSelected = selectedOptions[br.id] === opt.id;
                          const score = opt.priority_score;
                          const scorePct =
                            score != null
                              ? Math.max(0, Math.min(10, score)) * 10
                              : 0;
                          return (
                            <label
                              key={opt.id}
                              className={cn(
                                "relative flex-1 cursor-pointer rounded-xl border-2 p-4 text-left transition-all duration-200 sm:basis-1/3 sm:min-w-0 flex flex-col gap-3",
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

        <TabsContent value="verify" className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">
              Completed Field Work —{" "}
              {showUnverifiedOnly
                ? `${verifyLogs.filter((l) => !l.verified).length} unverified`
                : `${verifyLogs.length} total`}
            </h2>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant={showUnverifiedOnly ? "default" : "outline"}
                className="h-7 text-xs"
                onClick={() => setShowUnverifiedOnly(!showUnverifiedOnly)}
              >
                {showUnverifiedOnly ? "Unverified Only" : "All Completed Work"}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={fetchVerifyLogs}
                disabled={loadingVerify}
              >
                {loadingVerify ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
                Refresh
              </Button>
            </div>
          </div>

          {loadingVerify ? (
            Array.from({ length: 4 }).map((_, i) => (
              <Card key={i}>
                <CardHeader>
                  <Skeleton className="h-5 w-3/4" />
                  <Skeleton className="h-4 w-1/2" />
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-2 gap-4">
                    <Skeleton className="h-64 w-full rounded-xl" />
                    <Skeleton className="h-64 w-full rounded-xl" />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <Skeleton className="h-4 w-5/6" />
                    <Skeleton className="h-4 w-2/3" />
                    <Skeleton className="h-4 w-4/5" />
                    <Skeleton className="h-4 w-3/4" />
                  </div>
                </CardContent>
                <CardFooter className="flex justify-end">
                  <Skeleton className="h-8 w-28 rounded-full" />
                </CardFooter>
              </Card>
            ))
          ) : verifyLogs.filter((l) =>
              showUnverifiedOnly ? !l.verified : true,
            ).length === 0 ? (
            <Card>
              <CardContent className="py-10 text-center text-sm text-muted-foreground">
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
                const segmentName = req?.segments?.name ?? "—";
                const wt = req?.work_type ?? ("—" as BlockRequestWorkType);
                const varianceMins = computeVarianceMins(log);
                const actualMins =
                  log.actual_start && log.actual_end
                    ? Math.round(
                        (new Date(log.actual_end).getTime() -
                          new Date(log.actual_start).getTime()) /
                          60000,
                      )
                    : null;
                const verified = !!log.verified;
                const isActing = actingId === log.id;
                const varianceOver = varianceMins != null && varianceMins > 0;
                return (
                  <Card key={log.id} className="overflow-hidden">
                    <CardHeader>
                      <div className="flex items-start justify-between">
                        <div>
                          <CardTitle className="text-lg">
                            {segmentName}
                          </CardTitle>
                          <CardDescription>
                            {workTypeLabel(wt)} ·{" "}
                            {log.actual_start
                              ? fmtDateTime(log.actual_start)
                              : "—"}
                          </CardDescription>
                          {req?.work_description ? (
                            <p className="mt-1 text-sm text-muted-foreground">
                              {req.work_description}
                            </p>
                          ) : null}
                        </div>
                        <Badge
                          variant={verified ? "default" : "secondary"}
                          className={cn(
                            verified
                              ? "bg-success text-success-foreground"
                              : "bg-warning/10 text-warning",
                          )}
                        >
                          {verified ? "Verified" : "Pending verification"}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="relative grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <div className="relative">
                          <Badge
                            variant="outline"
                            className="absolute top-2 left-2 z-10 bg-background/80 text-xs font-medium backdrop-blur-sm"
                          >
                            Before
                          </Badge>
                          {log.before_image_url ? (
                            <img
                              src={log.before_image_url}
                              alt="Before"
                              className="h-64 w-full rounded-xl border border-border object-cover"
                            />
                          ) : (
                            <div className="flex h-64 w-full items-center justify-center rounded-xl border border-border text-xs text-muted-foreground">
                              No before image
                            </div>
                          )}
                        </div>
                        <div className="relative">
                          <Badge
                            variant="outline"
                            className="absolute top-2 left-2 z-10 bg-background/80 text-xs font-medium backdrop-blur-sm"
                          >
                            After
                          </Badge>
                          {log.after_image_url ? (
                            <img
                              src={log.after_image_url}
                              alt="After"
                              className="h-64 w-full rounded-xl border border-border object-cover"
                            />
                          ) : (
                            <div className="flex h-64 w-full items-center justify-center rounded-xl border border-border text-xs text-muted-foreground">
                              No after image
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
                        <div className="flex flex-col">
                          <span className="text-xs text-muted-foreground">
                            Actual Start
                          </span>
                          <span>
                            {log.actual_start
                              ? fmtDateTime(log.actual_start)
                              : "—"}
                          </span>
                        </div>
                        <div className="flex flex-col">
                          <span className="text-xs text-muted-foreground">
                            Actual End
                          </span>
                          <span>
                            {log.actual_end ? fmtDateTime(log.actual_end) : "—"}
                          </span>
                        </div>
                        <div className="flex flex-col">
                          <span className="text-xs text-muted-foreground">
                            Actual Duration
                          </span>
                          <span>
                            {actualMins != null ? fmtDuration(actualMins) : "—"}
                          </span>
                        </div>
                        <div className="flex flex-col">
                          <span className="text-xs text-muted-foreground">
                            Variance vs planned
                          </span>
                          <span
                            className={cn(
                              "inline-flex items-center gap-1 font-medium",
                              varianceOver
                                ? "text-destructive"
                                : "text-success",
                            )}
                          >
                            {varianceMins != null && !varianceOver ? (
                              <TrendingDown className="h-4 w-4" />
                            ) : null}
                            {varianceMins != null && varianceOver ? (
                              <TrendingUp className="h-4 w-4" />
                            ) : null}
                            {varianceMins != null
                              ? fmtVarianceMins(varianceMins)
                              : "—"}
                          </span>
                        </div>
                      </div>
                    </CardContent>
                    <CardFooter className="flex justify-end border-t border-border bg-muted/30 px-6 py-3">
                      {verified ? (
                        <Badge className="bg-success text-success-foreground">
                          <CheckCircle className="h-4 w-4" />
                          <span className="ml-1">Verified</span>
                        </Badge>
                      ) : (
                        <Button
                          size="sm"
                          variant="default"
                          className="bg-success text-success-foreground hover:bg-success/90"
                          onClick={() => handleMarkVerified(log)}
                          disabled={isActing || !user}
                        >
                          {isActing ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Check className="h-4 w-4" />
                          )}
                          <span className="ml-1">
                            {isActing ? "Marking…" : "Mark Verified"}
                          </span>
                        </Button>
                      )}
                    </CardFooter>
                  </Card>
                );
              })
          )}
        </TabsContent>

        <TabsContent value="horizons" className="space-y-3">
          <div className="p-4 border rounded-lg">Horizon Review - temp disabled</div>
        </TabsContent>
        <TabsContent value="corridor" className="space-y-3">
          <div className="p-4 border rounded-lg">Corridor Availability - temp disabled</div>
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
              {modifyConfirmTarget?.segments?.name
                ? ` on Segment ${modifyConfirmTarget.segments.name}`
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
                if (modifyConfirmTarget) {
                  openModify(modifyConfirmTarget);
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
