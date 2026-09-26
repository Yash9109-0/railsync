"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { useCorridor } from "@/context/CorridorContext"
import { toast } from "sonner"
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  CircularGauge,
  type GaugeColor,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Separator,
  Skeleton,
  ErrorState,
  EmptyState as UiEmptyState,
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui"
import { AsyncButton } from "@/components/ui/async-button"
import { SuccessOverlay } from "@/components/ui"
import {
  CalendarClock,
  Check,
  ClipboardList,
  RefreshCw,
  CheckCircle,
  Clock,
  HelpCircle,
  Sparkles,
  TrendingUp,
} from "lucide-react"

type HorizonType = "weekly" | "monthly"
type HorizonItemStatus = "scheduled" | "deferred"

interface HorizonRow {
  id: string
  horizon_type: HorizonType
  horizon_start: string
  horizon_end: string
  status: string | null
  projected_availability_pct: number | null
  generated_at: string
  summary_explanation: string | null
  created_at: string
  corridor_id?: number | null
}

interface BlockRequestRef {
  work_description: string | null
  segments: { name: string; corridor_id?: number | null } | null
}

interface HorizonItemRow {
  id: string
  horizon_id: string
  block_request_id: string
  assigned_date: string | null
  assigned_start_hour: number | null
  assigned_duration_mins: number | null
  priority_score: number | null
  status: HorizonItemStatus
  reason: string | null
  created_at: string
  block_requests: BlockRequestRef | null
}

const UNDATED_GROUP_KEY = "__undated__"

function cap(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1)
}

function fmtDateRange(start: string, end: string): string {
  const s = new Date(start)
  const e = new Date(end)
  if (isNaN(s.getTime()) && isNaN(e.getTime())) return "—"
  const opts: Intl.DateTimeFormatOptions = {
    year: "numeric",
    month: "short",
    day: "numeric",
  }
  return `${s.toLocaleDateString("en-US", opts)} – ${e.toLocaleDateString("en-US", opts)}`
}

function fmtDateTime(iso: string): string {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return "—"
  return d.toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  })
}

function fmtDay(dateKey: string): string {
  const parts = dateKey.split("-").map(Number)
  if (parts.length !== 3 || parts.some(Number.isNaN)) return dateKey
  const [y, m, d] = parts
  const date = new Date(Date.UTC(y, m - 1, d))
  return date.toLocaleDateString("en-US", {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
  } as Intl.DateTimeFormatOptions)
}

function fmtHour(hour: number | null): string {
  if (hour == null || Number.isNaN(Number(hour))) return "—"
  const h = Math.floor(Number(hour))
  const mm = Math.round((Number(hour) - h) * 60)
  const hh = String(h).padStart(2, "0")
  return mm === 0 ? `${hh}:00` : `${hh}:${String(mm).padStart(2, "0")}`
}

function fmtDuration(mins: number | null): string {
  const m = Number(mins)
  if (!mins || Number.isNaN(m) || m <= 0) return "—"
  const h = Math.floor(m / 60)
  const rest = Math.round(m % 60)
  return h > 0 ? `${h}h ${rest}m` : `${rest} min`
}

function fmtPct(n: number | null): string {
  if (n == null || Number.isNaN(Number(n))) return "—"
  return Number.isInteger(n) ? `${n}%` : `${n.toFixed(1)}%`
}

function availabilityColorClass(pct: number | null): GaugeColor {
  if (pct == null || Number.isNaN(Number(pct))) return "muted"
  const p = Number(pct)
  if (p >= 90) return "success"
  if (p >= 50) return "warning"
  return "destructive"
}

function fmtDateRangeShort(start: string, end: string): string {
  const s = new Date(start)
  const e = new Date(end)
  if (isNaN(s.getTime()) || isNaN(e.getTime())) return "—"
  const sameYear = s.getFullYear() === e.getFullYear()
  const sameMonth = sameYear && s.getMonth() === e.getMonth()
  const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" }
  const sStr = s.toLocaleDateString("en-US", opts)
  const eStr = e.toLocaleDateString("en-US", sameMonth ? opts : { ...opts, year: "numeric" })
  return `${sStr} – ${eStr}`
}

