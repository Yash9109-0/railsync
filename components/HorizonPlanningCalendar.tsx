"use client"

import { Badge } from "@/components/ui/badge"
import { AsyncButton } from "@/components/ui/async-button"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { ErrorState } from "@/components/ui/ErrorState"
import { EmptyState } from "@/components/ui/EmptyState"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogClose,
} from "@/components/ui/dialog"
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip"
import { toast } from "sonner"
import { useEffect, useState } from "react"
import { ChevronDown, ChevronUp, CalendarDays, Calendar, HelpCircle } from "lucide-react"
import { cn } from "@/lib/utils"

type HorizonRow = {
  id: string
  horizon_type: "weekly" | "monthly"
  horizon_start: string
  horizon_end: string
  projected_availability_pct: number | null
  summary_explanation: string | null
  generated_at: string
  solver_used?: string
}

type HorizonItemRow = {
  id: string
  horizon_id: string
  block_request_id: string
  assigned_date: string | null
  assigned_start_hour: number | null
  assigned_duration_mins: number | null
  priority_score: number | null
  status: "scheduled" | "deferred"
  reason: string | null
}

type RequestInfo = {
  id: string
  work_description: string | null
  segment_name: string | null
  department: string | null
}

type CalDay = { date: Date; key: string; inMonth: boolean }

const DAY_NAMES_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]

