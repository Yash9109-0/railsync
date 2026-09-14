"use client"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { toast } from "sonner"
import { useEffect, useState } from "react"
import { ChevronDown, ChevronUp, Loader2, CalendarDays } from "lucide-react"
import * as Popover from "@radix-ui/react-popover"
import { cn } from "@/lib/utils"

type HorizonRow = {
  id: string
  horizon_type: "weekly" | "monthly"
  horizon_start: string
  horizon_end: string
  projected_availability_pct: number | null
  summary_explanation: string | null
  generated_at: string
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

type RequestInfo = { id: string; work_description: string | null }

type CalDay = { date: Date; key: string; inMonth: boolean }

const DAY_NAMES_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
const MONTH_NAMES_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
]

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

function monthDay(date: Date): string {
  return `${MONTH_NAMES_SHORT[date.getUTCMonth()]} ${date.getUTCDate()}`
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

function formatHour(hour: number): string {
  const h = Math.floor(hour)
  return `${String(h).padStart(2, "0")}:00`
}

function truncate(text: string, max = 22): string {
  if (text.length <= max) return text
  return `${text.slice(0, Math.max(0, max - 1)).trimEnd()}\u2026`
}

function horizonTypeBadge(type: "weekly" | "monthly") {
  return type === "weekly"
    ? "text-blue-700 dark:text-blue-400 bg-blue-500/10 border-blue-600/20"
    : "text-emerald-700 dark:text-emerald-400 bg-emerald-500/10 border-emerald-600/20"
}

function statusColorClass(status: "scheduled" | "deferred" | null | undefined) {
  if (status === "scheduled") {
    return "bg-purple-500/20 text-purple-700 border border-purple-500/40 dark:bg-purple-900/35 dark:text-purple-300 dark:border-purple-900/60"
  }
  return "bg-amber-500/5 text-amber-700 border border-amber-500/50 dark:bg-amber-900/25 dark:text-amber-300 dark:border-amber-400"
}

function availabilityColor(pct: number) {
  if (pct > 80) return "text-green-500"
  if (pct >= 60) return "text-amber-500"
  return "text-red-500"
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

function HorizonItemChip({
  item,
  request,
}: {
  item: HorizonItemRow
  request: RequestInfo | undefined
}) {
  const desc = request?.work_description ?? `Request ${item.block_request_id.slice(0, 8)}`
  const time = item.assigned_start_hour != null ? formatHour(item.assigned_start_hour) : null
  const chipText = time ? `${truncate(desc)} \u00b7 ${time}` : truncate(desc)

  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button
          type="button"
          title={desc}
          className={cn(
            "w-full truncate rounded-md px-2 py-1 text-[11px] font-medium leading-tight",
            "cursor-pointer transition-colors",
            statusColorClass(item.status),
          )}
        >
          <span className="block w-full truncate">{chipText}</span>
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          sideOffset={8}
          align="start"
          className={cn(
            "z-50 w-72 rounded-md border bg-popover p-3 text-sm text-popover-foreground shadow-md outline-none",
          )}
        >
          <div className="space-y-2">
            <p className="break-words text-xs">{desc}</p>
            <div className="flex justify-between gap-2 text-xs">
              <span className="text-muted-foreground">Priority score</span>
              <span>
                {item.priority_score != null ? Math.round(item.priority_score) : "\u2014"}
              </span>
            </div>
            <div className="flex justify-between gap-2 text-xs">
              <span className="text-muted-foreground">Reason</span>
              <span className="text-right break-words">
                {item.reason ? item.reason : "\u2014"}
              </span>
            </div>
            <div className="flex justify-between gap-2 text-xs">
              <span className="text-muted-foreground">Status</span>
              <Badge
                variant="outline"
                className={cn(
                  "border-0 bg-transparent px-1 py-0 font-normal",
                  statusColorClass(item.status),
                )}
              >
                {item.status}
              </Badge>
            </div>
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
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
    <div className="mt-4 flex flex-wrap items-center gap-4 text-xs">
      <div className="flex items-center gap-1.5">
        <span
          className={cn("h-3 w-3 rounded-sm", statusColorClass("scheduled"))}
        />
        <span className="text-muted-foreground">Scheduled</span>
      </div>
      <div className="flex items-center gap-1.5">
        <span
          className={cn("h-3 w-3 rounded-sm", statusColorClass("deferred"))}
        />
        <span className="text-muted-foreground">Deferred</span>
      </div>
    </div>
  )
}

function AvailabilityGauge({ value }: { value: number | null }) {
  const pct = value != null ? Math.round(value) : 0
  const colorClass =
    value != null ? availabilityColor(pct) : "text-muted-foreground/50"
  const radius = 42
  const strokeWidth = 7
  const circumference = 2 * Math.PI * radius
  const dashOffset = circumference - (pct / 100) * circumference

  return (
    <div className="relative h-32 w-32" role="img" aria-label="Availability gauge">
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
          strokeDashoffset={dashOffset}
          strokeLinecap="round"
          transform="rotate(-90 50 50)"
          className={colorClass}
          style={{ transition: "stroke-dashoffset 0.5s ease" }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-xl font-bold">
          {value != null ? `${pct}%` : "\u2014"}
        </span>
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
  const [generating, setGenerating] = useState(false)
  const [expandedHorizon, setExpandedHorizon] = useState<string | null>(null)
  const [horizonItems, setHorizonItems] = useState<Record<string, HorizonItemRow[]>>({})
  const [horizonRequests, setHorizonRequests] = useState<Record<string, RequestInfo>>({})

  const loadHorizons = async () => {
    setHorizonsLoading(true)
    try {
      const res = await fetch("/api/horizons", { cache: "no-store" })
      const json = await res.json()
      if (!res.ok || json.error) {
        toast.error(json.error ?? "Failed to load planning horizons")
        setHorizons([])
      } else {
        setHorizons((json.horizons ?? []) as HorizonRow[])
      }
    } catch {
      toast.error("Failed to load planning horizons")
      setHorizons([])
    } finally {
      setHorizonsLoading(false)
    }
  }

  const handleGeneratePlan = async () => {
    if (!horizonStartDate) return
    setGenerating(true)
    try {
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
        toast.error(json.error ?? "Failed to generate plan")
        return
      }
      toast.success("Plan generated successfully")
      await loadHorizons()
    } catch {
      toast.error("Failed to generate plan")
    } finally {
      setGenerating(false)
    }
  }

  const loadHorizonDetails = async (id: string) => {
    try {
      const res = await fetch(`/api/horizon-items?horizonId=${id}`, { cache: "no-store" })
      const json = await res.json()
      if (!res.ok || json.error) {
        toast.error(json.error ?? "Failed to load horizon items")
        return
      }
      const items = (json.items ?? []) as HorizonItemRow[]
      setHorizonItems((prev) => ({ ...prev, [id]: items }))
      for (const r of (json.requests ?? []) as RequestInfo[]) {
        setHorizonRequests((prev) => ({ ...prev, [r.id]: r }))
      }
    } catch {
      toast.error("Failed to load horizon details")
    }
  }

  const toggleHorizonExpanded = (id: string) => {
    if (expandedHorizon === id) {
      setExpandedHorizon(null)
    } else {
      setExpandedHorizon(id)
      if (!horizonItems[id]) {
        loadHorizonDetails(id)
      }
    }
  }

  const renderCalendar = (h: HorizonRow, items: HorizonItemRow[]) => {
    const start = parseYmd(h.horizon_start)
    if (!start) {
      return <p className="text-sm text-muted-foreground">Invalid horizon dates.</p>
    }

    const weeks = h.horizon_type === "weekly" ? [buildWeekDays(start)] : buildMonthGrid(start)

    const headerLabels =
      h.horizon_type === "weekly"
        ? weeks[0].map((d) => ({ label: dayName(d.date), sub: monthDay(d.date) }))
        : DAY_NAMES_SHORT.map((d) => ({ label: d }))

    const flat = weeks.flatMap((w) => w)
    const itemsByDay = new Map<string, HorizonItemRow[]>()
    const unassigned: HorizonItemRow[] = []
    for (const item of items) {
      if (item.assigned_date) {
        const group = itemsByDay.get(item.assigned_date) ?? []
        group.push(item)
        itemsByDay.set(item.assigned_date, group)
      } else {
        unassigned.push(item)
      }
    }

    return (
      <div className="overflow-x-auto">
        <div className="grid min-w-[560px] grid-cols-7 gap-px overflow-hidden rounded-md border bg-border">
          {headerLabels.map((hl, i) => (
            <div
              key={`h-${i}`}
              className="flex flex-col items-center justify-center bg-muted/40 py-2 text-center"
            >
              <span className="text-xs font-medium">{hl.label}</span>
              {hl.sub && (
                <span className="text-[10px] text-muted-foreground">{hl.sub}</span>
              )}
            </div>
          ))}
          {flat.map((d, i) => {
            const dayItems = itemsByDay.get(d.key) ?? []
            const isEmpty = dayItems.length === 0
            const hasDateLabel = h.horizon_type === "monthly" && d.inMonth
            return (
              <div
                key={`b-${i}`}
                className={cn(
                  "min-h-[70px] p-1.5",
                  "flex flex-col gap-1",
                  d.inMonth ? "bg-background" : "bg-muted/20",
                )}
              >
                {hasDateLabel && (
                  <span className="text-[10px] text-muted-foreground/60">
                    {d.date.getUTCDate()}
                  </span>
                )}
                {d.inMonth && isEmpty ? (
                  <span className="text-[10px] text-muted-foreground/40">—</span>
                ) : (
                  d.inMonth &&
                  dayItems.map((item) => (
                    <HorizonItemChip
                      key={item.id}
                      item={item}
                      request={horizonRequests[item.block_request_id]}
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
            <div className="flex flex-col gap-1.5">
              {unassigned.map((item) => (
                <HorizonItemChip
                  key={item.id}
                  item={item}
                  request={horizonRequests[item.block_request_id]}
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

    return (
      <Card key={h.id}>
        <CardContent className="pt-6">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant="outline" className={horizonTypeBadge(h.horizon_type)}>
                  {h.horizon_type === "weekly" ? "Weekly" : "Monthly"}
                </Badge>
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
                <div className="text-2xl font-bold">
                  {h.projected_availability_pct != null
                    ? `${Math.round(h.projected_availability_pct)}%`
                    : "\u2014"}
                </div>
                <span className="text-xs text-muted-foreground">Availability</span>
              </div>
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
            <div className="mt-5 space-y-4">
              <div className="flex items-start gap-4">
                <AvailabilityGauge value={h.projected_availability_pct} />
                <div className="flex-1 border-l-4 border-[#960DF2] bg-purple-50 dark:bg-purple-900/20 rounded-md px-4 py-3">
                  <p className="text-sm whitespace-pre-wrap">
                    {h.summary_explanation ?? "No summary available."}
                  </p>
                </div>
              </div>
              {!detailsLoaded && isLoadingDetails && (
                <CalendarSkeleton monthly={h.horizon_type === "monthly"} />
              )}
              {detailsLoaded && items.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  No items in this horizon.
                </p>
              )}
              {detailsLoaded && items.length > 0 && renderCalendar(h, items)}
            </div>
          )}
        </CardContent>
      </Card>
    )
  }

  useEffect(() => {
    loadHorizons()
  }, [])

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row sm:items-end gap-4">
            <div className="flex-1 min-w-[200px]">
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
            <Button
              size="sm"
              disabled={!horizonStartDate || generating}
              onClick={handleGeneratePlan}
            >
              {generating ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <CalendarDays className="h-3.5 w-3.5 mr-1.5" />
                  Generate Plan
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {horizonsLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-32 w-full" />
          ))}
        </div>
      ) : horizons.length === 0 ? (
        <Card>
          <CardContent className="pt-6">
            <p className="text-center text-muted-foreground">
              No planning horizons generated yet.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {horizons.map(renderHorizonCard)}
        </div>
      )}
    </div>
  )
}
