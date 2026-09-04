"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
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
  Separator,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui";
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
} from "recharts";
import {
  Check,
  Clock,
  RefreshCw,
  Sparkles,
  Edit,
  Loader2,
  TrainFront,
  AlertCircle,
  AlertTriangle,
} from "lucide-react";
import type {
  ApprovalDecision,
  BlockRequestStatus,
  BlockRequestWorkType,
  SafetyCriticality,
  TimetableStatus,
} from "@/lib/types";
import type { User } from "@supabase/supabase-js";

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

const POLL_INTERVAL_MS = 15_000;
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
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
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

function delayRiskKey(risk: string | null): "low" | "medium" | "high" | "critical" | "none" {
  if (!risk) return "none";
  const r = risk.toLowerCase().trim();
  if (r.includes("low") || r.includes("minor") || r === "l") return "low";
  if (r.includes("medium") || r.includes("moderate") || r === "m") return "medium";
  if (r.includes("critical") || r.includes("severe")) return "critical";
  if (r.includes("high") || r.includes("major") || r === "h") return "high";
  return "none";
}

function delayRiskLabel(risk: string | null): string {
  if (!risk) return "Unknown";
  return risk.charAt(0).toUpperCase() + risk.slice(1);
}

const DELAY_RISK_BADGE: Record<NonNullable<ReturnType<typeof delayRiskKey>>, { variant: "default" | "secondary" | "destructive" | "outline" | "ghost" | "link"; label: string }> = {
  low: { variant: "default", label: "Low" },
  medium: { variant: "secondary", label: "Medium" },
  high: { variant: "destructive", label: "High" },
  critical: { variant: "destructive", label: "Critical" },
  none: { variant: "outline", label: "Unknown" },
};

const DELAY_RISK_ROW_CLASS: Record<NonNullable<ReturnType<typeof delayRiskKey>>, string> = {
  low: "bg-success/5",
  medium: "bg-warning/5",
  high: "bg-destructive/5",
  critical: "bg-destructive/10",
  none: "",
};

const DELAY_RISK_BORDER: Record<NonNullable<ReturnType<typeof delayRiskKey>>, string> = {
  low: "border-l-2 border-success",
  medium: "border-l-2 border-warning",
  high: "border-l-2 border-destructive",
  critical: "border-l-2 border-destructive",
  none: "border-l-2 border-border",
};

interface StatCardProps {
  title: string;
  value: string;
  icon: React.ReactNode;
  desc?: string;
}

function StatCard({ title, value, icon, desc }: StatCardProps) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        {icon}
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        {desc && (
          <CardDescription className="text-xs">{desc}</CardDescription>
        )}
      </CardContent>
    </Card>
  );
}

interface TimeSavedAnalyticsProps {
  approvedCount: number;
  avgMs: number;
  sessionStart: number;
}

