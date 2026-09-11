"use client"

import { createClient } from "@/lib/supabase/client"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { toast } from "sonner"
import { useEffect, useState } from "react"
import { ChevronDown, ChevronUp, Loader2, RefreshCw, ShieldAlert, AlertTriangle, Play } from "lucide-react"
import { cn } from "@/lib/utils"
import type { BlockRequest } from "@/lib/types"

type BlockRequestRow = BlockRequest

const supabase = createClient()

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

function departmentBadge(dept: string | null | undefined) {
  const d = (dept ?? "").toUpperCase()
  switch (d) {
    case "TMS":
      return "text-blue-700 dark:text-blue-400 bg-blue-500/10 border-blue-600/20"
    case "TDMS":
      return "text-purple-700 dark:text-purple-400 bg-purple-500/10 border-purple-600/20"
    case "SMMS":
      return "text-emerald-700 dark:text-emerald-400 bg-emerald-500/10 border-emerald-600/20"
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

export default function AiPage() {
  const [requests, setRequests] = useState<BlockRequestRow[]>([])
  const [optionsByRequest, setOptionsByRequest] = useState<Record<string, PlanOption[]>>({})
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [loading, setLoading] = useState(true)
  const [reprocessing, setReprocessing] = useState<Record<string, boolean>>({})
  const [sweeping, setSweeping] = useState(false)

  const loadAll = async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from("block_requests")
      .select("*")
      .in("status", ["scored", "safety_blocked"])
      .order("priority_score", { ascending: false, nullsFirst: false })

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

  const safetyBlocked = requests.filter((r) => r.status === "safety_blocked")
  const scored = requests
    .filter((r) => r.status === "scored")
    .sort((a, b) => (b.priority_score ?? -Infinity) - (a.priority_score ?? -Infinity))

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
      <div className="flex items-center gap-2">
        <span className="text-lg font-bold text-primary">
          {opt.priority_score != null ? Math.round(opt.priority_score) : "—"}
        </span>
        {opt.delay_risk && (
          <Badge variant="outline" className={delayRiskBadge(opt.delay_risk)}>
            {opt.delay_risk}
          </Badge>
        )}
      </div>
      {opt.explanation && (
        <p className="text-sm text-muted-foreground">{opt.explanation}</p>
      )}
      {opt.is_recommended && opt.what_if_note && (
        <p className="text-sm italic text-muted-foreground border-t pt-2 mt-2">
          {opt.what_if_note}
        </p>
      )}
    </div>
  )

  const renderRequestCard = (row: BlockRequestRow, variant: "scored" | "safety_blocked") => {
    const isReprocessing = !!reprocessing[row.id]
    const tableOptions: PlanOption[] = optionsByRequest[row.id] ?? []
    const planText = row.ai_explanation

    return (
      <Card
        key={row.id}
        className={cn(
          "flex flex-col gap-3",
          variant === "safety_blocked" && "border-2 border-red-600/50"
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
                {row.department && (
                  <Badge variant="outline" className={departmentBadge(row.department)}>
                    {row.department}
                  </Badge>
                )}
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
                  <p className="text-xs font-medium text-muted-foreground mb-1">AI Explanation</p>
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
              <div className="text-right shrink-0">
                <div className="text-2xl font-bold text-primary">
                  {row.priority_score != null ? Math.round(row.priority_score) : "—"}
                </div>
                {row.delay_risk && (
                  <Badge variant="outline" className={delayRiskBadge(row.delay_risk)}>
                    {row.delay_risk}
                  </Badge>
                )}
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
                      <p className="font-medium mb-1">View AI Plan</p>
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

  const renderSkeleton = () => (
    <Skeleton className="h-40 w-full" />
  )

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">AI Priority & Scoring</h1>
          <p className="text-muted-foreground">
            Scored and safety-blocked requests. Stuck submissions are auto-processed on load.
          </p>
        </div>
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
      </div>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-40 w-full" />
          ))}
        </div>
      ) : requests.length === 0 ? (
        <Card>
          <CardContent className="pt-6">
            <p className="text-center text-muted-foreground">
              No processed block requests yet.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-8">
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
              {safetyBlocked.length > 0 && (
                <h2 className="text-sm font-semibold text-muted-foreground">
                  Scored requests
                </h2>
              )}
              {scored.map((row) => renderRequestCard(row, "scored"))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

type PlanOption = {
  id: string
  block_request_id: string
  option_label: string
  adjusted_start: string
  adjusted_duration_mins: number | null
  priority_score: number | null
  delay_risk: string | null
  is_recommended: boolean
  explanation: string | null
  what_if_note: string | null
  created_at: string
}