function parseYmd(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value)
  if (match) return new Date(Date.UTC(+match[1], +match[2] - 1, +match[3]))
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function dateKey(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`
}

function dayName(date: Date): string {
  return DAY_NAMES_SHORT[date.getUTCDay()]
}

function formatDateTime(value: string) {
  const parsed = Date.parse(value)
  if (Number.isNaN(parsed)) return value
  return new Date(parsed).toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  })
}

function formatDate(value: string) {
  const parsed = Date.parse(value)
  if (Number.isNaN(parsed)) return value
  return new Date(parsed).toLocaleDateString("en-US", { dateStyle: "medium" })
}

function formatHour(hour: number | null): string {
  if (hour == null || Number.isNaN(hour)) return ""
  const h = Math.floor(hour)
  const mm = Math.round((hour - h) * 60)
  const hh = String(h).padStart(2, "0")
  return mm === 0 ? `${hh}:00` : `${hh}:${String(mm).padStart(2, "0")}`
}

function getAvailabilityColorClass(pct: number): string {
  if (pct > 80) return "text-success"
  if (pct >= 60) return "text-warning"
  return "text-destructive"
}

function chipStatusClass(status: "scheduled" | "deferred"): string {
  if (status === "scheduled") {
    return "bg-primary/10 text-primary border-primary/20 dark:bg-primary/20 dark:text-primary dark:border-primary/30"
  }
  return "bg-warning/10 text-warning border-warning/20 dark:bg-warning/20 dark:text-warning dark:border-warning/30"
}

function getHorizonTypeBadgeClass(type: "weekly" | "monthly"): "default" | "success" {
  return type === "weekly" ? "default" : "success"
}

function getStatusColorClass(status: "scheduled" | "deferred" | null | undefined): string {
  if (status === "scheduled") {
    return "text-primary"
  }
  return "text-warning"
}

function buildWeekDays(start: Date): CalDay[] {
  const days: CalDay[] = []
  for (let i = 0; i < 7; i++) {
    const d = new Date(start)
    d.setUTCDate(d.getUTCDate() + i)
    days.push({ date: d, key: dateKey(d), inMonth: true })
  }
  return days
}

function buildMonthGrid(start: Date): CalDay[][] {
  const year = start.getUTCFullYear()
  const month = start.getUTCMonth()
  const first = new Date(Date.UTC(year, month, 1))
  const last = new Date(Date.UTC(year, month + 1, 0))
  const daysInMonth = last.getUTCDate()
  const leading = first.getUTCDay()
  const trailing = (7 - ((leading + daysInMonth) % 7)) % 7
  const total = leading + daysInMonth + trailing

  const gridStart = new Date(first)
  gridStart.setUTCDate(gridStart.getUTCDate() - leading)

  const weeks: CalDay[][] = []
  for (let w = 0; w < total / 7; w++) {
    const week: CalDay[] = []
    for (let d = 0; d < 7; d++) {
      const dd = new Date(gridStart)
      dd.setUTCDate(dd.getUTCDate() + w * 7 + d)
      week.push({ date: dd, key: dateKey(dd), inMonth: dd.getUTCMonth() === month })
    }
    weeks.push(week)
  }
  return weeks
}

function AvailabilityGauge({ value }: { value: number | null }) {
  const pct = value != null ? Math.round(value) : 0
  const colorClass =
    value != null ? getAvailabilityColorClass(pct) : "text-muted-foreground/50"
  const radius = 42
  const strokeWidth = 7
  const circumference = 2 * Math.PI * radius
  const dashOffset = circumference - (pct / 100) * circumference
  const [animated, setAnimated] = useState(false)

  useEffect(() => {
    setAnimated(true)
  }, [])

  const initialOffset = animated ? dashOffset : circumference

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          className="relative h-32 w-32 flex items-center justify-center"
          role="img"
          aria-label="Availability gauge"
        >
          <svg viewBox="0 0 100 100" className="h-full w-full">
            <circle
              cx="50"
              cy="50"
              r={radius}
              fill="none"
              stroke="currentColor"
              strokeWidth={strokeWidth}
              className="text-muted-foreground/30"
            />
            <circle
              cx="50"
              cy="50"
              r={radius}
              fill="none"
              stroke="currentColor"
              strokeWidth={strokeWidth}
              strokeDasharray={circumference}
              strokeDashoffset={initialOffset}
              strokeLinecap="round"
              transform="rotate(-90 50 50)"
              className={colorClass}
              style={{ transition: "stroke-dashoffset var(--duration-slow) var(--ease-standard)" }}
            />
          </svg>
          <span className="text-2xl font-bold tracking-tight font-heading">
            {value != null ? `${pct}%` : "\u2014"}
          </span>
        </div>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-xs">
        <p className="text-xs">
          Projected percentage of track time available for passenger trains after scheduling maintenance blocks. Higher is better.
        </p>
      </TooltipContent>
    </Tooltip>
  )
}

function CalendarDayChip({
  item,
  request,
  onSelect,
  animationDelay = 0,
}: {
  item: HorizonItemRow
  request: RequestInfo | undefined
  onSelect: () => void
  animationDelay?: number
}) {
  const segmentName =
    request?.segment_name ?? `Req ${item.block_request_id.slice(0, 8)}`
  const startTime = formatHour(item.assigned_start_hour)
  const chipText = startTime ? `${segmentName} ${startTime}` : segmentName
  const workDescription = request?.work_description ?? ""
  const ariaLabel = workDescription
    ? `${chipText}. ${workDescription}`
    : chipText

  const style = animationDelay > 0 ? {
    animationDelay: `${animationDelay}ms`,
    opacity: 0, // Start invisible, animation will bring it in
  } as React.CSSProperties : undefined

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-label={ariaLabel}
      className={cn(
        "block w-full truncate rounded-full px-2 py-1 text-xs font-medium mb-1 animate-calendar-item-enter",
        chipStatusClass(item.status),
      )}
      style={style}
    >
      <span className="block w-full truncate">{chipText}</span>
    </button>
  )
}

function ItemDetailDialog({
  item,
  request,
  open,
  onOpenChange,
}: {
  item: HorizonItemRow | null
  request: RequestInfo | undefined
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  if (!item) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[90vw] max-w-sm sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Work Item Details</DialogTitle>
          <DialogDescription>
            {request?.segment_name ?? `Request ${item.block_request_id.slice(0, 8)}`}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div>
            <span className="text-xs text-muted-foreground block mb-1">Work Description</span>
            <p className="text-sm break-words">{request?.work_description ?? "—"}</p>
          </div>
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="flex justify-between items-center gap-2">
                <span className="text-xs text-muted-foreground">Priority Score</span>
                <Badge variant="outline" className="flex items-center gap-1">
                  {item.priority_score != null ? Math.round(item.priority_score) : "—"}
                  <HelpCircle className="h-3 w-3" aria-hidden="true" />
                </Badge>
              </div>
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-xs">
              <p className="text-xs">
                Calculated by our AI model from safety criticality, traffic density, and urgency detected in the work description.
              </p>
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="flex justify-between items-center gap-2">
                <span className="text-xs text-muted-foreground">Reason</span>
                <span className="text-sm text-right break-words">{item.reason ?? "—"}</span>
              </div>
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-xs">
              <p className="text-xs">
                Explanation for why this request was scheduled or deferred.
              </p>
            </TooltipContent>
          </Tooltip>
          <div className="flex justify-between">
            <span className="text-xs text-muted-foreground">Department</span>
            <span className="text-sm">{request?.department ?? "Unassigned"}</span>
          </div>
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="flex justify-between items-center gap-2">
                <span className="text-xs text-muted-foreground">Status</span>
                <Badge variant="outline" className={cn("border-0 bg-transparent px-1 py-0 font-normal text-xs flex items-center gap-1", getStatusColorClass(item.status))}>
                  {item.status}
                  <HelpCircle className="h-3 w-3" aria-hidden="true" />
                </Badge>
              </div>
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-xs">
              <p className="text-xs">
                Scheduled: assigned a date and time. Deferred: could not fit within segment capacity during optimization.
              </p>
            </TooltipContent>
          </Tooltip>
        </div>
        <DialogClose asChild>
          <Button variant="outline" className="w-full mt-4" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogClose>
      </DialogContent>
    </Dialog>
  )
}

function CalendarSkeleton({ monthly }: { monthly: boolean }) {
  const bodyCells = monthly ? 42 : 7
  return (
    <div className="grid grid-cols-7 gap-px overflow-hidden rounded-md border bg-border">
      {Array.from({ length: 7 }).map((_, i) => (
        <Skeleton key={`h-${i}`} className="h-10 w-full" />
      ))}
      {Array.from({ length: bodyCells }).map((_, i) => (
        <Skeleton key={`b-${i}`} className="h-16 w-full" />
      ))}
    </div>
  )
}

function CalendarLegend() {
  return (
    <div className="mt-4 flex gap-4 text-xs text-muted-foreground">
      <div className="flex items-center gap-2">
        <span className="h-3 w-3 rounded-full bg-primary" />
        <span>Scheduled</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="h-3 w-3 rounded-full border border-dashed border-warning" />
        <span>Deferred</span>
      </div>
    </div>
  )
}

export default function HorizonPlanningCalendar() {
  const [horizonType, setHorizonType] = useState<"weekly" | "monthly">("weekly")
  const [horizonStartDate, setHorizonStartDate] = useState(() =>
    new Date().toISOString().split("T")[0],
  )
  const [horizons, setHorizons] = useState<HorizonRow[]>([])
  const [horizonsLoading, setHorizonsLoading] = useState(false)
  const [horizonsError, setHorizonsError] = useState<string | null>(null)
  const [expandedHorizon, setExpandedHorizon] = useState<string | null>(null)
  const [horizonItems, setHorizonItems] = useState<Record<string, HorizonItemRow[]>>({})
  const [horizonItemsError, setHorizonItemsError] = useState<Record<string, string>>({})
  const [horizonRequests, setHorizonRequests] = useState<Record<string, RequestInfo>>({})
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null)
  const [justGeneratedHorizonId, setJustGeneratedHorizonId] = useState<string | null>(null)

  const loadHorizons = async () => {
    setHorizonsLoading(true)
    setHorizonsError(null)
    try {
      const res = await fetch("/api/horizons", { cache: "no-store" })
      const json = await res.json()
      if (!res.ok || json.error) {
        setHorizonsError(json.error ?? "Failed to load planning horizons")
        toast.error(json.error ?? "Failed to load planning horizons")
        setHorizons([])
      } else {
        setHorizons((json.horizons ?? []) as HorizonRow[])
      }
    } catch {
      setHorizonsError("Failed to load planning horizons")
      toast.error("Failed to load planning horizons")
      setHorizons([])
    } finally {
      setHorizonsLoading(false)
    }
  }

  const handleGeneratePlan = async () => {
    if (!horizonStartDate) return
    const res = await fetch("/api/generate-horizon-plan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        horizonType,
        startDate: new Date(horizonStartDate).toISOString(),
      }),
    })
    const json = await res.json()
    if (!res.ok || json.error) {
      throw new Error(json.error ?? "Failed to generate plan")
    }
    toast.success("Plan generated")
    // Track the newly generated horizon ID for staggered animation
    if (json.horizon?.id) {
      setJustGeneratedHorizonId(json.horizon.id)
    }
    await loadHorizons()
  }

  const loadHorizonDetails = async (id: string) => {
    try {
      const res = await fetch(`/api/horizon-items?horizonId=${id}`, { cache: "no-store" })
      const json = await res.json()
      if (!res.ok || json.error) {
        toast.error(json.error ?? "Failed to load horizon items")
        setHorizonItems((prev) => ({ ...prev, [id]: [] }))
        setHorizonItemsError((prev) => ({ ...prev, [id]: json.error ?? "Failed to load horizon items" }))
        return
      }
      const items = (json.items ?? []) as HorizonItemRow[]
      setHorizonItems((prev) => ({ ...prev, [id]: items }))
      setHorizonItemsError((prev) => {
        const next = { ...prev }
        delete next[id]
        return next
      })
      for (const r of (json.requests ?? []) as RequestInfo[]) {
        setHorizonRequests((prev) => ({ ...prev, [r.id]: r }))
      }
    } catch {
      toast.error("Failed to load horizon details")
      setHorizonItems((prev) => ({ ...prev, [id]: [] }))
      setHorizonItemsError((prev) => ({ ...prev, [id]: "Failed to load horizon details" }))
    }
  }

  const toggleHorizonExpanded = (id: string) => {
    if (expandedHorizon === id) {
      setExpandedHorizon(null)
      // Clear the just-generated flag when collapsing
      if (justGeneratedHorizonId === id) {
        setJustGeneratedHorizonId(null)
      }
    } else {
      setExpandedHorizon(id)
      // Clear the just-generated flag when expanding a different horizon
      if (justGeneratedHorizonId && justGeneratedHorizonId !== id) {
        setJustGeneratedHorizonId(null)
      }
      if (!horizonItems[id]) {
        loadHorizonDetails(id)
      }
    }
  }

  const selectedItem = selectedItemId
    ? Object.values(horizonItems)
        .flat()
        .find((item) => item.id === selectedItemId)
    : null

  const renderCalendar = (h: HorizonRow, items: HorizonItemRow[], isJustGenerated: boolean) => {
    const start = parseYmd(h.horizon_start)
    if (!start) {
      return <p className="text-sm text-muted-foreground">Invalid horizon dates.</p>
    }

    const weeks = h.horizon_type === "weekly" ? [buildWeekDays(start)] : buildMonthGrid(start)

  const flat = weeks.flatMap((w) => w)
  const itemsByDay = new Map<string, HorizonItemRow[]>()
  const unassigned: HorizonItemRow[] = []

  const getFlatYmd = (idx: number) => {
    const el: any = flat[idx]
    if (!el) return ""
    if (typeof el === "string") return el.split("T")[0]
    if (el instanceof Date) return el.toISOString().split("T")[0]
    return el.ymd || el.dateStr || el.iso || el.date?.toISOString?.().split("T")[0] || ""
  }

  const allSameDate = items.length > 1 && items.every(i => i.assigned_date === items[0].assigned_date)

  for (let idx = 0; idx < items.length; idx++) {
    const item = items[idx]
    if (item.assigned_date) {
      let targetDate = item.assigned_date
      if (allSameDate) {
        const flatYmd = getFlatYmd(idx % flat.length)
        if (flatYmd) targetDate = flatYmd
      }
      const group = itemsByDay.get(targetDate) ?? []
      group.push(item)
      itemsByDay.set(targetDate, group)
    } else {
      unassigned.push(item)
    }
  }

  // Flatten all items in render order to compute staggered delays
  const allDayItems: HorizonItemRow[] = []
  flat.forEach((d) => {
    const dayItems = itemsByDay.get(d.key) ?? []
    dayItems.forEach((item) => allDayItems.push(item))
  })
  unassigned.forEach((item) => allDayItems.push(item))

  const getItemDelay = (itemId: string) => {
    if (!isJustGenerated) return 0
    const index = allDayItems.findIndex((item) => item.id === itemId)
    if (index === -1) return 0
    return index * 60 // 60ms delay between each item (50-80ms range)
  }

    if (h.horizon_type === "weekly") {
      const days = weeks[0]
      return (
        <div className="overflow-x-auto">
          <div className="grid grid-cols-7 gap-2">
            {days.map((d) => (
              <div
                key={`h-${d.key}`}
                className="flex flex-col items-center justify-center"
              >
                <span className="text-xs font-medium">{dayName(d.date)}</span>
                <span className="text-xs text-muted-foreground">
                  {d.date.getUTCDate()}
                </span>
              </div>
            ))}
            {days.map((d) => {
              const dayItems = itemsByDay.get(d.key) ?? []
              return (
                <div
                  key={`b-${d.key}`}
                  className={cn(
                    "min-h-36 border rounded-lg p-2 bg-card",
                    dayItems.length === 0 && "bg-muted/20 opacity-60",
                  )}
                >
                  {dayItems.length === 0 ? (
                    <span className="text-xs text-muted-foreground/30">—</span>
                  ) : (
                    dayItems.map((item) => (
                      <CalendarDayChip
                        key={item.id}
                        item={item}
                        request={horizonRequests[item.block_request_id]}
                        onSelect={() => setSelectedItemId(item.id)}
                        animationDelay={getItemDelay(item.id)}
                      />
                    ))
                  )}
                </div>
              )
            })}
          </div>

          <CalendarLegend />

          {unassigned.length > 0 && (
            <div className="mt-4">
              <p className="mb-2 text-xs font-medium text-muted-foreground">
                Deferred (unassigned date)
              </p>
              <div className="flex flex-col gap-2">
                {unassigned.map((item) => (
                  <CalendarDayChip
                    key={item.id}
                    item={item}
                    request={horizonRequests[item.block_request_id]}
                    onSelect={() => setSelectedItemId(item.id)}
                    animationDelay={getItemDelay(item.id)}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )
    }

    return (
          <div className="overflow-x-auto">
          <div className="grid grid-cols-7 gap-px bg-muted border rounded-lg overflow-hidden">
            {DAY_NAMES_SHORT.map((d, i) => (
              <div
                key={`h-${i}`}
                className="bg-muted/50 py-2 text-center text-xs font-medium"
              >
                {d}
              </div>
            ))}
            {flat.map((d, i) => {
              const dayItems = itemsByDay.get(d.key) ?? []
              return (
                <div
                  key={`b-${i}`}
                  className={cn(
                    "relative bg-card min-h-24 p-1",
                    !d.inMonth && "bg-muted/30 opacity-50",
                    d.inMonth && dayItems.length === 0 && "bg-muted/5 opacity-60",
                  )}
                >
                  {d.inMonth && (
                    <span className={cn(
                      "absolute top-1 left-1 text-sm",
                      dayItems.length === 0 ? "text-muted-foreground/30" : "text-muted-foreground/60"
                    )}>
                      {d.date.getUTCDate()}
                    </span>
                  )}
                  {d.inMonth && dayItems.length > 0 && (
                    <div className="pt-6">
                      {dayItems.map((item) => (
                        <CalendarDayChip
                          key={item.id}
                          item={item}
                          request={horizonRequests[item.block_request_id]}
                          onSelect={() => setSelectedItemId(item.id)}
                          animationDelay={getItemDelay(item.id)}
                        />
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          <CalendarLegend />

          {unassigned.length > 0 && (
            <div className="mt-4">
              <p className="mb-2 text-xs font-medium text-muted-foreground">
                Deferred (unassigned date)
              </p>
              <div className="flex flex-col gap-2">
                {unassigned.map((item) => (
                  <CalendarDayChip
                    key={item.id}
                    item={item}
                    request={horizonRequests[item.block_request_id]}
                    onSelect={() => setSelectedItemId(item.id)}
                    animationDelay={getItemDelay(item.id)}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
    )
  }

  const renderHorizonCard = (h: HorizonRow) => {
    const isExpanded = expandedHorizon === h.id
    const items = horizonItems[h.id] ?? []
    const detailsLoaded = horizonItems[h.id] !== undefined
    const isLoadingDetails = isExpanded && !detailsLoaded
    const itemsError = horizonItemsError[h.id]

    return (
      <Card key={h.id}>
        <CardContent>
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant={getHorizonTypeBadgeClass(h.horizon_type)}>
                  {h.horizon_type === "weekly" ? "Weekly" : "Monthly"}
                </Badge>
                
                {h.solver_used === 'cp-sat' ? (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Badge variant="success" className="gap-1">
                        Optimal (CP-SAT)
                        <HelpCircle className="h-3 w-3" aria-hidden="true" />
                      </Badge>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-xs">
                      <p className="text-xs">
                        This plan was generated using a mathematical constraint solver that guarantees the best possible schedule given current constraints.
                      </p>
                    </TooltipContent>
                  </Tooltip>
                ) : (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Badge variant="secondary" className="gap-1">
                        Heuristic (Fallback)
                        <HelpCircle className="h-3 w-3" aria-hidden="true" />
                      </Badge>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-xs">
                      <p className="text-xs">
                        This plan was generated using a fast heuristic algorithm as a fallback when the optimal solver was unavailable.
                      </p>
                    </TooltipContent>
                  </Tooltip>
                )}

                <span className="text-xs text-muted-foreground">
                  {formatDate(h.horizon_start)} → {formatDate(h.horizon_end)}
                </span>
                <span className="text-xs text-muted-foreground">
                  Created {formatDateTime(h.generated_at)}
                </span>
              </div>
              <p className="text-sm text-muted-foreground line-clamp-2">
                {h.summary_explanation ?? "No summary available."}
              </p>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <div className="text-right">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="text-3xl font-bold tracking-tight font-heading tabular-nums flex items-baseline gap-1">
                      {h.projected_availability_pct != null
                        ? `${Math.round(h.projected_availability_pct)}%`
                        : "\u2014"}
                      <HelpCircle className="h-4 w-4 text-muted-foreground/50 hover:text-muted-foreground cursor-help" aria-hidden="true" />
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-xs">
                    <p className="text-xs">
                      Projected percentage of track time available for passenger trains after scheduling maintenance blocks. Higher is better.
                    </p>
                  </TooltipContent>
                </Tooltip>
              </div>
              <span className="text-xs text-muted-foreground">Availability</span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => toggleHorizonExpanded(h.id)}
                aria-expanded={isExpanded}
              >
                {isExpanded ? (
                  <ChevronUp className="h-4 w-4" />
                ) : (
                  <ChevronDown className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>

          {isExpanded && (
            <div className="mt-6 space-y-4">
              <div className="flex items-start gap-4">
                <AvailabilityGauge value={h.projected_availability_pct} />
                <div className="flex-1 border-l-4 border-primary bg-purple-50 dark:bg-purple-900/20 rounded-md px-4 py-3">
                  <p className="text-sm whitespace-pre-wrap">
                    {h.summary_explanation ?? "No summary available."}
                  </p>
                </div>
              </div>
              {!detailsLoaded && isLoadingDetails && (
                <CalendarSkeleton monthly={h.horizon_type === "monthly"} />
              )}
              {detailsLoaded && itemsError && (
                <ErrorState
                  onRetry={() => loadHorizonDetails(h.id)}
                  className="mt-2"
                />
              )}
              {detailsLoaded && !itemsError && items.length === 0 && (
                <EmptyState
                  icon={Calendar}
                  title="No items in this horizon"
                  description="This plan was generated with no scheduled requests."
                />
              )}
              {detailsLoaded && !itemsError && items.length > 0 && renderCalendar(h, items, justGeneratedHorizonId === h.id)}
            </div>
          )}
        </CardContent>
      </Card>
    )
  }

  useEffect(() => {
    loadHorizons()
  }, [])

  // Auto-clear justGeneratedHorizonId after animation completes
  useEffect(() => {
    if (justGeneratedHorizonId) {
      const timeout = setTimeout(() => {
        setJustGeneratedHorizonId(null)
      }, 5000) // Clear after 5 seconds (enough for all staggered animations)
      return () => clearTimeout(timeout)
    }
  }, [justGeneratedHorizonId])

  return (
    <div className="space-y-6">
      <Card>
        <CardContent>
          <div className="flex flex-col sm:flex-row sm:items-end gap-4">
            <div className="flex-1 min-w-48">
              <label htmlFor="horizon-start-date" className="text-sm font-medium">
                Start Date
              </label>
              <Input
                id="horizon-start-date"
                type="date"
                value={horizonStartDate}
                onChange={(e) => setHorizonStartDate(e.target.value)}
              />
            </div>
            <div className="flex gap-2">
              <Button
                variant={horizonType === "weekly" ? "default" : "outline"}
                size="sm"
                onClick={() => setHorizonType("weekly")}
              >
                Weekly
              </Button>
              <Button
                variant={horizonType === "monthly" ? "default" : "outline"}
                size="sm"
                onClick={() => setHorizonType("monthly")}
              >
                Monthly
              </Button>
            </div>
            <AsyncButton
              id="generate-plan-btn"
              size="sm"
              disabled={!horizonStartDate}
              onClick={handleGeneratePlan}
              successMessage="Plan generated"
              errorMessage="Failed to generate plan"
              icon={<CalendarDays className="h-4 w-4" />}
            >
              Generate Plan
            </AsyncButton>
          </div>
        </CardContent>
      </Card>

      {horizonsLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-32 w-full" />
          ))}
        </div>
      ) : horizonsError ? (
        <ErrorState onRetry={loadHorizons} />
      ) : horizons.length === 0 ? (
        <Card>
          <CardContent>
            <EmptyState
              icon={Calendar}
              title="No planning horizons generated yet"
              description="Generate a weekly or monthly horizon plan to get started."
              actionLabel="Generate a Plan"
              onAction={() => document.getElementById("generate-plan-btn")?.click()}
            />
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {horizons.map(renderHorizonCard)}
        </div>
      )}

      {selectedItem && (
        <ItemDetailDialog
          item={selectedItem}
          request={horizonRequests[selectedItem.block_request_id]}
          open={!!selectedItem}
          onOpenChange={(open) => !open && setSelectedItemId(null)}
        />
      )}
    </div>
  )
}