function horizonTypeIcon(type: HorizonType) {
  return type === "weekly" ? (
    <CalendarClock className="h-4 w-4" />
  ) : (
    <TrendingUp className="h-4 w-4" />
  )
}

function priorityTier(score: number | null): string | null {
  if (score == null || Number.isNaN(Number(score))) return null
  const s = Number(score)
  if (s >= 8) return "High"
  if (s >= 5) return "Medium"
  return "Low"
}

const HORIZON_TYPE_BADGE: Record<HorizonType, "default" | "secondary" | "destructive" | "outline" | "success" | "warning"> = {
  weekly: "default",
  monthly: "success",
}

const ITEM_STATUS_BADGE: Record<HorizonItemStatus, "default" | "secondary" | "destructive" | "outline" | "success" | "warning"> = {
  scheduled: "default",
  deferred: "warning",
}

function itemStatusBadge(status: string): { label: string; variant: "default" | "secondary" | "destructive" | "outline" | "success" | "warning" } {
  if (status === "scheduled" || status === "deferred") {
    return {
      label: cap(status),
      variant: ITEM_STATUS_BADGE[status as HorizonItemStatus],
    }
  }
  return {
    label: cap(status),
    variant: "secondary",
  }
}

interface HorizonCardProps {
  horizon: HorizonRow
  onApproved: (id: string) => void
}

