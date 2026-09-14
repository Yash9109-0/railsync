"use client"

import { createClient } from "@/lib/supabase/client"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { DashboardPageHeader } from "@/components/dashboard-page-header"
import { toast } from "sonner"
import { useEffect, useState } from "react"
import {
  AlertOctagon,
  AlertTriangle,
  CheckCircle,
  ChevronDown,
  ChevronUp,
  Clock,
  Edit,
  Gauge,
  Loader2,
  Play,
  RefreshCw,
  ShieldAlert,
  Sparkles,
  X,
} from "lucide-react"
import { cn } from "@/lib/utils"
import type { BlockRequest, PlanOption } from "@/lib/types"
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Cell,
  LabelList,
} from "recharts"

type BlockRequestRow = BlockRequest

const supabase = createClient()

const DEPARTMENTS = ["TMS", "TDMS", "SMMS"] as const

function delayRiskBadge(risk: string | null | undefined) {
  const r = (risk ?? "").toLowerCase()
  switch (r) {
    case "low":
      return "text-green-700 dark:text-green-400 bg-green-500/10 border-green-600/20"
    case "medium":
      return "text-amber-700 dark:text-amber-400 bg-amber-500/10 border-amber-600/20"
    case "high":
      return "text-red-700 dark:text-red-400 bg-red-500/10 border-red-600/20"
    default:
      return "text-muted-foreground bg-muted/50"
  }
}

const delayRiskIcon: Record<string, React.ComponentType<{ className?: string }>> = {
  low: CheckCircle,
  medium: AlertTriangle,
  high: AlertOctagon,
}

function delayRiskMeta(risk: string | null | undefined) {
  const r = (risk ?? "").toLowerCase()
  return {
    icon: (delayRiskIcon[r] ?? AlertTriangle) as React.ComponentType<{ className?: string }>,
    label: r ? r.charAt(0).toUpperCase() + r.slice(1) : "",
    className: delayRiskBadge(risk),
  }
}

function departmentPill(dept: string | null | undefined) {
  const d = (dept ?? "").toUpperCase()
  switch (d) {
    case "TMS":
      return "bg-blue-500/15 text-blue-700 dark:text-blue-300 border border-blue-500/20"
    case "TDMS":
      return "bg-teal-500/15 text-teal-700 dark:text-teal-300 border border-teal-500/20"
    case "SMMS":
      return "bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 border border-indigo-500/20"
    default:
      return "bg-muted/50 text-muted-foreground border border-border"
  }
}

function safetyBadge(criticality: string | null | undefined) {
  const c = (criticality ?? "").toLowerCase()
  switch (c) {
    case "critical":
    case "safety_critical":
      return "text-red-700 dark:text-red-400 bg-red-500/10 border-red-600/20"
    case "urgent":
    case "high":
      return "text-orange-700 dark:text-orange-400 bg-orange-500/10 border-orange-600/20"
    case "medium":
      return "text-amber-700 dark:text-amber-400 bg-amber-500/10 border-amber-600/20"
    case "low":
    case "routine":
      return "text-green-700 dark:text-green-400 bg-green-500/10 border-green-600/20"
    default:
      return "text-muted-foreground bg-muted/50"
  }
}

function formatDateTime(value: string) {
  const parsed = Date.parse(value)
  if (Number.isNaN(parsed)) return value
  return new Date(parsed).toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  })
}

function StatCard({
  title,
  value,
  icon,
}: {
  title: string
  value: string | number
  icon: React.ReactNode
}) {
  return (
    <Card className="border border-border bg-card/50 transition-shadow duration-200 hover:shadow-md">
      <CardContent className="pt-5">
        <div className="flex items-center gap-3">
          {icon}
          <span className="text-3xl font-bold tabular-nums">{value}</span>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">{title}</p>
      </CardContent>
    </Card>
  )
}

