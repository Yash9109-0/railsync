"use client"

import React, { useEffect, useMemo, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { cn } from "@/lib/utils"
import { useCorridor } from "@/context/CorridorContext"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Tooltip,
  TooltipProvider,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip"
import { toast } from "sonner"
import { BarChart, Loader2, RefreshCw, Activity, HelpCircle } from "lucide-react"
import GoodsForecastPanel from "./GoodsForecastPanel"
import { ErrorState } from "@/components/ui/ErrorState"
import { EmptyState } from "@/components/ui/EmptyState"
import { Skeleton } from "@/components/ui/skeleton"

const SEGMENT_NAMES = ["A-B", "B-C", "C-D", "D-E"]

interface GoodsForecastRow {
  segment_id: number
  forecast_date: string
  expected_goods_trains: number
  peak_hour_start: number | null
  peak_hour_end: number | null
}

interface TimetableRow {
  segment_id: number
  scheduled_time: string
}

type TrafficLevel = "low" | "moderate" | "high"

function trafficFor(count: number): {
  level: TrafficLevel
  bg: string
  fg: string
  label: string
  desc: string
} {
  if (count < 5) {
    return {
      level: "low",
      bg: "bg-green-500 dark:bg-green-400",
      fg: "text-white",
      label: "Low",
      desc: "Low traffic — good for maintenance",
    }
  }
  if (count <= 8) {
    return {
      level: "moderate",
      bg: "bg-amber-500 dark:bg-amber-400",
      fg: "text-white",
      label: "Moderate",
      desc: "Moderate traffic",
    }
  }
  return {
    level: "high",
    bg: "bg-red-500 dark:bg-red-400",
    fg: "text-white",
    label: "High",
    desc: "High traffic — avoid",
  }
}

const TRAFFIC_LEVELS: { count: number; range: string }[] = [
  { count: 2, range: "<5" },
  { count: 6, range: "5–8" },
  { count: 12, range: ">8" },
]

function fmtPeakHour(hour: number | null): string | null {
  if (hour == null) return null
  return `${String(hour).padStart(2, "0")}:00`
}

function fmtPeakHours(start: number | null, end: number | null): string {
  const s = fmtPeakHour(start)
  const e = fmtPeakHour(end)
  if (!s && !e) return "N/A"
  if (!s) return `until ${e}`
  if (!e) return `from ${s}`
  return `${s} – ${e}`
}

const supabase = createClient()

function dateRangeArray(start: string, end: string): string[] {
  const dates: string[] = []
  const s = new Date(start)
  const e = new Date(end)
  for (let d = new Date(s); d <= e; d.setUTCDate(d.getUTCDate() + 1)) {
    dates.push(d.toISOString().split("T")[0])
  }
  return dates
}

interface HeatmapCellProps {
  segName: string
  date: string
  count: number | null
  traffic: ReturnType<typeof trafficFor> | null
  row: GoodsForecastRow | null
}

function HeatmapCell({ segName, date, count, traffic, row }: HeatmapCellProps) {
  const dateLabel = new Date(date).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  })

  if (count === null || !traffic) {
    return (
      <div className="flex h-10 w-10 items-center justify-center rounded-md bg-muted text-muted-foreground text-xs">
        —
      </div>
    )
  }

  const peak = fmtPeakHours(
    row?.peak_hour_start ?? null,
    row?.peak_hour_end ?? null,
  )

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          className={cn(
            "flex h-10 w-10 items-center justify-center rounded-md text-xs font-medium text-white shadow-sm transition-transform duration-fast hover:scale-105",
            traffic.bg,
          )}
        >
          {count}
        </div>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-xs">
        <div className="space-y-1">
          <p className="font-medium">{segName}</p>
          <p>
            <span className="text-muted-foreground">Date:</span> {dateLabel}
          </p>
          <p>
            <span className="text-muted-foreground">Expected goods trains:</span>{" "}
            {count}
          </p>
          <p>
            <span className="text-muted-foreground">Peak hours:</span> {peak}
          </p>
          <p>
            <span className="text-muted-foreground">Traffic level:</span>{" "}
            {traffic.label}
          </p>
        </div>
      </TooltipContent>
    </Tooltip>
  )
}

