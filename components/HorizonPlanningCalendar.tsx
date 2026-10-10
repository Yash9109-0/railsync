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
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from "@/components/ui/tooltip"
import { toast } from "sonner"
import { useEffect, useState } from "react"
import { ChevronDown, ChevronUp, ChevronLeft, ChevronRight, CalendarDays, Calendar, HelpCircle, Clock, AlertTriangle } from "lucide-react"
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

/** A single rendered calendar cell. `inHorizon` marks days that belong to the
 *  plan window; padding days (used to square off the monthly grid) are false. */
type CalDay = { date: Date; key: string; inMonth: boolean; inHorizon: boolean }

const DAY_NAMES_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
const DAY_MS = 24 * 60 * 60 * 1000
const MAX_CHIPS_PER_DAY = 3

function parseYmd(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value)
  if (match) return new Date(Date.UTC(+match[1], +match[2] - 1, +match[3]))
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function dateKey(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`
}

function formatDateTime(value: string) {
  const parsed = Date.parse(value)
  if (Number.isNaN(parsed)) return value
  return new Date(parsed).toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  })
}

/** Horizon dates are stored as UTC ISO strings. Formatting them with the local
 *  zone renders the previous day for anyone west of Greenwich, so every
 *  calendar-date formatter pins `timeZone: "UTC"`. */
function formatDate(value: string) {
  const parsed = Date.parse(value)
  if (Number.isNaN(parsed)) return value
  return new Date(parsed).toLocaleDateString("en-US", { dateStyle: "medium", timeZone: "UTC" })
}

function formatHour(hour: number | null): string {
  if (hour == null || !Number.isFinite(hour)) return ""
  // Rounding to whole minutes first stops 12.999 -> "12:60".
  const totalMins = Math.round(hour * 60)
  const wrapped = ((totalMins % 1440) + 1440) % 1440
  const hh = String(Math.floor(wrapped / 60)).padStart(2, "0")
  const mm = String(wrapped % 60).padStart(2, "0")
  return `${hh}:${mm}`
}

function getAvailabilityColorClass(pct: number): string {
  if (pct > 80) return "text-success"
  if (pct >= 60) return "text-warning"
  return "text-destructive"
}

/** Single source of truth for scheduled/deferred colouring. The chip border, the
 *  legend swatch and the "deferred" tray all read from here so the two states can
 *  never drift apart again. */
function chipStatusClass(status: "scheduled" | "deferred"): string {
  return status === "scheduled"
    ? "border-l-primary bg-primary/10 dark:bg-primary/15"
    : "border-l-warning bg-warning/10 dark:bg-warning/15"
}

function statusDotClass(status: "scheduled" | "deferred"): string {
  return status === "scheduled" ? "bg-primary" : "bg-warning"
}

function getTimeSlot(startHour: number | null, durationMins: number | null): string {
  if (startHour == null) return ""
  const start = formatHour(startHour)
  if (durationMins == null || durationMins <= 0) return start
  const endHour = startHour + durationMins / 60
  // flag work that runs past midnight rather than printing a bogus 25:30
  const spillsOver = Math.floor(endHour) >= 24
  return `${start} – ${formatHour(endHour)}${spillsOver ? " +1d" : ""}`
}

/** Department colours are expressed as translucent theme tokens plus an opaque
 *  text colour, so they stay legible in both light and dark mode (the previous
 *  hard-coded `bg-blue-50 text-blue-700` pairs were unreadable on dark cards). */
function getDepartmentBadgeClass(dept: string | null | undefined): string {
  switch ((dept ?? "").toUpperCase()) {
    case "TMS":
      return "bg-chart-1/15 text-chart-1"
    case "TDMS":
      return "bg-chart-2/15 text-chart-2"
    case "SMMS":
      return "bg-chart-3/15 text-chart-3"
    case "OHE":
      return "bg-chart-4/15 text-chart-4"
    default:
      return "bg-muted text-muted-foreground"
  }
}

function formatWeekRange(start: string, end: string): string {
  const s = parseYmd(start)
  const e = parseYmd(end)
  if (!s || !e) return `${start} - ${end}`
  // horizon_end is exclusive in the optimizer (start + 7 days), so show the
  // last day the plan actually covers.
  const last = addDays(e, -1)
  const fmt = (d: Date, withYear: boolean) =>
    d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      ...(withYear ? { year: "numeric" } : {}),
      timeZone: "UTC",
    })
  const sameYear = s.getUTCFullYear() === last.getUTCFullYear()
  return `${fmt(s, !sameYear)} – ${fmt(last, !sameYear)}`
}

function formatMonthRange(start: string, end: string): string {
  const s = parseYmd(start)
  const e = parseYmd(end)
  if (!s) return start
  if (!e) return s.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" })
  const last = addDays(e, -1)
  const sameMonth = s.getUTCMonth() === last.getUTCMonth() && s.getUTCFullYear() === last.getUTCFullYear()
  if (sameMonth) {
    return s.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" })
  }
  return `${s.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })} – ${last.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })}`
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

/** The inclusive day count a horizon spans. The optimizer writes a rolling
 *  window (7 days weekly, 30 days monthly) rather than snapping to calendar
 *  boundaries, so we derive length from the stored start/end instead of the type. */
function horizonDayCount(h: HorizonRow): number {
  const start = parseYmd(h.horizon_start)
  const end = parseYmd(h.horizon_end)
  if (start && end) {
    const days = Math.round((end.getTime() - start.getTime()) / DAY_MS)
    if (Number.isFinite(days) && days > 0) return days
  }
  return h.horizon_type === "weekly" ? 7 : 30
}

function addDays(date: Date, n: number): Date {
  const d = new Date(date)
  d.setUTCDate(d.getUTCDate() + n)
  return d
}

function makeDay(date: Date, inHorizon: boolean): CalDay {
  return { date, key: dateKey(date), inMonth: true, inHorizon }
}

/** Every real day in the plan window, in order. */
function buildHorizonDays(h: HorizonRow, start: Date): CalDay[] {
  return Array.from({ length: horizonDayCount(h) }, (_, i) => makeDay(addDays(start, i), true))
}

/** Pads the window with the leading/trailing days needed to fill whole
 *  Sunday-based weeks. Padding cells are rendered muted and never hold items,
 *  so nothing is dropped when a monthly window spills into the next month. */
function toWeekRows(days: CalDay[]): CalDay[][] {
  if (days.length === 0) return []
  const leading = days[0].date.getUTCDay()
  const trailing = (7 - ((leading + days.length) % 7)) % 7

  const cells: CalDay[] = []
  for (let i = leading; i > 0; i--) {
    cells.push(makeDay(addDays(days[0].date, -i), false))
  }
  cells.push(...days)
  for (let i = 1; i <= trailing; i++) {
    cells.push(makeDay(addDays(days[days.length - 1].date, i), false))
  }

  const rows: CalDay[][] = []
  for (let i = 0; i < cells.length; i += 7) {
    rows.push(cells.slice(i, i + 7))
  }
  return rows
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
  const blockId = item.block_request_id
  const timeSlot = getTimeSlot(item.assigned_start_hour, item.assigned_duration_mins)
  const dept = request?.department ?? "—"
  const workDescription = request?.work_description ?? ""
  const ariaLabel = `${blockId}. ${timeSlot}. ${dept}. ${workDescription}`

  // The animation class carries `forwards`, so opacity is driven by CSS and the
  // chip can never be left stuck at opacity 0 when a delay is applied.
  const style = animationDelay > 0 ? { animationDelay: `${animationDelay}ms` } : undefined

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-label={ariaLabel}
      title={`${blockId} · ${timeSlot || "unscheduled"} · ${dept}`}
      className={cn(
        "group w-full rounded-md border border-border-subtle border-l-4 p-1 text-left shadow-xs transition-colors duration-fast",
        "hover:border-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background",
        chipStatusClass(item.status),
        animationDelay > 0 && "animate-calendar-item-enter",
      )}
      style={style}
    >
      <div className="flex items-center justify-between gap-1">
        <span className="truncate text-xs font-medium">{blockId}</span>
        <span className={cn("shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold leading-none", getDepartmentBadgeClass(dept))}>
          {dept}
        </span>
      </div>
      {timeSlot && (
        <span className="mt-1 flex items-center gap-1 text-[10px] text-muted-foreground">
          <Clock className="h-3 w-3 shrink-0" aria-hidden="true" />
          {timeSlot}
        </span>
      )}
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
                <Badge variant="outline" className={cn("flex items-center gap-1 border-0 bg-transparent p-0 font-normal text-xs capitalize", getStatusColorClass(item.status))}>
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
  const bodyCells = monthly ? 35 : 7
  return (
    <div className="grid grid-cols-7 gap-1 overflow-hidden rounded-lg border border-border-subtle bg-card p-1">
      {Array.from({ length: 7 }).map((_, i) => (
        <Skeleton key={`h-${i}`} className="h-8 w-full" />
      ))}
      {Array.from({ length: bodyCells }).map((_, i) => (
        <Skeleton key={`b-${i}`} className="h-20 w-full" />
      ))}
    </div>
  )
}

/** Swatches are derived from the same helpers that colour the chips, so the
 *  legend can no longer disagree with the calendar it describes. */
function CalendarLegend() {
  return (
    <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
      {(["scheduled", "deferred"] as const).map((status) => (
        <div key={status} className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className={cn("h-3 w-1 rounded-full", statusDotClass(status))}
          />
          <span className="capitalize">{status}</span>
        </div>
      ))}
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
  // Days whose chip list is expanded past MAX_CHIPS_PER_DAY.
  const [expandedDays, setExpandedDays] = useState<Record<string, boolean>>({})

  /** Steps the start date by one full planning period. */
  const shiftStartDate = (delta: number) => {
    setHorizonStartDate((prev) => {
      if (!prev) return prev
      const base = new Date(`${prev}T00:00:00Z`)
      if (Number.isNaN(base.getTime())) return prev
      return dateKey(addDays(base, delta * (horizonType === "weekly" ? 7 : 30)))
    })
  }

  /** Weekly plans read best aligned to Monday so a "week" looks like a week. */
  const alignStartToWeek = () => {
    setHorizonStartDate((prev) => {
      const base = new Date(`${prev}T00:00:00Z`)
      if (Number.isNaN(base.getTime())) return prev
      const dow = (base.getUTCDay() + 6) % 7 // 0 = Monday
      return dateKey(addDays(base, -dow))
    })
  }

  // The API returns a bare `horizonId`, not a nested `horizon` object.
  const handleGeneratePlan = async () => {
    if (!horizonStartDate) return
    const res = await fetch("/api/generate-horizon-plan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        horizonType,
        startDate: new Date(`${horizonStartDate}T00:00:00Z`).toISOString(),
      }),
    })
    const json = await res.json()
    if (!res.ok || json.error) {
      throw new Error(json.error ?? "Failed to generate plan")
    }
    const newId: string | undefined = json.horizonId ?? json.horizon?.id
    if (newId) {
      // Open the new plan straight away so the user sees the result of the
      // action they just triggered instead of having to hunt for the card.
      setJustGeneratedHorizonId(newId)
      setExpandedHorizon(newId)
      setHorizonItems((prev) => {
        const next = { ...prev }
        delete next[newId]
        return next
      })
      setHorizonItemsError((prev) => {
        const next = { ...prev }
        delete next[newId]
        return next
      })
    }
    await loadHorizons()
    if (newId) {
      await loadHorizonDetails(newId)
    }
  }

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

    const isWeekly = h.horizon_type === "weekly"
    const days = buildHorizonDays(h, start)
    const rows = isWeekly ? [days] : toWeekRows(days)

    // Group strictly by the date the solver recorded. Anything without a date is
    // deferred, and anything dated outside the window is surfaced separately
    // rather than being dropped or silently moved to a different day.
    const windowKeys = new Set(days.map((d) => d.key))
    const itemsByDay = new Map<string, HorizonItemRow[]>()
    const unassigned: HorizonItemRow[] = []
    const outOfWindow: HorizonItemRow[] = []

    for (const item of items) {
      const key = item.assigned_date ? item.assigned_date.slice(0, 10) : null
      if (!key) {
        unassigned.push(item)
      } else if (!windowKeys.has(key)) {
        outOfWindow.push(item)
      } else {
        const group = itemsByDay.get(key) ?? []
        group.push(item)
        itemsByDay.set(key, group)
      }
    }

    for (const group of itemsByDay.values()) {
      group.sort((a, b) => (a.assigned_start_hour ?? 0) - (b.assigned_start_hour ?? 0))
    }

    // Flatten in render order so the stagger delay is monotonic across the grid.
    const allDayItems: HorizonItemRow[] = []
    days.forEach((d) => {
      ;(itemsByDay.get(d.key) ?? []).forEach((item) => allDayItems.push(item))
    })
    unassigned.forEach((item) => allDayItems.push(item))
    outOfWindow.forEach((item) => allDayItems.push(item))

    const getItemDelay = (itemId: string) => {
      if (!isJustGenerated) return 0
      const index = allDayItems.findIndex((item) => item.id === itemId)
      if (index === -1) return 0
      return index * 60
    }

    const todayKey = dateKey(new Date())

    const renderDayCell = (d: CalDay) => {
      const dayItems = d.inHorizon ? itemsByDay.get(d.key) ?? [] : []
      const isExpanded = expandedDays[d.key] ?? false
      const visible = isExpanded ? dayItems : dayItems.slice(0, MAX_CHIPS_PER_DAY)
      const hiddenCount = dayItems.length - visible.length
      const isToday = d.key === todayKey

      return (
        <div
          key={d.key}
          role="gridcell"
          aria-label={d.date.toLocaleDateString("en-US", {
            weekday: "long",
            month: "long",
            day: "numeric",
            timeZone: "UTC",
          })}
          className={cn(
            "flex min-h-[112px] flex-col gap-1 rounded-lg border border-border-subtle bg-surface-1 p-1 transition-colors duration-fast",
            isToday && "border-primary/60 ring-1 ring-primary/30",
            !d.inHorizon && "bg-transparent opacity-40",
          )}
        >
          <div className="flex items-center justify-between gap-1 px-1">
            <span
              className={cn(
                "text-xs font-medium tabular-nums",
                isToday ? "text-primary" : "text-muted-foreground",
                !d.inHorizon && "opacity-60",
              )}
            >
              {d.date.getUTCDate()}
            </span>
            {dayItems.length > 0 && (
              <span className="rounded bg-muted px-1 text-[10px] font-medium tabular-nums text-muted-foreground">
                {dayItems.length}
              </span>
            )}
          </div>

          {visible.map((item) => (
            <CalendarDayChip
              key={item.id}
              item={item}
              request={horizonRequests[item.block_request_id]}
              onSelect={() => setSelectedItemId(item.id)}
              animationDelay={getItemDelay(item.id)}
            />
          ))}

          {hiddenCount > 0 && (
            <button
              type="button"
              onClick={() => setExpandedDays((prev) => ({ ...prev, [d.key]: true }))}
              className="rounded px-1 text-left text-[10px] font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              +{hiddenCount} more
            </button>
          )}
          {isExpanded && dayItems.length > MAX_CHIPS_PER_DAY && (
            <button
              type="button"
              onClick={() => setExpandedDays((prev) => ({ ...prev, [d.key]: false }))}
              className="rounded px-1 text-left text-[10px] font-medium text-muted-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Show less
            </button>
          )}
        </div>
      )
    }

    const scheduledCount = [...itemsByDay.values()].reduce((n, g) => n + g.length, 0)
    const title = isWeekly
      ? formatWeekRange(h.horizon_start, h.horizon_end)
      : formatMonthRange(h.horizon_start, h.horizon_end)

    return (
      <div className="overflow-hidden rounded-xl border border-border-subtle bg-card">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border-subtle px-3 py-2">
          <h3 className="text-sm font-medium">{title}</h3>
          <div className="flex items-center gap-3">
            <span className="text-xs text-muted-foreground">
              <span className="font-medium tabular-nums text-foreground">{scheduledCount}</span> scheduled
            </span>
            {unassigned.length > 0 && (
              <span className="text-xs text-muted-foreground">
                <span className="font-medium tabular-nums text-foreground">{unassigned.length}</span> deferred
              </span>
            )}
          </div>
        </div>

        <div className="overflow-x-auto">
          <div className="min-w-[720px] p-2">
            <div role="row" className="mb-1 grid grid-cols-7 gap-1">
              {DAY_NAMES_SHORT.map((name) => (
                <div
                  key={name}
                  role="columnheader"
                  className="rounded bg-muted/50 py-1 text-center text-[10px] font-semibold uppercase tracking-wide text-muted-foreground"
                >
                  {name}
                </div>
              ))}
            </div>
            <div role="grid" className="grid grid-cols-7 gap-1">
              {rows.flat().map(renderDayCell)}
            </div>
          </div>
        </div>

        <div className="border-t border-border-subtle px-3 py-2">
          <CalendarLegend />
        </div>

        {unassigned.length > 0 && (
          <div className="border-t border-border-subtle px-3 py-3">
            <div className="mb-2 flex items-center gap-2">
              <span aria-hidden="true" className={cn("h-3 w-1 rounded-full", statusDotClass("deferred"))} />
              <p className="text-xs font-medium text-muted-foreground">
                Deferred — no date assigned
              </p>
            </div>
            <div className="grid gap-1 sm:grid-cols-2 lg:grid-cols-3">
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

        {outOfWindow.length > 0 && (
          <div className="border-t border-border-subtle bg-warning/5 px-3 py-3">
            <div className="mb-2 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
              <p className="text-xs font-medium text-warning">
                {outOfWindow.length} item{outOfWindow.length === 1 ? "" : "s"} outside this plan window
              </p>
            </div>
            <div className="grid gap-1 sm:grid-cols-2 lg:grid-cols-3">
              {outOfWindow.map((item) => (
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
                
                {h.solver_used === "OR-Tools" ||
                h.solver_used === "CP-SAT" ||
                h.solver_used === "OR-Tools (CP-SAT)" ||
                h.solver_used === "or_tools" ||
                h.solver_used === "cp-sat" ||
                (typeof h.solver_used === "string" &&
                  (h.solver_used.toLowerCase().includes("or-tools") ||
                    h.solver_used.toLowerCase().includes("cp-sat") ||
                    h.solver_used.toLowerCase().includes("or_tools"))) ? (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold leading-none min-h-[24px] bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    Google OR-Tools (Optimized)
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium leading-none min-h-[24px] bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 border border-amber-300 dark:border-amber-800">
                    Heuristic (Fallback)
                  </span>
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
                <div className="flex-1 rounded-md border-l-4 border-primary bg-primary/5 px-4 py-3">
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
    <TooltipProvider delayDuration={350}>
      <div className="space-y-6">
        <Card>
          <CardContent>
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
                <div
                  role="radiogroup"
                  aria-label="Planning horizon type"
                  className="inline-flex w-fit rounded-lg border border-border-subtle bg-muted/50 p-1"
                >
                  {(["weekly", "monthly"] as const).map((type) => {
                    const active = horizonType === type
                    return (
                      <button
                        key={type}
                        type="button"
                        role="radio"
                        aria-checked={active}
                        onClick={() => setHorizonType(type)}
                        className={cn(
                          "rounded-md px-3 py-1 text-sm font-medium capitalize transition-colors duration-fast",
                          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                          active
                            ? "bg-card text-foreground shadow-xs"
                            : "text-muted-foreground hover:text-foreground",
                        )}
                      >
                        {type}
                      </button>
                    )
                  })}
                </div>

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
                  <p className="mt-1 text-xs text-muted-foreground">
                    Covers {horizonType === "weekly" ? "7" : "30"} days from the start date
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <div className="inline-flex rounded-lg border border-border-subtle bg-muted/50 p-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label="Previous period"
                      onClick={() => shiftStartDate(-1)}
                      className="rounded-md"
                    >
                      <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                    </Button>
                    {horizonType === "weekly" && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={alignStartToWeek}
                        className="rounded-md text-xs"
                      >
                        This week
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label="Next period"
                      onClick={() => shiftStartDate(1)}
                      className="rounded-md"
                    >
                      <ChevronRight className="h-4 w-4" aria-hidden="true" />
                    </Button>
                  </div>
                </div>
              </div>

              <div className="flex justify-end">
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
              onAction={handleGeneratePlan}
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
  </TooltipProvider>
  )
}
