"use client";

import { useEffect, useMemo, useState } from "react";
import { Train } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui";

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
const STATION_R = 16;
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
  if (s === "up" || s === "1" || s === "track-1" || s === "track1" || s === "main") return "up";
  if (s === "down" || s === "2" || s === "track-2" || s === "track2") return "down";
  if (s === "loop" || s === "3" || s === "siding" || s === "track-3" || s === "track3") return "loop";
  return null;
}

function assignTrack(index: number, total: number): TrackId {
  if (total > 2 && index === total - 1) return "loop";
  return index % 2 === 0? "up" : "down";
}

function computeActiveTrains(rows: TimetableEntry[], now: number): ComputedTrain[] {
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
    const segmentIndex = Math.min(NUM_SEGMENTS - 1, Math.max(0, Math.floor(elapsedMin / MINUTES_PER_SEGMENT)));
    const progress = elapsedMin < segmentIndex * MINUTES_PER_SEGMENT? 0 : (elapsedMin % MINUTES_PER_SEGMENT) / MINUTES_PER_SEGMENT;
    positions.push({ train_number, segmentIndex, progress, departedAt });
  });

  positions.sort((a, b) => a.departedAt - b.departedAt);

  return positions.map((p, i) => {
    const rowWithTrack = rows.find((r) => r.train_number === p.train_number && r.track);
    const resolved = rowWithTrack? resolveTrackKey(rowWithTrack.track) : null;
    return {
      train_number: p.train_number,
      segmentIndex: p.segmentIndex,
      progress: p.progress,
      track: resolved?? assignTrack(i, positions.length),
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
    for (const t of trains) occ[t.track].add(t.segmentIndex);
    return occ;
  }, [trains]);

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between text-[15px] font-semibold">
          <span className="flex items-center gap-2">
            Live Corridor View
            <span className="flex items-center gap-1.5 text-xs font-normal text-muted-foreground">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 dark:bg-green-400 opacity-75"></span>
                <span className="relative inline-flex h-2 w-2 rounded-full bg-green-400 dark:bg-green-400 animate-pulse"></span>
              </span>
              Live
            </span>
          </span>
          <span className="text-xs font-medium text-muted-foreground bg-muted px-2.5 py-1 rounded-full border">
            {trains.length > 0? `${trains.length} active train${trains.length === 1? "" : "s"}` : "No active trains"}
          </span>
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-[11px] font-medium text-muted-foreground">
          {TRACKS.map((track) => (
            <span key={track.id}>{track.label}</span>
          ))}
        </div>

        <div className="relative w-full max-w-3xl mx-auto aspect-[3/1]">
          <svg
            className="absolute inset-0 h-full w-full"
            viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
            role="img"
            aria-label="Live corridor track map"
          >
            {TRACKS.map((track) => (
              <g key={`lines-${track.id}`} strokeWidth={4} strokeLinecap="round" className="stroke-gray-300 dark:stroke-gray-600">
                {Array.from({ length: NUM_SEGMENTS }).map((_, i) => (
                  <line key={`line-${track.id}-${i}`} x1={stationX(i)} y1={track.y} x2={stationX(i + 1)} y2={track.y} />
                ))}
              </g>
            ))}

            {TRACKS.map((track) => (
              <text key={`tlabel-${track.id}`} x={10} y={track.y + 4} fontSize={11} className="fill-gray-500 dark:fill-gray-400">
                T{track.id === "up"? 1 : track.id === "down"? 2 : 3}
              </text>
            ))}

            {TRACKS.map((track) =>
              Array.from({ length: NUM_SEGMENTS }).map((_, i) => {
                const midX = (stationX(i) + stationX(i + 1)) / 2;
                const isOccupied = occupied[track.id].has(i);
                return (
                  <g key={`signal-${track.id}-${i}`}>
                    {!isOccupied && <circle cx={midX} cy={track.signalY} r={10} className="fill-green-400/20 dark:fill-green-400/30" />}
                    <circle
                      cx={midX}
                      cy={track.signalY}
                      r={5.5}
                      className={isOccupied? "fill-red-500 animate-pulse drop-shadow-[0_0_6px_rgba(239,68,68,0.9)]" : "fill-green-400 dark:fill-green-400 drop-shadow-[0_0_6px_rgba(34,197,94,0.8)]"}
                    />
                  </g>
                );
              })
            )}

            {TRACKS.map((track) =>
              STATIONS.map((_, i) => (
                <g key={`station-${track.id}-${i}`}>
                  <circle cx={stationX(i)} cy={track.y} r={20} className="fill-[#960DF2]/15" />
                  <circle cx={stationX(i)} cy={track.y} r={STATION_R} className="fill-white stroke-[#960DF2] stroke-2 drop-shadow-[0_0_8px_rgba(150,13,255,0.25)] dark:fill-gray-900" />
                </g>
              ))
            )}

            {STATIONS.map((label, i) => (
              <text key={`stationlabel-${label}`} x={stationX(i)} y={LABEL_Y} textAnchor="middle" fontSize={12} fontWeight={700} className="fill-gray-700 dark:fill-gray-300">
                {label}
              </text>
            ))}
          </svg>

          {trains.map((t) => {
            const x = stationX(t.segmentIndex) + t.progress * SEG_LEN;
            const track = TRACKS.find((tr) => tr.id === t.track);
            const y = track? track.y : 0;
            return (
              <div key={t.train_number} className="pointer-events-none absolute z-20" style={{ left: `${(x / VIEW_W) * 100}%`, top: `${(y / VIEW_H) * 100}%`, transform: "translate(-50%, -140%)" }}>
                <div className="flex flex-col items-center">
                  <div className="flex items-center gap-1 bg-white dark:bg-gray-800 px-1.5 py-0.5 rounded-md shadow-sm border text-[10px] font-semibold text-blue-700 dark:text-blue-300">
                    <Train className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
                    {t.train_number}
                  </div>
                  <div className="w-0 h-0 border-l-[4px] border-r-[4px] border-t-[4px] border-l-transparent border-r-transparent border-t-white drop-shadow-sm"></div>
                </div>
              </div>
            );
          })}

          {trains.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">No active trains on the corridor right now</div>
          )}
        </div>

        <div className="flex items-center justify-center gap-4 text-xs text-muted-foreground pt-1">
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-green-400 dark:bg-green-400 shadow-[0_0_6px_rgba(34,197,94,0.8)]" />Signal Clear</span>
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-red-500 animate-pulse shadow-[0_0_6px_rgba(239,68,68,0.8)]" />Signal Occupied</span>
          <span className="flex items-center gap-1.5"><Train className="h-4 w-4 text-blue-600 dark:text-blue-400" />Train</span>
        </div>
      </CardContent>
    </Card>
  );
}