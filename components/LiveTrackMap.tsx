"use client";

import { useEffect, useMemo, useState } from "react";
import { Train } from "lucide-react";

export interface TimetableEntry {
  train_number: string;
  scheduled_time: string;
  track?: string | null;
  status?: string | null;
}

export interface LiveTrackMapProps {
  timetable?: TimetableEntry[];
}

const STATIONS = ["STN1", "STN2", "STN3", "STN4", "STN5"] as const;
const NUM_SEGMENTS = STATIONS.length - 1;
const MINUTES_PER_SEGMENT = 20;
const TOTAL_MINUTES = NUM_SEGMENTS * MINUTES_PER_SEGMENT;
const RECOMPUTE_MS = 5_000;

type TrackId = "up" | "down" | "loop";

interface TrackConfig {
  id: TrackId;
  label: string;
  y: number;
  signalY: number;
}

const TRACKS: TrackConfig[] = [
  { id: "up", label: "UP Main (Track 1)", y: 70, signalY: 45 },
  { id: "down", label: "DOWN Main (Track 2)", y: 120, signalY: 95 },
  { id: "loop", label: "Loop/Siding (Track 3)", y: 170, signalY: 145 },
];

const VIEW_W = 900;
const VIEW_H = 300;
const PADDING = 80;
const TRACK_LEN = VIEW_W - 2 * PADDING;
const SEG_LEN = TRACK_LEN / NUM_SEGMENTS;
const stationX = (i: number) => PADDING + SEG_LEN * i;
const STATION_R = 12;
const LABEL_Y = 205;

interface ComputedTrain {
  train_number: string;
  segmentIndex: number;
  progress: number;
  track: TrackId;
}

function todayBounds(now: Date) {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { start: start.getTime(), end: end.getTime() };
}

function resolveTrackKey(t: string | null | undefined): TrackId | null {
  if (!t) return null;
  const s = String(t).toLowerCase().trim();
  if (s === "up" || s === "1" || s === "track-1" || s === "track1" || s === "main")
    return "up";
  if (s === "down" || s === "2" || s === "track-2" || s === "track2")
    return "down";
  if (s === "loop" || s === "3" || s === "siding" || s === "track-3" || s === "track3")
    return "loop";
  return null;
}

function assignTrack(index: number, total: number): TrackId {
  if (total > 2 && index === total - 1) return "loop";
  return index % 2 === 0 ? "up" : "down";
}

function computeActiveTrains(
  rows: TimetableEntry[],
  now: number,
): ComputedTrain[] {
  const earliest = new Map<string, number>();
  for (const row of rows) {
    const t = Date.parse(row.scheduled_time);
    if (!Number.isFinite(t)) continue;
    const prev = earliest.get(row.train_number);
    if (prev === undefined || t < prev) earliest.set(row.train_number, t);
  }

  type TrainPos = {
    train_number: string;
    segmentIndex: number;
    progress: number;
    departedAt: number;
  };

  const positions: TrainPos[] = [];

  earliest.forEach((departedAt, train_number) => {
    const elapsedMin = (now - departedAt) / 60_000;
    if (elapsedMin < 0 || elapsedMin >= TOTAL_MINUTES) return;
    const segmentIndex = Math.min(
      NUM_SEGMENTS - 1,
      Math.max(0, Math.floor(elapsedMin / MINUTES_PER_SEGMENT)),
    );
    const progress =
      elapsedMin < segmentIndex * MINUTES_PER_SEGMENT
        ? 0
        : (elapsedMin % MINUTES_PER_SEGMENT) / MINUTES_PER_SEGMENT;
    positions.push({ train_number, segmentIndex, progress, departedAt });
  });

  positions.sort((a, b) => a.departedAt - b.departedAt);

  return positions.map((p, i) => {
    const rowWithTrack = rows.find(
      (r) => r.train_number === p.train_number && r.track,
    );
    const resolved = rowWithTrack ? resolveTrackKey(rowWithTrack.track) : null;
    return {
      train_number: p.train_number,
      segmentIndex: p.segmentIndex,
      progress: p.progress,
      track: resolved ?? assignTrack(i, positions.length),
    };
  });
}

