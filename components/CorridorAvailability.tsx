"use client"

import { useEffect, useMemo, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { toast } from "sonner"
import { CalendarDays, Loader2, RefreshCw } from "lucide-react"
import GoodsForecastPanel from "./GoodsForecastPanel"

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
      bg: "bg-green-500",
      fg: "text-white",
      label: "Low",
      desc: "Low traffic — good for maintenance",
    }
  }
  if (count <= 8) {
    return {
      level: "moderate",
      bg: "bg-amber-500",
      fg: "text-white",
      label: "Moderate",
      desc: "Moderate traffic",
    }
  }
  return {
    level: "high",
    bg: "bg-red-500",
    fg: "text-white",
    label: "High",
    desc: "High traffic — avoid",
  }
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
  const [loading, setLoading] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)

  const dateRange = useMemo(() => dateRangeArray(startDate, endDate), [startDate, endDate])

  useEffect(() => {
    if (!startDate || !endDate) return

    const fetchData = async () => {
      setLoading(true)
      try {
        const { data: segData, error: segError } = await supabase
          .from("segments")
          .select("id, name")

        if (segError) throw segError

        const segMap: Record<number, string> = {}
        for (const seg of (segData ?? []) as { id: number; name: string }[]) {
          segMap[seg.id] = seg.name
        }
        setSegmentMap(segMap)

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
      } finally {
        setLoading(false)
      }
    }

    void fetchData()
  }, [startDate, endDate, refreshKey])

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
      return { count: null as number | null, traffic: null }
    }
    const traffic = trafficFor(row.expected_goods_trains)
    return { count: row.expected_goods_trains, traffic }
  }

  return (
    <div className="space-y-4">
      <GoodsForecastPanel />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CalendarDays className="h-5 w-5 text-muted-foreground" />
            Corridor Availability
          </CardTitle>
          <CardDescription>
            Goods train volumes per segment per day. Green = good for
            maintenance, red = high traffic — avoid scheduling blocks.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-4 items-end">
            <div className="flex flex-col gap-1.5">
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
            <div className="flex flex-col gap-1.5">
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
                  <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
                  Loading…
                </>
              ) : (
                <>
                  <RefreshCw className="h-4 w-4 mr-1.5" />
                  Refresh
                </>
              )}
            </Button>
          </div>

          <div className="flex flex-wrap gap-4 text-xs">
            <div className="flex items-center gap-1.5">
              <div className="h-3 w-3 rounded-full bg-green-500" />
              <span>Low (&lt;5) — Good for maintenance</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="h-3 w-3 rounded-full bg-amber-500" />
              <span>Moderate (5–8)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="h-3 w-3 rounded-full bg-red-500" />
              <span>High (&gt;8) — Avoid</span>
            </div>
          </div>

          {loading && dateRange.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" />
              <p>Loading corridor data…</p>
            </div>
          ) : segmentIds.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground">
              <p>No segments found.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Segment</TableHead>
                    <TableHead className="text-center">
                      Passenger Trains
                    </TableHead>
                    {dateRange.map((date) => (
                      <TableHead key={date} className="text-center">
                        <div className="transform -rotate-90 origin-center">
                          {new Date(date).toLocaleDateString("en-US", {
                            weekday: "short",
                            month: "short",
                            day: "numeric",
                          })}
                        </div>
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {segmentIds.map((segId) => {
                    const segName = segmentMap[segId] ?? `Segment ${segId}`
                    const passengerCount = passengerPerSegment[segId] ?? 0
                    return (
                      <TableRow key={segId}>
                        <TableCell className="font-medium">{segName}</TableCell>
                        <TableCell className="text-center">
                          {passengerCount}
                        </TableCell>
                        {dateRange.map((date) => {
                          const { count, traffic } = cellFor(segId, date)
                          if (count === null || !traffic) {
                            return (
                              <TableCell
                                key={date}
                                className="text-center text-muted-foreground"
                              >
                                —
                              </TableCell>
                            )
                          }
                          return (
                            <TableCell key={date} className="text-center">
                              <div
                                className={`mx-auto flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold ${traffic.bg} ${traffic.fg}`}
                                title={`${segName} on ${date}: ${count} goods trains — ${traffic.desc}`}
                              >
                                {count}
                              </div>
                            </TableCell>
                          )
                        })}
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

export default CorridorAvailability
