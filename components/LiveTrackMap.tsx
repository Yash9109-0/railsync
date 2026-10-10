"use client";

import { useEffect, useMemo, useState } from "react";
import { Activity, Map as MapIcon, Train, Package } from "lucide-react";
import { useCorridor } from "@/context/CorridorContext";
import { LIVE_TRAIN_DATASET, type LiveTrain } from "./MapPreview";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui";
import { cn } from "@/lib/utils";
import MapPreview, { CORRIDOR_DATA } from "./MapPreview";

export { CORRIDOR_DATA };

export interface TimetableEntry {
  train_number: string;
  scheduled_time: string;
  track?: string | null;
  status?: string | null;
}

export interface LiveTrackMapProps {
  timetable?: TimetableEntry[];
}

const CORRIDOR_1_STATIONS: readonly string[] = [
  "Raipur Jn",
  "Saraswati Nagar",
  "Sarona",
  "Kumhari",
  "Bhilai",
];

const CORRIDOR_2_STATIONS: readonly string[] = [
  "Raipur Jn",
  "WRS Colony",
  "Urkura",
  "Mandhar",
  "Silyari",
];

const STATIONS = CORRIDOR_1_STATIONS;
const NUM_SEGMENTS = STATIONS.length - 1;
const MINUTES_PER_SEGMENT = 20;
const TOTAL_MINUTES = NUM_SEGMENTS * MINUTES_PER_SEGMENT;
const RECOMPUTE_MS = 5_000;
const TRAIL_LENGTH = 0.15;

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
    const progress =
      elapsedMin < segmentIndex * MINUTES_PER_SEGMENT? 0 : (elapsedMin % MINUTES_PER_SEGMENT) / MINUTES_PER_SEGMENT;
    positions.push({ train_number, segmentIndex, progress, departedAt });
  });

  positions.sort((a, b) => a.departedAt - b.departedAt);

  return positions.map((p, i) => {
    const rowWithTrack = rows.find((r) => r.train_number === p.train_number && r.track);
    const resolved = rowWithTrack? resolveTrackKey(rowWithTrack.track) : null;
    const liveMeta = LIVE_TRAIN_DATASET.find(
      (lt) => lt.trainNo === p.train_number || lt.id === p.train_number
    );
    const metaResolved = liveMeta ? resolveTrackKey(liveMeta.track) : null;

    return {
      train_number: p.train_number,
      segmentIndex: p.segmentIndex,
      progress: liveMeta ? liveMeta.progress : p.progress,
      track: metaResolved ?? resolved ?? assignTrack(i, positions.length),
    };
  });
}