export default function LiveTrackMap({ timetable = [] }: LiveTrackMapProps) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), RECOMPUTE_MS);
    return () => clearInterval(id);
  }, []);

  const trains = useMemo(() => {
    const { start, end } = todayBounds(new Date(now));
    const todayRows = timetable.filter((r) => {
      const t = Date.parse(r.scheduled_time);
      return Number.isFinite(t) && t >= start && t < end;
    });
    return computeActiveTrains(todayRows, now);
  }, [timetable, now]);

  const occupied = useMemo(() => {
    const occ: Record<TrackId, Set<number>> = {
      up: new Set(),
      down: new Set(),
      loop: new Set(),
    };
    for (const t of trains) {
      occ[t.track].add(t.segmentIndex);
    }
    return occ;
  }, [trains]);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs font-medium text-muted-foreground">
        {TRACKS.map((track) => (
          <span key={track.id}>{track.label}</span>
        ))}
      </div>

      <div className="relative w-full max-w-3xl mx-auto aspect-[3/1]">
        <svg
          className="absolute inset-0 h-full w-full"
          viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
          role="img"
          aria-label="Live corridor track map with 3 parallel tracks"
        >
          <title>Live Corridor Track Map</title>
          <desc>
            Three parallel railway tracks (UP Main, DOWN Main, Loop/Siding)
            with stations STN1 through STN5. Green signal dots indicate clear
            segments; red dots indicate segments occupied by a train.
          </desc>

          {TRACKS.map((track) => (
            <g
              key={`lines-${track.id}`}
              strokeWidth={6}
              strokeLinecap="round"
              className="stroke-gray-300"
            >
              {Array.from({ length: NUM_SEGMENTS }).map((_, i) => (
                <line
                  key={`line-${track.id}-${i}`}
                  x1={stationX(i)}
                  y1={track.y}
                  x2={stationX(i + 1)}
                  y2={track.y}
                />
              ))}
            </g>
          ))}

          {TRACKS.map((track) => (
            <text
              key={`tlabel-${track.id}`}
              x={10}
              y={track.y + 4}
              fontSize={11}
              className="fill-gray-500"
            >
              T{track.id === "up" ? 1 : track.id === "down" ? 2 : 3}
            </text>
          ))}

          {TRACKS.map((track) =>
            Array.from({ length: NUM_SEGMENTS }).map((_, i) => {
              const midX = (stationX(i) + stationX(i + 1)) / 2;
              const isOccupied = occupied[track.id].has(i);
              return (
                <circle
                  key={`signal-${track.id}-${i}`}
                  cx={midX}
                  cy={track.signalY}
                  r={6}
                  className={
                    isOccupied ? "fill-red-500" : "fill-green-500"
                  }
                />
              );
            }),
          )}

          {TRACKS.map((track) =>
            STATIONS.map((_, i) => (
              <circle
                key={`station-${track.id}-${i}`}
                cx={stationX(i)}
                cy={track.y}
                r={STATION_R}
                className="fill-white stroke-gray-400 stroke-2"
              />
            )),
          )}

          {STATIONS.map((label, i) => (
            <text
              key={`stationlabel-${label}`}
              x={stationX(i)}
              y={LABEL_Y}
              textAnchor="middle"
              fontSize={13}
              fontWeight={600}
              className="fill-gray-700"
            >
              {label}
            </text>
          ))}

          <text
            x={VIEW_W - PADDING}
            y={LABEL_Y}
            textAnchor="end"
            fontSize={12}
            className="fill-gray-500"
          >
            {trains.length > 0
              ? `${trains.length} active train${trains.length === 1 ? "" : "s"}`
              : "No active trains"}
          </text>
        </svg>

        {trains.map((t) => {
          const x = stationX(t.segmentIndex) + t.progress * SEG_LEN;
          const track = TRACKS.find((tr) => tr.id === t.track);
          const y = track ? track.y : 0;
          const trackLabel = track ? track.label : "Track";
          return (
            <div
              key={t.train_number}
              className="absolute z-10 flex items-center gap-1 pointer-events-none"
              style={{
                left: `${(x / VIEW_W) * 100}%`,
                top: `${(y / VIEW_H) * 100}%`,
                transform: "translate(-50%, -50%)",
              }}
              aria-label={`Train ${t.train_number} on ${trackLabel}, segment ${t.segmentIndex + 1}`}
            >
              <Train className="h-5 w-5 text-blue-600" />
              <span className="text-xs font-medium text-blue-700 whitespace-nowrap">
                {t.train_number}
              </span>
            </div>
          );
        })}

        {trains.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
            No active trains on the corridor right now
          </div>
        )}
      </div>

      <div className="flex items-center justify-center gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-full bg-green-500" />
          <span>Signal Clear</span>
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-full bg-red-500" />
          <span>Signal Occupied</span>
        </span>
        <span className="flex items-center gap-1.5">
          <Train className="h-4 w-4 text-blue-600" />
          <span>Train</span>
        </span>
      </div>
    </div>
  );
}