export function CorridorAvailability() {
  const [startDate, setStartDate] = useState(() => {
    const d = new Date()
    return d.toISOString().split("T")[0]
  })
  const [endDate, setEndDate] = useState(() => {
    const d = new Date()
    d.setUTCDate(d.getUTCDate() + 6)
    return d.toISOString().split("T")[0]
  })
  const [forecastData, setForecastData] = useState<GoodsForecastRow[]>([])
  const [passengerPerSegment, setPassengerPerSegment] = useState<Record<number, number>>({})
  const [segmentMap, setSegmentMap] = useState<Record<number, string>>({})
  const [segmentCapacity, setSegmentCapacity] = useState<Record<number, number>>({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const { selectedCorridorId } = useCorridor()

  const dateRange = useMemo(() => dateRangeArray(startDate, endDate), [startDate, endDate])

  useEffect(() => {
    if (!startDate || !endDate) return

    const fetchData = async () => {
       setLoading(true)
      setError(null)
       try {
        let segmentsQuery = supabase
          .from("segments")
          .select("id, name")

        if (selectedCorridorId != null) {
          segmentsQuery = segmentsQuery.eq("corridor_id", selectedCorridorId)
        }

        const { data: segData, error: segError } = await segmentsQuery

        if (segError) throw segError

        const segMap: Record<number, string> = {}
        for (const seg of (segData ?? []) as { id: number; name: string }[]) {
          segMap[seg.id] = seg.name
        }
        setSegmentMap(segMap)

        const { data: statsRows, error: statsError } = await supabase
          .from("segment_stats")
          .select("segment_id, capacity_pct")

        const capMap: Record<number, number> = {}
        if (statsError) {
          console.warn("[CorridorAvailability] Failed to fetch segment_stats capacity_pct:", statsError.message)
        } else {
          for (const stat of (statsRows ?? []) as { segment_id: number; capacity_pct: number | null }[]) {
            if (!(stat.segment_id in capMap)) {
              capMap[stat.segment_id] = stat.capacity_pct ?? 20
            }
          }
        }
        setSegmentCapacity(capMap)

        const { data: forecastRows, error: forecastError } = await supabase
          .from("goods_train_forecast")
          .select("segment_id, forecast_date, expected_goods_trains, peak_hour_start, peak_hour_end")
          .gte("forecast_date", startDate)
          .lte("forecast_date", endDate)
          .order("forecast_date", { ascending: true })

        if (forecastError) throw forecastError
        setForecastData((forecastRows ?? []) as GoodsForecastRow[])

        const { data: timetableRows, error: timetableError } = await supabase
          .from("timetable")
          .select("segment_id, scheduled_time")

        if (timetableError) throw timetableError

        const counts: Record<number, number> = {}
        for (const row of (timetableRows ?? []) as TimetableRow[]) {
          const trainDate = new Date(row.scheduled_time).toISOString().split("T")[0]
          if (trainDate >= startDate && trainDate <= endDate) {
            counts[row.segment_id] = (counts[row.segment_id] ?? 0) + 1
          }
        }
        setPassengerPerSegment(counts)
      } catch (err) {
        toast.error("Failed to load corridor data", {
          description: err instanceof Error ? err.message : "Unknown error",
        })
        setError(err instanceof Error ? err.message : "Unknown error")
      } finally {
        setLoading(false)
      }
    }

    void fetchData()
  }, [startDate, endDate, refreshKey, selectedCorridorId])

  const forecastLookup = useMemo(() => {
    const map = new Map<string, GoodsForecastRow>()
    for (const row of forecastData) {
      map.set(`${row.segment_id}-${row.forecast_date}`, row)
    }
    return map
  }, [forecastData])

  const segmentIds = useMemo(() => {
    const allIds = Object.keys(segmentMap)
      .map(Number)
      .sort((a, b) => {
        const ai = SEGMENT_NAMES.indexOf(segmentMap[a] ?? "")
        const bi = SEGMENT_NAMES.indexOf(segmentMap[b] ?? "")
        return ai - bi
      })
    const ordered = SEGMENT_NAMES.map((name) => {
      const entry = Object.entries(segmentMap).find(([, n]) => n === name)
      return entry ? Number(entry[0]) : null
    }).filter((id): id is number => id !== null)
    // Fallback: if some expected segments aren't found, include any others
    return ordered.length > 0
      ? ordered.concat(allIds.filter((id) => !ordered.includes(id)))
      : allIds
  }, [segmentMap])

  const handleRefresh = () => {
    setRefreshKey((k) => k + 1)
  }

  const cellFor = (segId: number, date: string) => {
    const row = forecastLookup.get(`${segId}-${date}`)
    if (!row) {
      return { count: null as number | null, traffic: null, row: null }
    }
    const traffic = trafficFor(row.expected_goods_trains)
    return { count: row.expected_goods_trains, traffic, row }
  }

  return (
    <div className="space-y-4">
      <GoodsForecastPanel corridorId={selectedCorridorId} />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart className="h-5 w-5 text-primary" />
            Corridor Traffic Forecast
          </CardTitle>
          <CardDescription>
            Goods train volumes per segment per day across the selected window. Color
            intensity reflects traffic load; schedule maintenance during low-traffic
            (green) windows.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-4 items-end">
            <div className="flex flex-col gap-2">
              <label
                className="text-sm font-medium leading-none"
                htmlFor="start-date"
              >
                Start Date
              </label>
              <Input
                id="start-date"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-2">
              <label
                className="text-sm font-medium leading-none"
                htmlFor="end-date"
              >
                End Date
              </label>
              <Input
                id="end-date"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleRefresh}
              disabled={loading}
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Loading…
                </>
              ) : (
                <>
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Refresh
                </>
              )}
            </Button>
          </div>

          <div className="flex flex-wrap items-center gap-4 text-sm">
            {TRAFFIC_LEVELS.map((l) => {
              const t = trafficFor(l.count)
              return (
                <div key={t.level} className="flex items-center gap-2">
                  <div className={cn("h-4 w-4 rounded", t.bg)} />
                  <span className="font-medium">{t.label}</span>
                  <span className="text-muted-foreground">({l.range})</span>
                </div>
              )
            })}
          </div>

           {error ? (
             <ErrorState onRetry={handleRefresh} />
           ) : loading && dateRange.length === 0 ? (
             <div className="grid grid-cols-7 gap-1">
               {Array.from({ length: 4 * 7 }).map((_, i) => (
                 <Skeleton key={i} className="h-10 w-full rounded-md" />
               ))}
             </div>
           ) : segmentIds.length === 0 ? (
             <EmptyState
               icon={Activity}
               title="No segments found"
               description="No segments are configured for the selected corridor."
             />
           ) : (
            <TooltipProvider delayDuration={350}>
              <div className="overflow-x-auto">
                <div
                  className="grid gap-1"
                  style={{
                    gridTemplateColumns: `auto repeat(${dateRange.length}, minmax(0, 1fr))`,
                  }}
                >
                  <div />
                  {dateRange.map((date) => (
                    <div key={date} className="flex h-10 flex-col items-center justify-center text-center">
                      <span className="text-xs font-medium text-muted-foreground">
                        {new Date(date).toLocaleDateString("en-US", {
                          weekday: "short",
                        })}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {new Date(date).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                        })}
                      </span>
                    </div>
                  ))}

                   {segmentIds.map((segId) => {
                     const segName = segmentMap[segId] ?? `Segment ${segId}`
                     const passengerCount = passengerPerSegment[segId] ?? 0
                     const capacityPct = segmentCapacity[segId]
                     const capacityAdjusted = capacityPct != null && capacityPct !== 20
const capacityBadgeVariant =
                        capacityPct < 20
                          ? "warning"
                          : "success"
                     return (
                       <React.Fragment key={segId}>
                         <div className="flex h-10 items-center gap-2 text-sm font-medium">
                           {segName}
                           <span className="text-xs text-muted-foreground">
                             ({passengerCount} passengers)
                           </span>
{capacityAdjusted && (
                               <Tooltip>
                                 <TooltipTrigger asChild>
                                   <Badge
                                     variant={capacityBadgeVariant}
                                     className="text-xs flex items-center gap-1"
                                   >
                                     Capacity: {capacityPct}% (adjusted from history)
                                     <HelpCircle className="h-3 w-3" aria-hidden="true" />
                                   </Badge>
                                 </TooltipTrigger>
                                 <TooltipContent side="top" className="max-w-xs">
                                   <p>
                                     This segment's scheduling capacity has been
                                     automatically adjusted based on past execution
                                     performance.
                                   </p>
                                 </TooltipContent>
                               </Tooltip>
                             )}
                         </div>
                        {dateRange.map((date) => {
                          const cell = cellFor(segId, date)
                          return (
                            <HeatmapCell
                              key={date}
                              segName={segName}
                              date={date}
                              count={cell.count}
                              traffic={cell.traffic}
                              row={cell.row}
                            />
                          )
                        })}
                      </React.Fragment>
                    )
                  })}
                </div>
              </div>
            </TooltipProvider>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

export default CorridorAvailability