function HorizonCard({ horizon, onApproved }: HorizonCardProps) {
  const supabaseRef = useRef<ReturnType<typeof createClient>>()
  if (!supabaseRef.current) supabaseRef.current = createClient()
  const supabase = supabaseRef.current

  const [items, setItems] = useState<HorizonItemRow[]>([])
  const [loadingItems, setLoadingItems] = useState(true)
  const [itemsError, setItemsError] = useState<string | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [showSuccessAnimation, setShowSuccessAnimation] = useState(false)
  const fetchItems = useCallback(async () => {
    setLoadingItems(true)
    setItemsError(null)
    const { data, error } = await supabase
      .from("block_plan_horizon_items")
      .select(
        "*, block_requests(work_description, segment_id, segments(name))",
      )
      .eq("horizon_id", horizon.id)
      .order("assigned_date", { ascending: true, nullsFirst: false })
      .order("assigned_start_hour", { ascending: true, nullsFirst: false })
    if (error) {
      toast.error("Failed to load plan items", { description: error.message })
      setItemsError(error.message)
      setItems([])
    } else {
      setItems((data as HorizonItemRow[]) ?? [])
    }
    setLoadingItems(false)
  }, [supabase, horizon.id])

  useEffect(() => {
    void fetchItems()
  }, [fetchItems])

  const scheduledItems = useMemo(
    () => items.filter((i) => i.status === "scheduled"),
    [items],
  )
  const scheduledCount = scheduledItems.length
  const scheduledSegments = useMemo(
    () =>
      new Set(
        scheduledItems.map(
          (i) => i.block_requests?.segments?.name ?? "Unassigned",
        ),
      ).size,
    [scheduledItems],
  )

  const groups = useMemo(
    () =>
      (() => {
        const byDate = new Map<string, HorizonItemRow[]>()
        for (const item of items) {
          const key = item.assigned_date ?? UNDATED_GROUP_KEY
          const arr = byDate.get(key)
          if (arr) arr.push(item)
          else byDate.set(key, [item])
        }
        const dated = Array.from(byDate.entries())
          .filter(([k]) => k !== UNDATED_GROUP_KEY)
          .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        const result: Array<{
          label: string
          dateKey: string
          items: HorizonItemRow[]
        }> = []
        for (const [k, arr] of dated) {
          result.push({ label: fmtDay(k), dateKey: k, items: arr })
        }
        const undated = byDate.get(UNDATED_GROUP_KEY)
        if (undated && undated.length > 0) {
          result.push({
            label: "Unscheduled (Deferred)",
            dateKey: UNDATED_GROUP_KEY,
            items: undated,
          })
        }
        return result
      })(),
    [items],
  )

  function requestedStartFor(item: HorizonItemRow): string {
    if (!item.assigned_date || item.assigned_start_hour == null) {
      return new Date().toISOString()
    }
    const parts = item.assigned_date.split("-").map(Number)
    if (parts.length !== 3 || parts.some(Number.isNaN)) {
      return new Date().toISOString()
    }
    const [y, m, d] = parts
    const ms =
      Date.UTC(y, m - 1, d) + Number(item.assigned_start_hour) * 3_600_000
    return new Date(ms).toISOString()
  }

  const handleApprove = async () => {
    if (scheduledCount === 0) {
      toast.info("Nothing scheduled to approve for this plan.")
      return
    }
    const { data: userData } = await supabase.auth.getUser()
    const officerId = userData.user?.id ?? null

    for (const item of scheduledItems) {
      const requestedStart = requestedStartFor(item)
      const duration = Number(item.assigned_duration_mins ?? 0)

      const { error: apprErr } = await supabase.from("approvals").insert({
        block_request_id: item.block_request_id,
        officer_id: officerId,
        decision: "approved" as const,
        modified_start: requestedStart,
        modified_duration_mins: duration,
        decided_at: new Date().toISOString(),
      })
      if (apprErr) throw apprErr

      const { error: brErr } = await supabase
        .from("block_requests")
        .update({
          status: "approved" as const,
          requested_start: requestedStart,
          requested_duration_mins: duration,
        })
        .eq("id", item.block_request_id)
      if (brErr) throw brErr
    }

    const { error: hErr } = await supabase
      .from("block_plan_horizons")
      .update({ status: "approved" as const })
      .eq("id", horizon.id)
    if (hErr) throw hErr

    setShowSuccessAnimation(true)
    await new Promise((r) => setTimeout(r, 1200))
    toast.success("Plan approved", {
      description: `Approved ${scheduledCount} request${scheduledCount === 1 ? "" : "s"} and advanced the plan to approved status.`,
    })
    setShowSuccessAnimation(false)
    onApproved(horizon.id)
  }

  const statusBadge = itemStatusBadge(horizon.status ?? "")
  const availColor = availabilityColorClass(horizon.projected_availability_pct)

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Badge variant={HORIZON_TYPE_BADGE[horizon.horizon_type]}>
                {cap(horizon.horizon_type)}
              </Badge>
              <CalendarClock className="h-4 w-4 text-muted-foreground" />
              {fmtDateRange(horizon.horizon_start, horizon.horizon_end)}
              <Badge variant={statusBadge.variant}>{statusBadge.label}</Badge>
            </CardTitle>
            <CardDescription className="max-w-[65ch]">
              {horizon.summary_explanation ?? "No plan narrative available."}
            </CardDescription>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
              <span>Generated {fmtDateTime(horizon.generated_at)}</span>
              <Separator orientation="vertical" className="h-3" />
              <span>
                {scheduledCount} scheduled · {items.length - scheduledCount} deferred
              </span>
              <Separator orientation="vertical" className="h-3" />
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="flex items-center gap-1">
                    Availability goal met:{" "}
                    {horizon.projected_availability_pct != null
                      ? `${Math.round(horizon.projected_availability_pct)}%`
                      : "—"}
                    <HelpCircle className="h-3 w-3" aria-hidden="true" />
                  </span>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-xs">
                  <p className="text-xs">
                    Projected percentage of track time available for passenger trains after scheduling maintenance blocks. Higher is better.
                  </p>
                </TooltipContent>
              </Tooltip>
            </div>
          </div>
          <div className="mt-2 text-right sm:mt-0">
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="text-3xl font-semibold tabular-nums flex items-baseline gap-1">
                  {fmtPct(horizon.projected_availability_pct)}
                  <HelpCircle className="h-5 w-5 text-muted-foreground/50 hover:text-muted-foreground cursor-help" aria-hidden="true" />
                </div>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-xs">
                <p className="text-xs">
                  Projected percentage of track time available for passenger trains after scheduling maintenance blocks. Higher is better.
                </p>
              </TooltipContent>
            </Tooltip>
            <p className="text-xs text-muted-foreground">
              Projected availability
            </p>
          </div>
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge className={HORIZON_TYPE_BADGE[horizon.horizon_type]}>
              {horizonTypeIcon(horizon.horizon_type)}
              {cap(horizon.horizon_type)}
            </Badge>
            <Badge className={statusBadge.className}>{statusBadge.label}</Badge>
            <span className="text-sm font-medium text-muted-foreground">
              {fmtDateRangeShort(horizon.horizon_start, horizon.horizon_end)}
            </span>
          </div>
          <Tooltip>
              <TooltipTrigger asChild>
                <CircularGauge
                  value={horizon.projected_availability_pct}
                  size={84}
                  strokeWidth={7}
                  label="Projected availability"
                  color={availColor}
                />
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-xs">
                <p className="text-xs">
                  Projected percentage of track time available for passenger trains after scheduling maintenance blocks. Higher is better.
                </p>
              </TooltipContent>
            </Tooltip>
        </div>

        <div className="mt-3 flex items-start gap-2 rounded-lg border bg-muted/40 p-3">
          <Sparkles className="mt-1 h-4 w-4 text-primary/70 shrink-0" />
          <p className="text-sm text-muted-foreground leading-relaxed">
            {horizon.summary_explanation ?? "No plan narrative available."}
          </p>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <Clock className="h-3 w-3" />
            Generated {fmtDateTime(horizon.generated_at)}
          </span>
          <Separator orientation="vertical" className="h-3" />
          <span>
            {scheduledCount} scheduled · {items.length - scheduledCount} deferred
          </span>
        </div>
        </div>
      </CardHeader>

        <CardContent className="space-y-4">
          {itemsError ? (
            <ErrorState
              onRetry={fetchItems}
              message={itemsError}
              className="border-none bg-transparent"
            />
          ) : loadingItems ? (
            <div className="space-y-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="space-y-2">
                  <Skeleton className="h-4 w-1/3" />
                  <Skeleton className="h-10 w-full" />
                </div>
              ))}
            </div>
          ) : groups.length === 0 ? (
            <UiEmptyState
              icon={ClipboardList}
              title="No items in this plan"
              description="This plan does not contain any scheduled or deferred requests."
            />
          ) : (
          <div className="space-y-4">
            {groups.map((group) => (
              <div key={group.dateKey}>
                <div className="sticky top-0 mb-1 rounded-md bg-muted/50 px-2 py-2 text-xs font-semibold text-muted-foreground">
                  {group.label} ·{" "}
                  {group.items.length} request
                  {group.items.length === 1 ? "" : "s"}
                </div>
                <div className="space-y-1">
                  {group.items.map((item) => {
                    const request = item.block_requests
                    const segmentName = request?.segments?.name
                    const badge = itemStatusBadge(item.status)
                    const priority = priorityTier(item.priority_score)
                    return (
                      <div
                        key={item.id}
                        className="grid grid-cols-1 items-end gap-2 border-b py-2 last:border-0 sm:grid-cols-12 sm:gap-3"
                      >
                        <div className="sm:col-span-5 min-w-0">
                          <div className="font-medium leading-tight">
                            {segmentName ??
                              `Req #${item.block_request_id.slice(0, 8)}`}
                          </div>
                          {request?.work_description ? (
                            <p
                              className="truncate text-sm text-muted-foreground"
                              title={request.work_description}
                            >
                              {request.work_description}
                            </p>
                          ) : (
                            <p className="text-sm text-muted-foreground">—</p>
                          )}
                        </div>
                        <div className="sm:col-span-2">
                          <span className="block text-xs text-muted-foreground">
                            Start (hour)
                          </span>
                          <span className="text-sm font-medium">
                            {fmtHour(item.assigned_start_hour)}
                          </span>
                        </div>
                        <div className="sm:col-span-2">
                          <span className="block text-xs text-muted-foreground">
                            Duration
                          </span>
                          <span className="text-sm font-medium">
                            {fmtDuration(item.assigned_duration_mins)}
                          </span>
                        </div>
                        <div className="sm:col-span-1">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <div className="flex flex-col gap-1">
                                <span className="block text-xs text-muted-foreground flex items-center gap-1">
                                  Priority
                                  <HelpCircle className="h-3 w-3" aria-hidden="true" />
                                </span>
                                <span className="text-sm font-medium">
                                  {item.priority_score != null
                                    ? item.priority_score.toFixed(1)
                                    : "—"}
                                  {priority ? (
                                    <Badge variant="outline" className="ml-1">
                                      {priority}
                                    </Badge>
                                  ) : null}
                                </span>
                              </div>
                            </TooltipTrigger>
                            <TooltipContent side="top" className="max-w-xs">
                              <p className="text-xs">
                                Calculated by our AI model from safety criticality, traffic density, and urgency detected in the work description.
                              </p>
                            </TooltipContent>
                          </Tooltip>
                        </div>
                        <div className="sm:col-span-2 flex flex-col items-end gap-1">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Badge variant={badge.variant} className={cn("flex items-center gap-1")}>
                                {badge.label}
                                <HelpCircle className="h-3 w-3" aria-hidden="true" />
                              </Badge>
                            </TooltipTrigger>
                            <TooltipContent side="top" className="max-w-xs">
                              <p className="text-xs">
                                Scheduled: assigned a date and time. Deferred: could not fit within segment capacity during optimization.
                              </p>
                            </TooltipContent>
                          </Tooltip>
                          {item.reason && item.status === "deferred" ? (
                            <p className="max-w-xs break-words text-right text-xs text-muted-foreground">
                              {item.reason}
                            </p>
                          ) : null}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
          )}
      </CardContent>

      <CardFooter className="flex justify-end gap-2 border-t px-6 py-4">
        <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
          <DialogTrigger asChild>
            <Button
              className="bg-success text-success-foreground hover:bg-success/90"
              disabled={scheduledCount === 0}
            >
              <Check className="h-4 w-4" />
              <span className="ml-1">
                Approve {scheduledCount} Plan{scheduledCount === 1 ? "" : "s"}
              </span>
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                Approve this entire {cap(horizon.horizon_type)} plan covering{" "}
                {scheduledCount} request{scheduledCount === 1 ? "" : "s"}?
                Approve this entire {cap(horizon.horizon_type)} plan?
              </DialogTitle>
              <DialogDescription>
                This records an approval for each scheduled request — setting its
                start and duration to the assigned slot — and advances the plan to
                approved status. Deferred requests are left unscheduled.
              </DialogDescription>
            </DialogHeader>
              {scheduledCount > 0 ? (
                <div className="mt-3 flex items-center gap-2 rounded-md border bg-muted/40 px-3 py-3 text-sm">
                  <CheckCircle className="h-4 w-4 text-success shrink-0" />
                  <span>
                    <span className="font-medium text-foreground">{scheduledCount}</span> scheduled across{" "}
                    <span className="font-medium text-foreground">{scheduledSegments}</span> segment
                    {scheduledSegments === 1 ? "" : "s"}
                  </span>
                </div>
              ) : null}
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setConfirmOpen(false)}
              >
                Cancel
              </Button>
              <AsyncButton
                className="bg-success text-success-foreground hover:bg-success/90"
                onClick={async () => {
                  setConfirmOpen(false)
                  await handleApprove()
                }}
                disabled={scheduledCount === 0}
                errorMessage="Failed to approve plan"
                icon={<Check className="h-4 w-4" />}
              >
                Approve All
              </AsyncButton>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <SuccessOverlay
          open={showSuccessAnimation}
          onClose={() => setShowSuccessAnimation(false)}
          message="Plan approved"
        />

      </CardFooter>
    </Card>
  )
}

function useSupabase() {
  const supabaseRef = useRef<ReturnType<typeof createClient>>()
  if (!supabaseRef.current) supabaseRef.current = createClient()
  return supabaseRef.current
}

function EmptyState() {
  return (
    <Card>
      <CardContent className="py-12 text-center text-sm text-muted-foreground">
        <ClipboardList className="mx-auto mb-3 h-8 w-8 opacity-60" />
        <p className="font-medium">No draft horizon plans pending review.</p>
        <p className="mt-1">
          Generate a weekly/monthly horizon plan, then approve ready plans from
          here.
        </p>
      </CardContent>
    </Card>
  )
}

function HorizonListSkeleton() {
  return (
    <div className="space-y-6">
      {Array.from({ length: 3 }).map((_, i) => (
        <Card key={i}>
          <CardHeader>
            <div className="flex items-center justify-between">
              <Skeleton className="h-6 w-1/2" />
              <Skeleton className="h-6 w-20" />
            </div>
            <Skeleton className="mt-2 h-4 w-3/4" />
            <Skeleton className="mt-1 h-4 w-1/2" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-48 w-full" />
          </CardContent>
          <CardFooter className="flex justify-end">
            <Skeleton className="h-8 w-36" />
          </CardFooter>
        </Card>
      ))}
    </div>
  )
}

export default function HorizonPlanReview() {
  const supabase = useSupabase()
  const { selectedCorridorId } = useCorridor()

  const [horizons, setHorizons] = useState<HorizonRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)

  const fetchHorizons = useCallback(async () => {
    setLoading(true)
    setError(null)

    if (selectedCorridorId != null) {
      const { data: directData, error: directError } = await supabase
        .from("block_plan_horizons")
        .select("*")
        .eq("status", "draft")
        .eq("corridor_id", selectedCorridorId)
        .order("generated_at", { ascending: false })

      if (!directError) {
        setHorizons((directData as HorizonRow[]) ?? [])
      } else {
        setError(directError.message)
        const { data: segmentData, error: segmentError } = await supabase
          .from("segments")
          .select("id")
          .eq("corridor_id", selectedCorridorId)

        if (segmentError) {
          toast.error("Failed to load corridor segments", {
            description: segmentError.message,
          })
          setError(segmentError.message)
          setHorizons([])
        } else {
          const corridorSegmentIds = new Set(
            (segmentData ?? []).map((s: { id: number }) => s.id),
          )

          if (corridorSegmentIds.size === 0) {
            setHorizons([])
          } else {
            const { data: nestedData, error: fallbackError } = await supabase
              .from("block_plan_horizons")
              .select(
                "*, block_plan_horizon_items(block_request_id, block_requests(segments(corridor_id)))",
              )
              .eq("status", "draft")
              .order("generated_at", { ascending: false })

            if (fallbackError) {
              toast.error("Failed to load horizon plans", {
                description: fallbackError.message,
              })
              setError(fallbackError.message)
              setHorizons([])
            } else {
              const filtered = (nestedData ?? [])
                .filter((horizon: any) =>
                  (horizon.block_plan_horizon_items ?? []).some(
                    (item: any) => {
                      const seg = item.block_requests?.segments
                      return (
                        seg?.corridor_id !== undefined &&
                        corridorSegmentIds.has(seg?.corridor_id as number)
                      )
                    },
                  ),
                )
                .map((horizon: any) => {
                  const rest = { ...horizon }
                  delete rest.block_plan_horizon_items
                  return rest as HorizonRow
                })

              setHorizons(filtered)
            }
          }
        }
      }
    } else {
      const { data, error } = await supabase
        .from("block_plan_horizons")
        .select("*")
        .eq("status", "draft")
        .order("generated_at", { ascending: false })

      if (error) {
        toast.error("Failed to load horizon plans", {
          description: error.message,
        })
        setError(error.message)
        setHorizons([])
      } else {
        setHorizons((data as HorizonRow[]) ?? [])
      }
    }

    setLoading(false)
  }, [supabase, selectedCorridorId])

  useEffect(() => {
    void fetchHorizons()
  }, [fetchHorizons])

  async function handleRefresh() {
    setRefreshing(true)
    await fetchHorizons()
    setRefreshing(false)
  }

  function handleHorizonApproved(id: string) {
    setHorizons((prev) => prev.filter((h) => h.id !== id))
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Horizon Plan Review</h1>
          <p className="text-sm text-muted-foreground">
            Draft block plan horizons awaiting approval. Each plan schedules
            scored block requests into weekly/monthly windows while avoiding
            goods-train peaks.
          </p>
        </div>
        <AsyncButton
          variant="outline"
          size="sm"
          onClick={handleRefresh}
          disabled={refreshing || loading}
          loadingText="Refreshing…"
          successMessage="Horizon plans refreshed"
          errorMessage="Failed to refresh horizon plans"
          icon={<RefreshCw className="h-4 w-4" />}
        >
          Refresh
        </AsyncButton>
      </div>

      {error ? (
        <ErrorState onRetry={fetchHorizons} message={error} />
      ) : loading && horizons.length === 0 ? (
        <HorizonListSkeleton />
      ) : horizons.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="space-y-6">
          {horizons.map((h) => (
            <HorizonCard
              key={h.id}
              horizon={h}
              onApproved={handleHorizonApproved}
            />
          ))}
        </div>
      )}
    </div>
  )
}
