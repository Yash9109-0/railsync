"use client"

import { useEffect, useRef, useState } from "react"
import { Train } from "lucide-react"
import { createClient } from "@/lib/supabase/client"

interface TimetableRow {
  train_number: string
  scheduled_time: string
}

const SEGMENTS = ["A-B", "B-C", "C-D", "D-E"]
const STATIONS = ["A", "B", "C", "D", "E"]
const MINUTES_PER_SEGMENT = 20
const TOTAL_MINUTES = SEGMENTS.length * MINUTES_PER_SEGMENT
const RECOMPUTE_MS = 5_000
const REFRESH_MS = 30_000
const FETCH_INTERVAL_TICKS = REFRESH_MS / RECOMPUTE_MS

const VIEW_W = 900
const VIEW_H = 200
const TRACK_Y = 100
const TRAIN_Y = 92
const PADDING = 70
const TRACK_LEN = VIEW_W - 2 * PADDING
const SEG_LEN = TRACK_LEN / SEGMENTS.length
const stationX = (i: number) => PADDING + SEG_LEN * i

interface ComputedTrain {
  train_number: string
  segmentIndex: number
  progress: number
}

function todayBounds(now: Date) {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000)
  return { start: start.getTime(), end: end.getTime() }
}

function computeTrains(rows: TimetableRow[], now: number): ComputedTrain[] {
  const earliest = new Map<string, number>()
  for (const row of rows) {
    const t = Date.parse(row.scheduled_time)
    if (!Number.isFinite(t)) continue
    const prev = earliest.get(row.train_number)
    if (prev === undefined || t < prev) earliest.set(row.train_number, t)
  }

  const result: ComputedTrain[] = []
  earliest.forEach((departedAt, train_number) => {
    const elapsedMin = (now - departedAt) / 60_000
    if (elapsedMin < 0 || elapsedMin >= TOTAL_MINUTES) return
    const segmentIndex = Math.min(
      SEGMENTS.length - 1,
      Math.floor(elapsedMin / MINUTES_PER_SEGMENT)
    )
    const progress =
      elapsedMin < segmentIndex * MINUTES_PER_SEGMENT
        ? 0
        : (elapsedMin % MINUTES_PER_SEGMENT) / MINUTES_PER_SEGMENT
    result.push({ train_number, segmentIndex, progress })
  })
  return result
}

export default function LiveTrackMap() {
  const supabaseRef = useRef<ReturnType<typeof createClient>>()
  if (!supabaseRef.current) supabaseRef.current = createClient()
  const supabase = supabaseRef.current

  const [rows, setRows] = useState<TimetableRow[]>([])
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      const { data, error } = await supabase
        .from("timetable")
        .select("train_number, scheduled_time")
        .order("scheduled_time", { ascending: true })
      if (!cancelled && !error && data) setRows(data as TimetableRow[])
    }
    load()
    let tick = 0
    const id = setInterval(() => {
      tick += 1
      setNow(Date.now())
      if (tick % FETCH_INTERVAL_TICKS === 0) load()
    }, RECOMPUTE_MS)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [supabase])

  const { start, end } = todayBounds(new Date(now))
  const todayRows = rows.filter((r) => {
    const t = Date.parse(r.scheduled_time)
    return t >= start && t < end
  })
  const trains = computeTrains(todayRows, now)
  const occupied = new Set(trains.map((t) => t.segmentIndex))

  return (
    <div className="relative w-full max-w-3xl aspect-[9/2]">
      <svg
        className="absolute inset-0 h-full w-full"
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        role="img"
        aria-label="Live train track map"
        aria-live="polite"
      >
        <title>Live Train Track Map</title>
        <desc>
          Stations A through E connected by track segments with live train
          positions and signal status.
        </desc>

        <g className="stroke-gray-200" strokeWidth={6} strokeLinecap="round">
          {SEGMENTS.map((_, i) => (
            <line
              key={`seg-line-${i}`}
              x1={stationX(i)}
              y1={TRACK_Y}
              x2={stationX(i + 1)}
              y2={TRACK_Y}
            />
          ))}
        </g>

        {SEGMENTS.map((_, i) => {
          const mid = (stationX(i) + stationX(i + 1)) / 2
          return (
            <g key={`seg-${i}`}>
              <circle
                cx={mid}
                cy={66}
                r={6}
                className={
                  occupied.has(i) ? "fill-red-500" : "fill-green-500"
                }
              />
            </g>
          )
        })}

        <g className="fill-gray-700 font-medium" fontSize={12} textAnchor="middle">
          {STATIONS.map((label, i) => (
            <text key={`station-${label}`} x={stationX(i)} y={128}>
              {label}
            </text>
          ))}
        </g>

        {STATIONS.map((_, i) => (
          <circle
            key={`node-${i}`}
            cx={stationX(i)}
            cy={TRACK_Y}
            r={18}
            className="fill-white stroke-gray-400 stroke-2"
          />
        ))}

        <g fontSize={11}>
          <circle cx={70} cy={18} r={6} className="fill-green-500" />
          <text x={88} y={21} className="fill-gray-600">
            Signal Clear
          </text>
          <circle cx={200} cy={18} r={6} className="fill-red-500" />
          <text x={218} y={21} className="fill-gray-600">
            Signal Occupied
          </text>
        </g>

        {rows.length === 0 && (
          <text
            x={VIEW_W / 2}
            y={VIEW_H / 2 + 30}
            className="fill-gray-400"
            fontSize={13}
            textAnchor="middle"
          >
            No timetable data for today
          </text>
        )}
      </svg>

      {trains.map((t) => {
        const x = stationX(t.segmentIndex) + t.progress * SEG_LEN
        return (
          <div
            key={t.train_number}
            className="absolute top-[46%] -translate-x-1/2 -translate-y-1/2 z-10 pointer-events-none"
            style={{ left: `${(x / VIEW_W) * 100}%` }}
            aria-label={`Train ${t.train_number} on segment ${SEGMENTS[t.segmentIndex]}`}
          >
            <Train className="h-4 w-4 text-blue-600" />
          </div>
        )
      })}
    </div>
  )
}