export default function LiveTrackMap({ timetable = [] }: LiveTrackMapProps) {
  const { selectedCorridorId } = useCorridor();
  const isCorridor2 = selectedCorridorId === 2 || String(selectedCorridorId).includes('2');
  const stations = isCorridor2 ? CORRIDOR_2_STATIONS : CORRIDOR_1_STATIONS;
  const currentCorridorKey = isCorridor2 ? "corridor-2" : "corridor-1";
  const [viewMode, setViewMode] = useState<"map" | "schematic">("map");
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), RECOMPUTE_MS);
    return () => clearInterval(id);
  }, []);

  const activeTrains = useMemo(() => {
    return LIVE_TRAIN_DATASET.filter((t) => t.corridorId === currentCorridorKey);
  }, [currentCorridorKey]);

  const trains = useMemo(() => {
    const { start, end } = todayBounds(new Date(now));
    const todayRows = timetable.filter((r) => {
      const t = Date.parse(r.scheduled_time);
      return Number.isFinite(t) && t >= start && t < end;
    });
    const computed = computeActiveTrains(todayRows, now);
    if (computed.length > 0) return computed;

    return activeTrains.map((t) => ({
      train_number: t.trainNo,
      segmentIndex: Math.min(NUM_SEGMENTS - 1, Math.max(0, Math.floor(t.progress * NUM_SEGMENTS))),
      progress: t.progress,
      track: (t.track.toLowerCase().includes("down")
        ? "down"
        : t.track.toLowerCase().includes("loop") || t.track.toLowerCase().includes("siding")
        ? "loop"
        : "up") as TrackId,
    }));
  }, [timetable, now, activeTrains]);

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
        <CardTitle className="flex flex-wrap items-center justify-between gap-3 font-semibold">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-2">
              Live Corridor View
              <span className="flex items-center gap-2 text-xs font-normal text-muted-foreground">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 dark:bg-green-400 opacity-75"></span>
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-green-400 dark:bg-green-400 animate-pulse"></span>
                </span>
                Live
              </span>
            </span>
            {activeTrains.length > 0 ? (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium leading-none min-h-[24px] bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                {activeTrains.length} Active Trains
              </span>
            ) : (
              <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium leading-none min-h-[24px] bg-gray-100 text-gray-500 border border-gray-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700">
                No active trains
              </span>
            )}
          </div>

          {/* View mode toggle */}
          <div className="flex items-center gap-1 bg-muted/60 p-1 rounded-xl border border-border">
            <button
              type="button"
              onClick={() => setViewMode("map")}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-all",
                viewMode === "map"
                  ? "bg-white text-primary shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <MapIcon className="w-3.5 h-3.5" />
              <span>Interactive Map</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode("schematic")}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-all",
                viewMode === "schematic"
                  ? "bg-white text-primary shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Activity className="w-3.5 h-3.5" />
              <span>Track Schematic</span>
            </button>
          </div>
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-3">
        {viewMode === "map" ? (
          <MapPreview className="w-full" showControls={true} trains={activeTrains} />
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs font-medium text-muted-foreground">
              {TRACKS.map((track) => (
                <span key={track.id}>{track.label}</span>
              ))}
            </div>

            <div className="relative w-full aspect-[3/1]">
<svg
             className="absolute inset-0 h-full w-full"
             viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
             role="img"
             aria-label="Live corridor track map"
           >
             <defs>
               <pattern id="gridPattern" x="0" y="0" width="40" height="40" patternUnits="userSpaceOnUse">
                 <line x1="0" y1="0" x2="40" y2="0" stroke="currentColor" strokeWidth="0.5" opacity="0.06" />
                 <line x1="0" y1="0" x2="0" y2="40" stroke="currentColor" strokeWidth="0.5" opacity="0.06" />
               </pattern>
               <linearGradient id="ambientGradient" x1="0" y1="0" x2="1" y2="1">
                 <stop offset="0%" stopColor="hsl(var(--primary) / 0.04)" />
                 <stop offset="50%" stopColor="hsl(var(--primary) / 0.01)" />
                 <stop offset="100%" stopColor="hsl(var(--primary) / 0.04)" />
               </linearGradient>
               <radialGradient id="vignetteGradient" cx="50%" cy="50%" r="70%">
                 <stop offset="0%" stopColor="hsl(var(--surface-1) / 0)" />
                 <stop offset="70%" stopColor="hsl(var(--surface-1) / 0)" />
                 <stop offset="100%" stopColor="hsl(var(--surface-1) / 0.15)" />
               </radialGradient>
               {TRACKS.map((track) => (
                 <linearGradient
                   key={`trail-${track.id}`}
                   id={`trailGradient-${track.id}`}
                   x1="0%"
                   y1="0%"
                   x2="100%"
                   y2="0%"
                 >
                   <stop offset="0%" stopColor="hsl(var(--primary) / 0)" />
                   <stop offset="60%" stopColor="hsl(var(--primary) / 0.15)" />
                   <stop offset="100%" stopColor="hsl(var(--primary) / 0.45)" />
                 </linearGradient>
               ))}
             </defs>
             {/* Ambient background layer */}
             <rect x="0" y="0" width={VIEW_W} height={VIEW_H} fill="url(#ambientGradient)" />
             <rect x={PADDING} y={TRACKS[0].y - 60} width={TRACK_LEN} height={TRACKS[TRACKS.length - 1].y - TRACKS[0].y + 80} fill="url(#gridPattern)" stroke="none" />
             {/* Subtle vignette for control-room depth */}
             <rect x="0" y="0" width={VIEW_W} height={VIEW_H} fill="url(#vignetteGradient)" pointerEvents="none" />
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
                      className={isOccupied? "fill-red-500 animate-pulse glow-destructive" : "fill-green-400 glow-success"}
                    />
                  </g>
                );
              })
            )}

            {TRACKS.map((track) =>
              stations.map((_: string, i: number) => (
                <g key={`station-${track.id}-${i}`}>
                  <circle cx={stationX(i)} cy={track.y} r={20} className="fill-primary/15" />
                  <circle cx={stationX(i)} cy={track.y} r={STATION_R} className="fill-white stroke-primary stroke-2 dark:fill-gray-900" />
                </g>
              ))
            )}

            {stations.map((label: string, i: number) => (
              <text key={`stationlabel-${label}`} x={stationX(i)} y={LABEL_Y} textAnchor="middle" fontSize={11} fontWeight={700} className="fill-gray-700 dark:fill-gray-300">
                {label}
              </text>
            ))}

            {trains.map((t) => {
              const track = TRACKS.find((tr) => tr.id === t.track);
              if (!track) return null;
              const x = stationX(t.segmentIndex) + t.progress * SEG_LEN;
              const trailStartX = Math.max(stationX(t.segmentIndex), x - TRAIL_LENGTH * SEG_LEN);
              const trailEndX = x;
              return (
                <line
                  key={`trail-${t.train_number}`}
                  x1={trailStartX}
                  y1={track.y}
                  x2={trailEndX}
                  y2={track.y}
                  stroke={`url(#trailGradient-${track.id})`}
                  strokeWidth={6}
                  strokeLinecap="round"
                  opacity={0.8}
                />
              );
            })}
          </svg>

          {trains.map((t) => {
            const x = stationX(t.segmentIndex) + t.progress * SEG_LEN;
            const track = TRACKS.find((tr) => tr.id === t.track);
            const y = track ? track.y : 0;
            const liveMeta = LIVE_TRAIN_DATASET.find(
              (lt) => lt.trainNo === t.train_number || lt.id === t.train_number
            );
            const isMaterial = liveMeta?.category === "Material";

            return (
              <div
                key={t.train_number}
                className="pointer-events-none absolute z-20"
                style={{
                  left: `${(x / VIEW_W) * 100}%`,
                  top: `${(y / VIEW_H) * 100}%`,
                  transform: "translate(-50%, -140%)",
                }}
              >
                <div className="flex flex-col items-center">
                  <div
                    className={cn(
                      "flex items-center gap-1.5 px-2.5 py-1 rounded-md shadow-md border text-xs font-bold",
                      isMaterial
                        ? "bg-white text-amber-700 border-amber-500/40"
                        : "bg-white text-[#7c3aed] border-[#7c3aed]/40"
                    )}
                  >
                    {isMaterial ? (
                      <Package className="h-3.5 w-3.5 text-amber-600" />
                    ) : (
                      <Train className="h-3.5 w-3.5 text-primary" />
                    )}
                    <span>{t.train_number}</span>
                    {isMaterial && (
                      <span className="bg-amber-600 text-white text-[8px] font-extrabold px-1 rounded">
                        MAT
                      </span>
                    )}
                  </div>
                  <div className="w-0 h-0 border-x-4 border-t-4 border-x-transparent border-t-white"></div>
                </div>
              </div>
            );
          })}

          {timetable.length === 0 && (
            <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center p-4">
              <div className="rounded-xl border bg-card/95 px-6 py-4 text-center text-sm font-medium text-muted-foreground shadow-sm backdrop-blur-sm">
                No active trains on the corridor right now
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-center gap-4 text-xs text-muted-foreground pt-1">
          <span className="flex items-center gap-2"><span className="h-3 w-3 rounded-full bg-success glow-success" />Signal Clear</span>
          <span className="flex items-center gap-2"><span className="h-3 w-3 rounded-full bg-destructive animate-pulse glow-destructive" />Signal Occupied</span>
          <span className="flex items-center gap-2"><Train className="h-4 w-4 text-primary" />Train</span>
        </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
