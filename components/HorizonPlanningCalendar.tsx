"use client"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { toast } from "sonner"
import { useEffect, useState } from "react"
import { ChevronDown, ChevronUp, Loader2, CalendarDays, X } from "lucide-react"
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

function chipStatusClass(status: "scheduled" | "deferred") {
  if (status === "scheduled") {
    return "bg-purple-100 text-purple-800 border border-purple-300"
  }
  return "bg-amber-50 text-amber-800 border border-dashed border-amber-400"
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
    value != null ? availabilityColor(pct) : "text-muted-foreground/50"
  const radius = 42
  const strokeWidth = 7
  const circumference = 2 * Math.PI * radius
  const dashOffset = circumference - (pct / 100) * circumference

  return (
    <div
      className="relative h-32 w-32"
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

function CalendarDayChip({
  item,
  request,
  onSelect,
}: {
  item: HorizonItemRow
  request: RequestInfo | undefined
  onSelect: () => void
}) {
  const segmentName =
    request?.segment_name ?? `Req ${item.block_request_id.slice(0, 8)}`
  const startTime = formatHour(item.assigned_start_hour)
  const chipText = startTime ? `${segmentName} ${startTime}` : segmentName

  return (
    <button
      type="button"
      title={request?.work_description ?? ""}
      onClick={onSelect}
      className={cn(
        "block w-full truncate rounded-full px-2 py-0.5 text-[11px] font-medium mb-1",
        chipStatusClass(item.status),
      )}
    >
      <span className="block w-full truncate">{chipText}</span>
    </button>
  )
}

function ItemDetailPopover({
  item,
  request,
  onClose,
}: {
  item: HorizonItemRow
  request: RequestInfo | undefined
  onClose: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20">
      <div className="relative w-64 rounded-lg border bg-white p-3 shadow-xl dark:bg-gray-900 dark:border-gray-700">
        <button
          onClick={onClose}
          className="absolute top-2 right-2 text-gray-500 hover:text-gray-700"
        >
          <X className="h-4 w-4" />
        </button>
        <div className="space-y-3 pr-6">
          <div>
            <span className="text-xs text-gray-500">Work Description</span>
            <p className="text-sm break-words">
              {request?.work_description ?? "\u2014"}
            </p>
          </div>
          <div className="flex justify-between">
            <span className="text-xs text-gray-500">Priority Score</span>
            <Badge variant="outline" className="text-xs">
              {item.priority_score != null
                ? Math.round(item.priority_score)
                : "\u2014"}
            </Badge>
          </div>
          <div className="flex justify-between">
            <span className="text-xs text-gray-500">Reason</span>
            <span className="text-sm text-right break-words">
              {item.reason ?? "\u2014"}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-xs text-gray-500">Department</span>
            <span className="text-sm">
              {request?.department ?? "Unassigned"}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-xs text-gray-500">Status</span>
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
      </div>
    </div>
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
    <div className="mt-4 flex gap-4 text-xs text-gray-600">
      <div className="flex items-center gap-1.5">
        <span className="h-3 w-3 rounded-full bg-purple-500" />
        <span>Scheduled</span>
      </div>
      <div className="flex items-center gap-1.5">
        <span className="h-3 w-3 rounded-full border border-dashed border-amber-400" />
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
  const [generating, setGenerating] = useState(false)
  const [expandedHorizon, setExpandedHorizon] = useState<string | null>(null)
  const [horizonItems, setHorizonItems] = useState<Record<string, HorizonItemRow[]>>({})
  const [horizonRequests, setHorizonRequests] = useState<Record<string, RequestInfo>>({})
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null)

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

  const selectedItem = selectedItemId
    ? Object.values(horizonItems)
        .flat()
        .find((item) => item.id === selectedItemId)
    : null

  const renderCalendar = (h: HorizonRow, items: HorizonItemRow[]) => {
    const start = parseYmd(h.horizon_start)
    if (!start) {
      return <p className="text-sm text-muted-foreground">Invalid horizon dates.</p>
    }

    const weeks = h.horizon_type === "weekly" ? [buildWeekDays(start)] : buildMonthGrid(start)

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
                <span className="text-[10px] text-muted-foreground">
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
                    "min-h-[140px] border rounded-lg p-2 bg-white",
                    dayItems.length === 0 && "bg-gray-50/50",
                  )}
                >
                  {dayItems.length === 0 ? (
                    <span className="text-[10px] text-muted-foreground/40">—</span>
                  ) : (
                    dayItems.map((item) => (
                      <CalendarDayChip
                        key={item.id}
                        item={item}
                        request={horizonRequests[item.block_request_id]}
                        onSelect={() => setSelectedItemId(item.id)}
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
                  <CalendarDayChip
                    key={item.id}
                    item={item}
                    request={horizonRequests[item.block_request_id]}
                    onSelect={() => setSelectedItemId(item.id)}
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
        <div className="grid grid-cols-7 gap-px bg-gray-200 border rounded-lg overflow-hidden">
          {DAY_NAMES_SHORT.map((d, i) => (
            <div
              key={`h-${i}`}
              className="bg-gray-50 py-1.5 text-center text-xs font-medium"
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
                  "relative bg-white min-h-[100px] p-1",
                  !d.inMonth && "bg-gray-100",
                  d.inMonth && dayItems.length === 0 && "bg-gray-50/50",
                )}
              >
                {d.inMonth && (
                  <span className="absolute top-1 left-1 text-sm text-muted-foreground/60">
                    {d.date.getUTCDate()}
                  </span>
                )}
                {d.inMonth && dayItems.length > 0 && (
                  <div className="pt-5">
                    {dayItems.map((item) => (
                      <CalendarDayChip
                        key={item.id}
                        item={item}
                        request={horizonRequests[item.block_request_id]}
                        onSelect={() => setSelectedItemId(item.id)}
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
            <div className="flex flex-col gap-1.5">
              {unassigned.map((item) => (
                <CalendarDayChip
                  key={item.id}
                  item={item}
                  request={horizonRequests[item.block_request_id]}
                  onSelect={() => setSelectedItemId(item.id)}
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

      {selectedItem && (
        <ItemDetailPopover
          item={selectedItem}
          request={horizonRequests[selectedItem.block_request_id]}
          onClose={() => setSelectedItemId(null)}
        />
      )}
    </div>
  )
}