function TimeSavedAnalytics({
  approvedCount,
  avgMs,
  sessionStart,
}: TimeSavedAnalyticsProps) {
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

  return (
    <section className="mt-6 space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Time Saved Analytics
          </CardTitle>
          <CardDescription>
            AI-assisted average order processing time vs. an illustrative manual
            baseline. Manual baseline is a reference figure, not live data.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-[280px] w-full">
            <ResponsiveContainer>
              <BarChart data={chartData} margin={{ top: 8, right: 0, left: 0, bottom: 0 }}>
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
                  formatter={(v) => [`${Number(v ?? 0).toFixed(1)} min`, "Processing time"]}
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
            Manual baseline (18 min) is illustrative; no live manual-process data
            is tracked. AI-assisted value reflects the average approval time this
            session (started {new Date(sessionStart).toLocaleTimeString()}).
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
  const supabaseRef = useRef<ReturnType<typeof createClient>>();
  if (!supabaseRef.current) supabaseRef.current = createClient();
  const supabase = supabaseRef.current;

  const [user, setUser] = useState<User | null>(null);

  const [timetable, setTimetable] = useState<TimetableRow[]>([]);
  const [loadingTimetable, setLoadingTimetable] = useState(true);
  const [pending, setPending] = useState<BlockRequestRow[]>([]);
  const [loadingPending, setLoadingPending] = useState(true);
  const [approvals, setApprovals] = useState<ApprovalRow[]>([]);
  const [loadingApprovals, setLoadingApprovals] = useState(true);

  const [refreshing, setRefreshing] = useState(false);
  const [actingId, setActingId] = useState<string | null>(null);
  const [confirmApproveOpen, setConfirmApproveOpen] = useState(false);
  const [approveTarget, setApproveTarget] = useState<BlockRequestRow | null>(null);
  const [confirmModifyOpen, setConfirmModifyOpen] = useState(false);
  const [modifyConfirmTarget, setModifyConfirmTarget] = useState<BlockRequestRow | null>(null);
  const [modifyOpen, setModifyOpen] = useState(false);
  const [modifyTarget, setModifyTarget] = useState<BlockRequestRow | null>(null);
  const [modifyStart, setModifyStart] = useState("");
  const [modifyDuration, setModifyDuration] = useState("");
  const [submitting, setSubmitting] = useState(false);

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
    const { data, error } = await supabase
      .from("block_requests")
      .select("*, segments(name)")
      .eq("status", "scored" as BlockRequestStatus)
      .order("priority_score", { ascending: false, nullsFirst: false });
    if (error) {
      toast.error("Failed to load pending plans", { description: error.message });
      setPending([]);
    } else {
      setPending((data as BlockRequestRow[]) ?? []);
    }
    setLoadingPending(false);
  }, [supabase]);

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
    const id = setInterval(() => {
      fetchTimetable();
    }, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [fetchTimetable, fetchPending]);

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

  async function handleApprove(br: BlockRequestRow) {
    setActingId(br.id);
    const { error } = await supabase.from("approvals").insert({
      block_request_id: br.id,
      officer_id: user?.id ?? null,
      decision: "approved" as ApprovalDecision,
      decided_at: new Date().toISOString(),
    });
    if (error) {
      toast.error("Failed to approve", { description: error.message });
      setActingId(null);
      return;
    }
    const { error: updErr } = await supabase
      .from("block_requests")
      .update({ status: "approved" as BlockRequestStatus })
      .eq("id", br.id);
    if (updErr) {
      toast.error("Failed to update block request", {
        description: updErr.message,
      });
      setActingId(null);
      return;
    }
    toast.success("Request approved", {
      description: `Block request #${br.id.slice(0, 8)} approved.`,
    });
    setPending((prev) => prev.filter((r) => r.id !== br.id));
    fetchApprovals();
  }

  function openModify(br: BlockRequestRow) {
    setModifyTarget(br);
    setModifyStart(fmtDateTimeLocal(br.requested_start));
    setModifyDuration(String(br.requested_duration_mins));
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
        <TabsList>
          <TabsTrigger value="timetable">Timetable</TabsTrigger>
          <TabsTrigger value="pending">Pending Plans</TabsTrigger>
        </TabsList>

        <TabsContent value="timetable" className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">Live Timetable</h2>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-500 opacity-75"></span>
                <span className="relative inline-flex h-2 w-2 rounded-full bg-green-500"></span>
              </span>
              <span>Live</span>
              <Separator orientation="vertical" className="h-3" />
              <span>Auto-refreshes every 15s</span>
              <Separator orientation="vertical" className="h-3" />
              <span>
                Last updated:{" "}
                {new Date().toLocaleTimeString(undefined, {
                  hour: "2-digit",
                  minute: "2-digit",
                  second: "2-digit",
                })}
              </span>
            </div>
          </div>

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
                      <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-28" /></TableCell>
                      <TableCell className="text-right"><Skeleton className="h-5 w-16" /></TableCell>
                    </TableRow>
                  ))
                ) : timetable.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="py-8 text-center text-sm text-muted-foreground">
                      <TrainFront className="mx-auto mb-2 h-6 w-6" />
                      No timetable entries. Hit "Refresh Live Timetable" to seed the feed.
                    </TableCell>
                  </TableRow>
                ) : (
                  timetable.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="font-mono">{row.train_number}</TableCell>
                      <TableCell>{row.segments?.name ?? "—"}</TableCell>
                      <TableCell>{fmtDateTime(row.scheduled_time)}</TableCell>
                      <TableCell className="text-right">
                        <Badge variant={statusVariant(row.status)} className="capitalize">
                          {statusLabel(row.status)}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="pending" className="space-y-3">
          <h2 className="text-sm font-semibold">
            AI-Scored Block Requests ({pending.length} pending)
          </h2>
          <div className="rounded-md border">
              <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Segment</TableHead>
                  <TableHead>Start</TableHead>
                  <TableHead className="text-right">Duration</TableHead>
                  <TableHead className="text-right">Priority</TableHead>
                  <TableHead>Delay Risk</TableHead>
                  <TableHead>AI Explanation</TableHead>
                  <TableHead className="text-center">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loadingPending ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}>
                      <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                      <TableCell className="text-right"><Skeleton className="h-4 w-12" /></TableCell>
                      <TableCell className="text-right"><Skeleton className="h-5 w-10" /></TableCell>
                      <TableCell><Skeleton className="h-5 w-14" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-full" /></TableCell>
                      <TableCell className="text-center"><Skeleton className="h-8 w-20" /></TableCell>
                    </TableRow>
                  ))
                ) : pending.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={7}
                      className="py-8 text-center text-sm text-muted-foreground"
                    >
                      All scored requests have been handled. Nothing pending.
                    </TableCell>
                  </TableRow>
                ) : (
                  pending.map((br) => {
                    const riskKey = delayRiskKey(br.delay_risk);
                    const riskInfo = DELAY_RISK_BADGE[riskKey];
                    return (
                    <TableRow key={br.id} className={DELAY_RISK_ROW_CLASS[riskKey]}>
                      <TableCell className={DELAY_RISK_BORDER[riskKey]}>
                        {br.segments?.name ?? `ID ${br.id.slice(0, 8)}`}
                      </TableCell>
                      <TableCell>{fmtDateTime(br.requested_start)}</TableCell>
                      <TableCell className="text-right">{fmtDuration(br.requested_duration_mins)}</TableCell>
                      <TableCell className="text-right">
                        <Badge variant={priorityBadge(br.priority_score)} className="capitalize">
                          {priorityLabel(br.priority_score)}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={riskInfo.variant} className="capitalize">
                          {delayRiskLabel(riskInfo.label)}
                        </Badge>
                      </TableCell>
                      <TableCell className="max-w-xs">
                        <div className="flex items-start gap-1.5">
                          <Sparkles className="mt-0.5 h-4 w-4 text-primary/70 shrink-0" />
                          {br.ai_explanation ?? "No explanation provided."}
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        <div className="flex items-center justify-center gap-1.5">
                           <Button
                             size="sm"
                             variant="default"
                             className="bg-success text-success-foreground hover:bg-success/90"
                             onClick={() => {
                               setApproveTarget(br);
                               setConfirmApproveOpen(true);
                             }}
                             disabled={actingId === br.id || !user}
                           >
                            {actingId === br.id ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <Check className="h-3 w-3" />
                            )}
                            Approve
                          </Button>
                           <Button
                             size="sm"
                             variant="outline"
                             onClick={() => {
                               setModifyConfirmTarget(br);
                               setConfirmModifyOpen(true);
                             }}
                             disabled={!user}
                           >
                            <Edit className="h-3 w-3" />
                            Modify
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                    );
                  })
                )}
              </TableBody>
              </Table>
          </div>
        </TabsContent>
      </Tabs>

      {loadingApprovals && !approvals.length ? (
        <TimeSavedAnalytics
          approvedCount={0}
          avgMs={0}
          sessionStart={sessionStartRef.current}
        />
      ) : (
        <TimeSavedAnalytics
          approvedCount={approvedCount}
          avgMs={avgMs}
          sessionStart={sessionStartRef.current}
        />
      )}

      <Dialog open={modifyOpen} onOpenChange={setModifyOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Modify Block Request</DialogTitle>
            <DialogDescription>
              Adjust the proposed start time and duration. Saving records a
              "modified" approval with the new values.
            </DialogDescription>
          </DialogHeader>
          {modifyTarget && (
            <div className="space-y-4 py-2 text-sm">
              <div className="grid grid-cols-2 gap-2">
                <span className="text-muted-foreground">Segment</span>
                <span>{modifyTarget.segments?.name ?? "—"}</span>
                <span className="text-muted-foreground">Priority</span>
                <span>{priorityLabel(modifyTarget.priority_score)}</span>
                <span className="text-muted-foreground">Original start</span>
                <span>{fmtDateTime(modifyTarget.requested_start)}</span>
                <span className="text-muted-foreground">Original duration</span>
                <span>{modifyTarget.requested_duration_mins} min</span>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium leading-none" htmlFor="modify-start">
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
                <label className="text-sm font-medium leading-none" htmlFor="modify-duration">
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
          )}
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
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save modification"}
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
                : ""}?
              <br />
              This action will record an approved decision and mark the
              request as approved.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline" disabled={actingId != null}>
                Cancel
              </Button>
            </DialogClose>
            <Button
              variant="default"
              className="bg-success text-success-foreground hover:bg-success/90"
              onClick={() => {
                if (approveTarget) handleApprove(approveTarget);
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
                : ""}?
              <br />
              You will be prompted to set the new start time and duration
              before the modification is recorded.
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