function PriorityRing({ score }: { score: number | null }) {
  const value = score == null ? 0 : Math.min(100, Math.max(0, Math.round(score)))
  const radius = 14
  const circumference = 2 * Math.PI * radius
  const offset = circumference - (value / 100) * circumference
  const ringColor =
    value < 40 ? "stroke-green-500" : value < 70 ? "stroke-amber-500" : "stroke-red-500"

  return (
    <div className="relative h-11 w-11">
      <svg width={44} height={44} viewBox="0 0 44 44">
        <circle
          cx={22}
          cy={22}
          r={radius}
          fill="none"
          strokeWidth={3.5}
          className="stroke-muted-300 dark:stroke-muted-700"
        />
        <circle
          cx={22}
          cy={22}
          r={radius}
          fill="none"
          strokeWidth={3.5}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className={cn(ringColor, "transition-all duration-500")}
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-xs font-bold">
        {score == null ? "—" : value}
      </span>
    </div>
  )
}

function AiLabel() {
  return (
    <div className="mb-1 flex items-center gap-1.5">
      <Sparkles className="h-3 w-3 text-[#960DF2]" aria-hidden="true" />
      <span className="text-xs font-medium text-muted-foreground">AI Explanation</span>
    </div>
  )
}

type FeatureImportance = {
  feature: string
  importance: number
}

const PURPLE_SHADES = [
  "hsl(268 95% 50%)",
  "hsl(268 90% 62%)",
  "hsl(268 85% 70%)",
  "hsl(268 80% 78%)",
  "hsl(268 75% 84%)",
]

const CHART_TOOLTIP_STYLE: Record<string, string> = {
  backgroundColor: "hsl(var(--popover))",
  color: "hsl(var(--popover-foreground))",
  border: "1px solid hsl(var(--border))",
}

function FeatureImportanceSection() {
  const [open, setOpen] = useState(false)
  const [data, setData] = useState<FeatureImportance[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [available, setAvailable] = useState<boolean | null>(null)

  useEffect(() => {
    if (!open || available !== null) return

    let cancelled = false
    setLoading(true)

    fetch("/api/feature-importance", { cache: "no-store" })
      .then(async (res) => {
        if (cancelled) return
        if (!res.ok) {
          setAvailable(false)
          return
        }
        const json = await res.json()
        setAvailable(true)

        const raw = Array.isArray(json)
          ? json
          : json.feature_importance ?? json.features ?? []

        const items: FeatureImportance[] = Array.isArray(raw)
          ? raw
              .map((i: any) => ({
                feature: i.feature ?? i.name ?? i.feature_name ?? "Unknown",
                importance: Number(i.importance ?? i.importance_score ?? i.value ?? 0),
              }))
              .sort((a, b) => b.importance - a.importance)
          : []

        if (cancelled) return
        if (items.length > 0) {
          setData(items)
        } else {
          setAvailable(false)
        }
      })
      .catch(() => {
        if (cancelled) return
        setAvailable(false)
      })
      .finally(() => {
        if (cancelled) return
        setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [open, available])

  if (!open) {
    return (
      <Card className="border border-border bg-card/50">
        <CardContent className="pt-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setOpen(true)}
            className="px-2 text-sm"
          >
            <ChevronDown className="h-4 w-4 mr-1" />
            How does the AI decide priority?
          </Button>
          <p className="text-xs text-muted-foreground">
            Feature importance for the priority-scoring model.
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="border border-border bg-card/50">
      <CardContent className="pt-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-[#960DF2]" />
            <span className="text-sm font-semibold">How does the AI decide priority?</span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setOpen(false)}
            className="px-2"
          >
            <ChevronUp className="h-4 w-4" />
          </Button>
        </div>

        {loading ? (
          <div className="mt-3 space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-6 w-full" />
            ))}
          </div>
        ) : !available ? (
          <div className="mt-3 rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
            <p className="font-medium">Feature importance not available</p>
            <p className="mt-1">
              The ML API does not yet expose a <code className="text-xs">/feature-importance</code>{" "}
              endpoint. This is a stretch goal for the team — once the Railsync-ML service
              adds that endpoint, this chart will render automatically.
            </p>
          </div>
        ) : data && data.length > 0 ? (
          <div className="mt-2 h-[280px] w-full">
            <ResponsiveContainer>
              <BarChart
                layout="vertical"
                data={data}
                margin={{ top: 8, right: 8, left: 20, bottom: 8 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  vertical={false}
                  stroke="hsl(var(--border))"
                />
                <XAxis
                  type="number"
                  tickLine={false}
                  axisLine={false}
                  tick={{
                    fontSize: 11,
                    fill: "hsl(var(--muted-foreground))",
                  }}
                  tickFormatter={(v) => `${Number((v as number) * 100).toFixed(0)}%`}
                />
                <YAxis
                  dataKey="feature"
                  type="category"
                  tickLine={false}
                  axisLine={false}
                  tick={{
                    fontSize: 11,
                    fill: "hsl(var(--muted-foreground))",
                  }}
                   width={140}
                   reversed
                 />
                <Tooltip
                  cursor={false}
                  contentStyle={CHART_TOOLTIP_STYLE}
                  formatter={(v) => [
                    `${Number((v as number) * 100).toFixed(1)}%`,
                    "Importance",
                  ]}
                />
                <Bar
                  dataKey="importance"
                  radius={[0, 8, 8, 0]}
                >
                  {data.map((_, i) => (
                    <Cell
                      key={`fi-cell-${i}`}
                      fill={PURPLE_SHADES[i % PURPLE_SHADES.length]}
                    />
                  ))}
                  <LabelList
                    position="right"
                    offset={6}
                    formatter={(v) => `${Number((v as number) * 100).toFixed(1)}%`}
                  />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <p className="mt-2 text-sm text-muted-foreground">No feature data available.</p>
        )}
      </CardContent>
    </Card>
  )
}

export default function ScoredRequestsBoard() {
  const [requests, setRequests] = useState<BlockRequestRow[]>([])
  const [optionsByRequest, setOptionsByRequest] = useState<Record<string, PlanOption[]>>({})
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [loading, setLoading] = useState(true)
  const [reprocessing, setReprocessing] = useState<Record<string, boolean>>({})
  const [sweeping, setSweeping] = useState(false)
  const [processing, setProcessing] = useState<Record<string, boolean>>({})

  const [departmentFilter, setDepartmentFilter] = useState("all")
  const [sortBy, setSortBy] = useState<"priority_score" | "created_at">("priority_score")

  const loadAll = async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from("block_requests")
      .select("*")
      .in("status", ["submitted", "pending", "scored", "safety_blocked"])
      .order("created_at", { ascending: false })

    if (error) {
      toast.error("Failed to load block requests")
      setRequests([])
      setOptionsByRequest({})
    } else {
      const rows = (data ?? []) as BlockRequestRow[]
      setRequests(rows)

      if (rows.length > 0) {
        const { data: optData, error: optError } = await supabase
          .from("block_plan_options")
          .select("*")
          .in(
            "block_request_id",
            rows.map((r) => r.id)
          )

        if (optError) {
          toast.error("Failed to load plan options")
        } else {
          const grouped: Record<string, PlanOption[]> = {}
          for (const opt of (optData ?? []) as PlanOption[]) {
            if (!grouped[opt.block_request_id]) grouped[opt.block_request_id] = []
            grouped[opt.block_request_id].push(opt)
          }
          setOptionsByRequest(grouped)
        }
      }
    }
    setLoading(false)
  }

  const processRequest = async (id: string) => {
    setProcessing((p) => ({ ...p, [id]: true }))
    try {
      const res = await fetch("/api/block-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ block_request_id: id }),
      })
      const json = await res.json()
      if (!res.ok || json.error) {
        toast.error(json.error ?? "AI processing failed")
        return
      }
      toast.success("AI analysis complete")
      await loadAll()
    } catch {
      toast.error("AI processing failed")
    } finally {
      setProcessing((p) => ({ ...p, [id]: false }))
    }
  }

  const handleApproval = async (requestId: string, decision: "approved" | "rejected" | "modified", modifiedStart?: string, modifiedDuration?: number) => {
    try {
      const { error } = await supabase.from("approvals").insert({
        block_request_id: requestId,
        decision,
        modified_start: modifiedStart ?? null,
        modified_duration_mins: modifiedDuration ?? null,
      })
      if (error) throw error

      const newStatus = decision === "approved" ? "approved" : decision === "rejected" ? "rejected" : "pending"
      await supabase.from("block_requests").update({ status: newStatus }).eq("id", requestId)

      toast.success(`Request ${decision}`)
      await loadAll()
    } catch {
      toast.error("Approval failed")
    }
  }

  const sweepStuckRequests = async (showToast = true) => {
    setSweeping(true)
    try {
      const { data: stuckRequests, error: fetchError } = await supabase
        .from("block_requests")
        .select("id")
        .eq("status", "submitted")

      if (fetchError) {
        toast.error("Failed to fetch stuck requests")
        return 0
      }

      const stuckIds = (stuckRequests ?? []).map((r) => r.id)
      if (stuckIds.length === 0) {
        if (showToast) toast.info("No stuck requests found")
        return 0
      }

      await Promise.all(
        stuckIds.map((id) =>
          fetch("/api/block-requests", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ block_request_id: id }),
          }).catch(() => null)
        )
      )

      await loadAll()

      if (showToast) {
        toast.success(`Processed ${stuckIds.length} stuck request${stuckIds.length !== 1 ? "s" : ""}`)
      }
      return stuckIds.length
    } catch {
      toast.error("Sweep failed")
      return 0
    } finally {
      setSweeping(false)
    }
  }

  useEffect(() => {
    const init = async () => {
      await loadAll()
      await sweepStuckRequests(false)
    }
    init()
  }, [])

  const handleReprocess = async (id: string) => {
    setReprocessing((p) => ({ ...p, [id]: true }))
    try {
      const res = await fetch("/api/block-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ block_request_id: id }),
      })
      const json = await res.json()
      if (!res.ok || json.error) {
        toast.error(json.error ?? "Reprocessing failed")
        return
      }
      toast.success("Reprocessed successfully")
      await loadAll()
    } catch {
      toast.error("Reprocessing failed")
    } finally {
      setReprocessing((p) => ({ ...p, [id]: false }))
    }
  }

  const filtered =
    departmentFilter === "all"
      ? requests
      : requests.filter((r) => r.department === departmentFilter)

  const safetyBlocked = filtered.filter((r) => r.status === "safety_blocked")
  const scored = filtered
    .filter((r) => r.status === "scored")
    .sort((a, b) => {
      if (sortBy === "priority_score") {
        return (b.priority_score ?? -Infinity) - (a.priority_score ?? -Infinity)
      }
      return Date.parse(b.created_at) - Date.parse(a.created_at)
    })
  const pending = filtered
    .filter((r) => r.status === "submitted" || r.status === "pending")
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))

  const scoredWithScore = scored.filter((r) => r.priority_score != null)
  const avgPriority = scoredWithScore.length
    ? scoredWithScore.reduce((sum, r) => sum + (r.priority_score as number), 0) / scoredWithScore.length
    : 0
  const highRiskCount = scored.filter((r) => (r.delay_risk ?? "").toLowerCase() === "high").length

  const toggleExpanded = (id: string) => {
    setExpanded((p) => ({ ...p, [id]: !p[id] }))
  }

  const renderOptionCard = (opt: PlanOption) => (
    <div
      key={opt.id}
      className={cn(
        "rounded-lg border p-4 space-y-3",
        opt.is_recommended && "border-2 border-[#960DF2]"
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-semibold">{opt.option_label}</span>
        {opt.is_recommended && (
          <Badge className="bg-[#960DF2] hover:bg-[#960DF2] text-white text-xs">
            Recommended
          </Badge>
        )}
      </div>
      <div className="text-sm text-muted-foreground">
        <span suppressHydrationWarning>{formatDateTime(opt.adjusted_start)}</span> ·{" "}
        {opt.adjusted_duration_mins ?? 0} min
      </div>
      <div className="flex items-center gap-2.5">
        <PriorityRing score={opt.priority_score} />
        {opt.delay_risk && <DelayRiskBadge risk={opt.delay_risk} />}
      </div>
      {opt.explanation && (
        <div className="mt-1">
          <AiLabel />
          <p className="text-xs whitespace-pre-wrap">{opt.explanation}</p>
        </div>
      )}
      {opt.is_recommended && opt.what_if_note && (
        <p className="text-sm italic text-muted-foreground border-t pt-2 mt-2">
          {opt.what_if_note}
        </p>
      )}
    </div>
  )

  function DelayRiskBadge({ risk }: { risk: string | null }) {
    const { icon: Icon, label, className } = delayRiskMeta(risk)
    if (!label) return null
    return (
      <Badge variant="outline" className={cn(className, "gap-1")}>
        <Icon className="h-3.5 w-3.5" />
        {label}
      </Badge>
    )
  }

  function DepartmentLabel({ dept }: { dept: string | null }) {
    if (!dept) return null
    return (
      <Badge variant="outline" className={cn("rounded-full px-2.5 py-0.5 text-xs font-medium", departmentPill(dept))}>
        {dept}
      </Badge>
    )
  }

  const renderRequestCard = (row: BlockRequestRow, variant: "scored" | "safety_blocked") => {
    const isReprocessing = !!reprocessing[row.id]
    const tableOptions: PlanOption[] = optionsByRequest[row.id] ?? []
    const planText = row.ai_explanation

    return (
      <Card
        key={row.id}
        className={cn(
          "border-l-2 border-[#960DF2]",
          variant === "safety_blocked" && "ring-2 ring-red-600/40"
        )}
      >
        <CardContent className="pt-6 space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-medium">{row.work_type}</span>
                <Badge variant="outline" className={safetyBadge(row.safety_criticality)}>
                  {row.safety_criticality}
                </Badge>
                <DepartmentLabel dept={row.department} />
                {variant === "safety_blocked" && (
                  <Badge
                    variant="outline"
                    className="text-red-700 dark:text-red-400 bg-red-500/10 border-red-600/20"
                  >
                    <ShieldAlert className="h-3.5 w-3.5 mr-1" />
                    Safety blocked
                  </Badge>
                )}
              </div>
              {row.work_description && (
                <p className="text-sm">{row.work_description}</p>
              )}
              {row.justification && (
                <p className="text-sm text-muted-foreground italic">
                  {row.justification}
                </p>
              )}
              {row.ai_explanation && (
                <div className="mt-2 p-3 rounded-lg bg-muted/50 border border-muted/50">
                  <div className="flex items-center gap-1.5 mb-1">
                    <Sparkles className="h-3 w-3 text-[#960DF2]" />
                    <span className="text-xs font-medium text-muted-foreground">AI Explanation</span>
                  </div>
                  <p className="text-sm whitespace-pre-wrap">{row.ai_explanation}</p>
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                Requested start:{" "}
                <span suppressHydrationWarning>{formatDateTime(row.requested_start)}</span>{" "}
                · {row.requested_duration_mins} min
              </p>
            </div>
            {variant === "scored" && (
              <div className="flex flex-col items-end gap-2 shrink-0">
                <PriorityRing score={row.priority_score} />
                {row.delay_risk && <DelayRiskBadge risk={row.delay_risk} />}
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleReprocess(row.id)}
              disabled={isReprocessing}
            >
              {isReprocessing ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                  Reprocessing...
                </>
              ) : (
                <>
                  <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                  Reprocess
                </>
              )}
            </Button>
            {variant === "scored" && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => toggleExpanded(row.id)}
                className="px-2"
              >
                {expanded[row.id] ? (
                  <>
                    <ChevronUp className="h-4 w-4 mr-1" /> Hide plan options
                  </>
                ) : (
                  <>
                    <ChevronDown className="h-4 w-4 mr-1" /> Show plan options ({tableOptions.length})
                  </>
                )}
              </Button>
            )}
          </div>

          {variant === "scored" && expanded[row.id] && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 min-h-[10rem]">
              {tableOptions.length > 0
                ? tableOptions.map(renderOptionCard)
                : planText
                ? (
                    <div className="col-span-full rounded-lg border p-4 text-sm">
                      <div className="flex items-center gap-1.5 mb-1">
                        <Sparkles className="h-3 w-3 text-[#960DF2]" />
                        <span className="text-xs font-medium text-muted-foreground">View AI Plan</span>
                      </div>
                      <p className="whitespace-pre-wrap text-muted-foreground">{planText}</p>
                    </div>
                  )
                : (
                    <div className="col-span-full rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                      <p className="font-medium">No plan options generated yet</p>
                      <p className="mt-1">
                        Plan options appear here once AI processing completes.
                      </p>
                    </div>
                  )}
            </div>
          )}
        </CardContent>
      </Card>
    )
  }

  const renderPendingCard = (row: BlockRequestRow) => {
    const isProcessing = !!processing[row.id]
    const tableOptions: PlanOption[] = optionsByRequest[row.id] ?? []
    const hasAI = tableOptions.length > 0 || row.ai_explanation

    return (
      <Card key={row.id} className="border-l-2 border-[#960DF2]">
        <CardContent className="pt-6 space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-medium">{row.work_type}</span>
                <Badge variant="outline" className={safetyBadge(row.safety_criticality)}>
                  {row.safety_criticality}
                </Badge>
                <DepartmentLabel dept={row.department} />
                <Badge variant="outline" className="text-blue-700 dark:text-blue-400 bg-blue-500/10 border-blue-600/20">
                  <Clock className="h-3.5 w-3.5 mr-1" />
                  {row.status}
                </Badge>
              </div>
              {row.work_description && (
                <p className="text-sm">{row.work_description}</p>
              )}
              {row.justification && (
                <p className="text-sm text-muted-foreground italic">
                  {row.justification}
                </p>
              )}
              {row.ai_explanation && (
                <div className="mt-2 p-3 rounded-lg bg-muted/50 border border-muted/50">
                  <div className="flex items-center gap-1.5 mb-1">
                    <Sparkles className="h-3 w-3 text-[#960DF2]" />
                    <span className="text-xs font-medium text-muted-foreground">AI Explanation</span>
                  </div>
                  <p className="text-sm whitespace-pre-wrap">{row.ai_explanation}</p>
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                Requested start:{" "}
                <span suppressHydrationWarning>{formatDateTime(row.requested_start)}</span>{" "}
                · {row.requested_duration_mins} min
              </p>
            </div>
            <div className="text-right shrink-0">
              <Badge variant="outline" className="bg-blue-500/10 text-blue-700 border-blue-200">
                Awaiting AI Analysis
              </Badge>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant={hasAI ? "outline" : "default"}
              size="sm"
              onClick={() => processRequest(row.id)}
              disabled={isProcessing}
            >
              {isProcessing ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                  Analyzing...
                </>
              ) : hasAI ? (
                <>
                  <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                  Re-analyze
                </>
              ) : (
                <>
                  <Play className="h-3.5 w-3.5 mr-1.5" />
                  Run AI Analysis
                </>
              )}
            </Button>
            {hasAI && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => toggleExpanded(row.id)}
                className="px-2"
              >
                {expanded[row.id] ? (
                  <>
                    <ChevronUp className="h-4 w-4 mr-1" /> Hide AI Options
                  </>
                ) : (
                  <>
                    <ChevronDown className="h-4 w-4 mr-1" /> Show AI Options ({tableOptions.length})
                  </>
                )}
              </Button>
            )}
          </div>

          {expanded[row.id] && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 min-h-[10rem]">
              {tableOptions.length > 0
                ? tableOptions.map(renderOptionCard)
                : row.ai_explanation
                ? (
                    <div className="col-span-full rounded-lg border p-4 text-sm">
                      <div className="flex items-center gap-1.5 mb-1">
                        <Sparkles className="h-3 w-3 text-[#960DF2]" />
                        <span className="text-xs font-medium text-muted-foreground">AI Analysis</span>
                      </div>
                      <p className="whitespace-pre-wrap text-muted-foreground">{row.ai_explanation}</p>
                    </div>
                  )
                : (
                    <div className="col-span-full rounded-lg border border-dashed p-4 text-sm text-muted-foreground text-center">
                      <p className="font-medium">No AI analysis yet</p>
                      <p className="mt-1">
                        Click "Run AI Analysis" to generate plan options with explanations and what-if scenarios.
                      </p>
                    </div>
                  )}
            </div>
          )}

          {hasAI && (
            <div className="border-t pt-4 space-y-3">
              <p className="text-sm font-medium">Approval Actions</p>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  onClick={() => handleApproval(row.id, "approved")}
                  className="bg-green-600 hover:bg-green-700"
                >
                  <CheckCircle className="h-3.5 w-3.5 mr-1.5" />
                  Approve
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleApproval(row.id, "rejected")}
                  className="border-red-600 text-red-700 hover:bg-red-50"
                >
                  <X className="h-3.5 w-3.5 mr-1.5" />
                  Reject
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleApproval(row.id, "modified")}
                  className="border-amber-600 text-amber-700 hover:bg-amber-50"
                >
                  <Edit className="h-3.5 w-3.5 mr-1.5" />
                  Modify &amp; Approve
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      <DashboardPageHeader
        icon={ShieldAlert}
        title="AI Priority & Scoring"
        description="Scored and safety-blocked requests. Stuck submissions are auto-processed on load."
        action={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => sweepStuckRequests(true)}
              disabled={sweeping || loading}
            >
              {sweeping ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                  Checking...
                </>
              ) : (
                <>
                  <AlertTriangle className="h-3.5 w-3.5 mr-1.5" />
                  Check for Stuck Requests
                </>
              )}
            </Button>
            <Button variant="outline" size="sm" onClick={loadAll} disabled={loading}>
              <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
              Refresh
            </Button>
          </div>
        }
      />

      <div className="flex flex-wrap items-center gap-3">
        <Select value={departmentFilter} onValueChange={setDepartmentFilter}>
          <SelectTrigger className="w-[180px]" size="sm">
            <SelectValue placeholder="Filter by department" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Departments</SelectItem>
            {DEPARTMENTS.map((d) => (
              <SelectItem key={d} value={d}>
                {d}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={sortBy}
          onValueChange={(v) => setSortBy(v as "priority_score" | "created_at")}
        >
          <SelectTrigger className="w-[200px]" size="sm">
            <SelectValue placeholder="Sort by" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="priority_score">Sort by Priority Score</SelectItem>
            <SelectItem value="created_at">Sort by Date (newest first)</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            title="Pending Review"
            value={pending.length}
            icon={<Clock className="h-5 w-5 text-blue-600" />}
          />
          <StatCard
            title="Avg Priority Score"
            value={scoredWithScore.length ? `${avgPriority.toFixed(1)}` : "—"}
            icon={<Gauge className="h-5 w-5 text-primary" />}
          />
          <StatCard
            title="High Risk"
            value={highRiskCount}
            icon={<AlertOctagon className="h-5 w-5 text-red-600" />}
          />
          <StatCard
            title="Safety Blocked"
            value={safetyBlocked.length}
            icon={<ShieldAlert className="h-5 w-5 text-red-600" />}
          />
        </div>
      )}

      <FeatureImportanceSection />

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-40 w-full" />
          ))}
        </div>
      ) : requests.length === 0 ? (
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col items-center justify-center gap-3 py-6 text-center">
              <ShieldAlert className="h-10 w-10 text-muted-foreground/50" />
              <p className="text-muted-foreground">
                No processed block requests yet.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-8">
          <div className="space-y-3">
            <h2 className="text-sm font-semibold text-blue-700 dark:text-blue-400 flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Pending AI Analysis ({pending.length})
            </h2>
            {pending.length > 0 ? (
              pending.map((row) => renderPendingCard(row))
            ) : (
              <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-card/30 py-12">
                <CheckCircle className="h-12 w-12 text-green-500/80" />
                <p className="text-muted-foreground">
                  All caught up — no pending requests
                </p>
              </div>
            )}
          </div>

          {safetyBlocked.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-sm font-semibold text-red-700 dark:text-red-400 flex items-center gap-2">
                <ShieldAlert className="h-4 w-4" />
                Safety blocked
              </h2>
              <div className="space-y-3 border border-red-600/50 rounded-lg p-0.5">
                {safetyBlocked.map((row) => renderRequestCard(row, "safety_blocked"))}
              </div>
            </div>
          )}

          {scored.length > 0 && (
            <div className="space-y-3">
              {(safetyBlocked.length > 0 || pending.length > 0) && (
                <h2 className="text-sm font-semibold text-muted-foreground">
                  Scored requests
                </h2>
              )}
              <div className="space-y-3">
                {scored.map((row, index) => {
                  const card = (
                    <div
                      key={row.id}
                      className="animate-in fade-in slide-in-from-bottom-2 duration-400 fill-mode-both"
                      style={{ animationDelay: `${Math.min(index * 50, 400)}ms` }}
                    >
                      {renderRequestCard(row, "scored")}
                    </div>
                  )
                  return card
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
