"use client";

import { useEffect, useMemo, useState } from "react";
import {
  MapContainer,
  TileLayer,
  Polyline,
  Marker,
  Popup,
  Tooltip,
  useMap,
} from "react-leaflet";
import L from "leaflet";
import { useCorridor } from "@/context/CorridorContext";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Activity,
  AlertCircle,
  CheckCircle2,
  Layers,
  MapPin,
  Maximize2,
  Navigation,
  Radio,
  Train,
} from "lucide-react";

// Fix default leaflet icons if any are referenced
if (typeof window !== "undefined") {
  delete (L.Icon.Default.prototype as L.Icon.Default & {
    _getIconUrl?: unknown;
  })._getIconUrl;

  L.Icon.Default.mergeOptions({
    iconRetinaUrl:
      "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
    iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
    shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  });
}

export interface StationData {
  name: string;
  code: string;
  pos: [number, number];
  status: "Clear" | "Occupied" | string;
}

export interface CorridorDetail {
  name: string;
  color: string;
  stations: StationData[];
}

export const CORRIDOR_DATA: Record<"corridor-1" | "corridor-2", CorridorDetail> = {
  "corridor-1": {
    name: "Corridor 1: Raipur – Durg Line",
    color: "#7c3aed",
    stations: [
      { name: "Raipur Jn", code: "R", pos: [21.2568, 81.6289], status: "Clear" },
      { name: "Saraswati Nagar", code: "SRWN", pos: [21.2462, 81.6052], status: "Clear" },
      { name: "Sarona", code: "SZB", pos: [21.2395, 81.5658], status: "Clear" },
      { name: "Kumhari", code: "KMI", pos: [21.2291, 81.5124], status: "Clear" },
      { name: "Bhilai", code: "BIA", pos: [21.2062, 81.4285], status: "Occupied" },
    ],
  },
  "corridor-2": {
    name: "Corridor 2: Raipur – Bilaspur Line",
    color: "#2563eb",
    stations: [
      { name: "Raipur Jn", code: "R", pos: [21.2568, 81.6289], status: "Clear" },
      { name: "WRS Colony", code: "WRC", pos: [21.2721, 81.6441], status: "Clear" },
      { name: "Urkura", code: "URK", pos: [21.2946, 81.6521], status: "Clear" },
      { name: "Mandhar", code: "MDH", pos: [21.3653, 81.6912], status: "Clear" },
      { name: "Silyari", code: "SLH", pos: [21.4641, 81.7654], status: "Clear" },
    ],
  },
};

export type CorridorKey = keyof typeof CORRIDOR_DATA;

export interface LiveTrain {
  id: string;
  trainNo: string;
  name: string;
  category: "Passenger" | "Material";
  type: string;
  cargo: string;
  corridorId: "corridor-1" | "corridor-2";
  track: string;
  progress: number;
  speed: number;
  direction: number;
  status: string;
  color: string;
}

export const LIVE_TRAIN_DATASET: LiveTrain[] = [
  // ==========================================
  // CORRIDOR 1: Raipur – Durg Line
  // ==========================================
  {
    id: "12834",
    trainNo: "12834",
    name: "Howrah – Ahmedabad SF Express",
    category: "Passenger",
    type: "Superfast",
    cargo: "Passengers (22 Coaches)",
    corridorId: "corridor-1",
    track: "UP Main (T1)",
    progress: 0.22,
    speed: 84,
    direction: 1,
    status: "On Time",
    color: "#7c3aed" // Purple badge
  },
  {
    id: "18237",
    trainNo: "18237",
    name: "Chhattisgarh Express",
    category: "Passenger",
    type: "Mail/Express",
    cargo: "Passengers (24 Coaches)",
    corridorId: "corridor-1",
    track: "DOWN Main (T2)",
    progress: 0.68,
    speed: 62,
    direction: -1,
    status: "Delayed 5m",
    color: "#2563eb" // Blue badge
  },
  {
    id: "MAT-BOXN-541",
    trainNo: "MAT-541",
    name: "Bhilai Steel Plant Raw Coal Rake",
    category: "Material",
    type: "BOXN Coal Hopper",
    cargo: "58 BOXN Wagons • 3,850 T Coking Coal",
    corridorId: "corridor-1",
    track: "Loop/Siding (T3)",
    progress: 0.42,
    speed: 44,
    direction: 1,
    status: "Priority Siding Hold",
    color: "#d97706" // Amber badge
  },
  {
    id: "MAT-BRN-209",
    trainNo: "MAT-209",
    name: "SECR Engineering Track Ballast Special",
    category: "Material",
    type: "Ballast / Maintenance Rake",
    cargo: "32 Flatbed Hoppers • 1,600 T Track Ballast",
    corridorId: "corridor-1",
    track: "Loop/Siding (T3)",
    progress: 0.85,
    speed: 30,
    direction: -1,
    status: "Maintenance Slow Zone",
    color: "#d97706"
  },
  {
    id: "08701",
    trainNo: "08701",
    name: "Raipur – Durg MEMU Commuter",
    category: "Passenger",
    type: "Suburban MEMU",
    cargo: "Passengers (8 Car Rake)",
    corridorId: "corridor-1",
    track: "UP Main (T1)",
    progress: 0.52,
    speed: 55,
    direction: 1,
    status: "On Time",
    color: "#059669" // Green badge
  },

  // ==========================================
  // CORRIDOR 2: Raipur – Bilaspur Line
  // ==========================================
  {
    id: "20825",
    trainNo: "20825",
    name: "Bilaspur – Nagpur Vande Bharat Express",
    category: "Passenger",
    type: "Vande Bharat",
    cargo: "Executive Passenger (16 Coaches)",
    corridorId: "corridor-2",
    track: "UP Main (T1)",
    progress: 0.65,
    speed: 110,
    direction: -1,
    status: "On Time",
    color: "#7c3aed"
  },
  {
    id: "12859",
    trainNo: "12859",
    name: "Gitanjali Express (CSMT – HWH)",
    category: "Passenger",
    type: "Superfast",
    cargo: "Passengers (22 Coaches)",
    corridorId: "corridor-2",
    track: "DOWN Main (T2)",
    progress: 0.28,
    speed: 86,
    direction: 1,
    status: "Delayed 9m",
    color: "#2563eb"
  },
  {
    id: "MAT-BOBRN-882",
    trainNo: "MAT-882",
    name: "Dalli Rajhara Iron Ore Feeder",
    category: "Material",
    type: "BOBRN Iron Ore Gondola",
    cargo: "59 Gondolas • 4,200 T Iron Ore Pellet",
    corridorId: "corridor-2",
    track: "Loop/Siding (T3)",
    progress: 0.18,
    speed: 40,
    direction: 1,
    status: "Green Signal Run",
    color: "#d97706"
  },
  {
    id: "MAT-BFNS-304",
    trainNo: "MAT-304",
    name: "Urkura Industrial Steel Coil Rake",
    category: "Material",
    type: "BFNS Steel Flatcar",
    cargo: "45 Special Flatcars • Finished Steel Coils",
    corridorId: "corridor-2",
    track: "UP Main (T1)",
    progress: 0.48,
    speed: 48,
    direction: -1,
    status: "Speed Restricted 50",
    color: "#d97706"
  },
  {
    id: "08728",
    trainNo: "08728",
    name: "Raipur – Bilaspur MEMU Special",
    category: "Passenger",
    type: "Suburban MEMU",
    cargo: "Passengers (12 Car Rake)",
    corridorId: "corridor-2",
    track: "DOWN Main (T2)",
    progress: 0.80,
    speed: 56,
    direction: 1,
    status: "On Time",
    color: "#059669"
  }
];

const DEFAULT_CENTER: [number, number] = [21.2568, 81.6289];
const DEFAULT_ZOOM = 11;

/**
 * Calculates real-time latitude & longitude along the active station path for a given progress [0..1]
 * with track-specific lateral offset to cleanly separate UP, DOWN, and Siding tracks visually.
 */
function getTrainCoordinates(
  stations: StationData[],
  progress: number,
  track: string
): [number, number] {
  if (stations.length === 0) return DEFAULT_CENTER;
  if (stations.length === 1) return stations[0].pos;

  const clampedProgress = Math.max(0, Math.min(1, progress));

  const segLengths: number[] = [];
  let totalLength = 0;
  for (let i = 0; i < stations.length - 1; i++) {
    const p1 = stations[i].pos;
    const p2 = stations[i + 1].pos;
    const dLat = p2[0] - p1[0];
    const dLng = p2[1] - p1[1];
    const len = Math.sqrt(dLat * dLat + dLng * dLng);
    segLengths.push(len);
    totalLength += len;
  }

  const targetDist = clampedProgress * totalLength;
  let accumulated = 0;
  let segIndex = 0;
  let fractionInSeg = 0;

  for (let i = 0; i < segLengths.length; i++) {
    const len = segLengths[i];
    if (targetDist <= accumulated + len || i === segLengths.length - 1) {
      segIndex = i;
      fractionInSeg = len > 0 ? (targetDist - accumulated) / len : 0;
      break;
    }
    accumulated += len;
  }

  const p1 = stations[segIndex].pos;
  const p2 = stations[segIndex + 1].pos;
  const dLat = p2[0] - p1[0];
  const dLng = p2[1] - p1[1];
  const len = segLengths[segIndex] || 0.0001;

  // Base position along track center line
  const baseLat = p1[0] + fractionInSeg * dLat;
  const baseLng = p1[1] + fractionInSeg * dLng;

  // Perpendicular unit vector (-dLng / len, dLat / len)
  const normLat = -dLng / len;
  const normLng = dLat / len;

  // Lateral offset to distinguish parallel tracks
  let offsetDist = 0;
  const t = track.toLowerCase();
  if (t.includes("up") || t.includes("t1")) {
    offsetDist = 0.00075;
  } else if (t.includes("down") || t.includes("t2")) {
    offsetDist = -0.00075;
  } else if (t.includes("loop") || t.includes("siding") || t.includes("t3")) {
    offsetDist = -0.0016;
  }

  return [baseLat + normLat * offsetDist, baseLng + normLng * offsetDist];
}

/**
 * Creates custom train pins distinctly styled for Passenger vs Material trains:
 * - Passenger: Train coach icon in Purple (#7c3aed) or Blue (#2563eb)
 * - Material: Freight container/factory icon in Amber (#d97706) with "MATERIAL" badge
 */
function createTrainIcon(train: LiveTrain) {
  const isMaterial = train.category === "Material";
  const pinColor = train.color || (isMaterial ? "#d97706" : "#7c3aed");

  if (isMaterial) {
    // Freight / Heavy Material Rake Pin
    const html = `
      <div style="position: relative; display: flex; flex-direction: column; align-items: center; justify-content: center; cursor: pointer;">
        <div style="
          position: relative;
          background: #ffffff;
          border: 2.5px solid #d97706;
          border-radius: 8px;
          padding: 3px 6px;
          box-shadow: 0 4px 14px rgba(217, 119, 6, 0.45);
          display: flex;
          align-items: center;
          gap: 5px;
          min-width: 66px;
        ">
          <!-- Freight container icon -->
          <div style="
            width: 20px;
            height: 20px;
            border-radius: 4px;
            background: #d97706;
            display: flex;
            align-items: center;
            justify-content: center;
            color: #ffffff;
            flex-shrink: 0;
          ">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/>
              <path d="m3.3 7 8.7 5 8.7-5"/>
              <path d="M12 22V12"/>
            </svg>
          </div>
          <!-- Label and MATERIAL Badge -->
          <div style="display: flex; flex-direction: column; line-height: 1.1;">
            <span style="font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 9.5px; font-weight: 800; color: #0f172a; white-space: nowrap;">
              ${train.trainNo}
            </span>
            <span style="background: #d97706; color: #ffffff; font-size: 7px; font-weight: 900; padding: 1px 3px; border-radius: 3px; letter-spacing: 0.5px; width: fit-content; margin-top: 1px;">
              MATERIAL
            </span>
          </div>
        </div>
        <!-- Pin stem pointer -->
        <div style="
          width: 0;
          height: 0;
          border-left: 5px solid transparent;
          border-right: 5px solid transparent;
          border-top: 5px solid #d97706;
          margin-top: -1px;
        "></div>
      </div>
    `;

    return L.divIcon({
      className: "railsync-train-pin-material",
      html,
      iconSize: [74, 44],
      iconAnchor: [37, 44],
      popupAnchor: [0, -40],
      tooltipAnchor: [0, -40],
    });
  }

  // Passenger Train Pin: Train coach icon in Purple (#7c3aed) or Blue (#2563eb)
  const html = `
    <div style="position: relative; display: flex; flex-direction: column; align-items: center; justify-content: center; cursor: pointer;">
      <div style="
        position: relative;
        background: #ffffff;
        border: 2.5px solid ${pinColor};
        border-radius: 9999px;
        padding: 3px 7px 3px 5px;
        box-shadow: 0 4px 14px rgba(124, 58, 237, 0.4);
        display: flex;
        align-items: center;
        gap: 5px;
      ">
        <!-- Passenger train coach icon -->
        <div style="
          width: 20px;
          height: 20px;
          border-radius: 9999px;
          background: ${pinColor};
          display: flex;
          align-items: center;
          justify-content: center;
          color: #ffffff;
          flex-shrink: 0;
        ">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <rect width="16" height="16" x="4" y="3" rx="2"/>
            <path d="M4 11h16"/>
            <path d="M12 3v8"/>
            <path d="m8 19-2 3"/>
            <path d="m18 22-2-3"/>
            <circle cx="8" cy="15" r="1"/>
            <circle cx="16" cy="15" r="1"/>
          </svg>
        </div>
        <!-- Train No & Live Speed -->
        <div style="display: flex; flex-direction: column; line-height: 1.1;">
          <span style="font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 9.5px; font-weight: 800; color: #0f172a; white-space: nowrap;">
            ${train.trainNo}
          </span>
          <span style="font-size: 8px; font-weight: 700; color: ${pinColor}; white-space: nowrap;">
            ${train.speed} km/h
          </span>
        </div>
      </div>
      <!-- Pin stem pointer -->
      <div style="
        width: 0;
        height: 0;
        border-left: 5px solid transparent;
        border-right: 5px solid transparent;
        border-top: 5px solid ${pinColor};
        margin-top: -1px;
      "></div>
    </div>
  `;

  return L.divIcon({
    className: "railsync-train-pin-passenger",
    html,
    iconSize: [74, 44],
    iconAnchor: [37, 44],
    popupAnchor: [0, -40],
    tooltipAnchor: [0, -40],
  });
}

/**
 * Creates custom circular station marker using Leaflet divIcon
 */
function createStationIcon(station: StationData, corridorColor: string, isKeyStation = false) {
  const isOccupied = station.status.toLowerCase() === "occupied";
  const statusColor = isOccupied ? "#ef4444" : "#10b981";

  const pingAnimation = isOccupied
    ? `<span style="position: absolute; inset: -5px; border-radius: 9999px; background-color: #ef4444; opacity: 0.6; animation: ping 1.4s cubic-bezier(0, 0, 0.2, 1) infinite;"></span>`
    : "";

  const html = `
    <div style="position: relative; display: flex; flex-direction: column; align-items: center; justify-content: center; width: 34px; height: 34px;">
      ${pingAnimation}
      <div style="
        position: relative;
        width: 26px;
        height: 26px;
        border-radius: 9999px;
        background: #ffffff;
        border: 3.5px solid ${isOccupied ? "#ef4444" : corridorColor};
        box-shadow: 0 4px 10px rgba(0,0,0,0.22);
        display: flex;
        align-items: center;
        justify-content: center;
        transition: transform 0.2s ease;
      ">
        <div style="
          width: 9px;
          height: 9px;
          border-radius: 9999px;
          background: ${statusColor};
          box-shadow: 0 0 6px ${statusColor};
        "></div>
      </div>
      <div style="
        position: absolute;
        bottom: -16px;
        white-space: nowrap;
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
        font-size: 10px;
        font-weight: 700;
        color: #0f172a;
        background: rgba(255, 255, 255, 0.96);
        padding: 0px 5px;
        border-radius: 4px;
        border: 1px solid rgba(0,0,0,0.12);
        box-shadow: 0 1px 3px rgba(0,0,0,0.1);
        pointer-events: none;
      ">
        ${station.code}
      </div>
    </div>
  `;

  return L.divIcon({
    className: "railsync-circular-station-marker",
    html,
    iconSize: [34, 34],
    iconAnchor: [17, 17],
    popupAnchor: [0, -18],
    tooltipAnchor: [0, -18],
  });
}

/**
 * Controller to smoothly animate the map when corridor selection changes
 */
function MapController({
  selectedStations,
  triggerReset,
}: {
  selectedStations: StationData[];
  triggerReset: number;
}) {
  const map = useMap();

  useEffect(() => {
    if (!map || selectedStations.length === 0) return;
    try {
      const bounds = L.latLngBounds(selectedStations.map((s) => s.pos));
      map.flyToBounds(bounds, {
        padding: [60, 60],
        maxZoom: 12,
        duration: 1.0,
      });
    } catch {
      map.setView(DEFAULT_CENTER, DEFAULT_ZOOM);
    }
  }, [map, selectedStations, triggerReset]);

  return null;
}

export interface LiveCorridorLeafletMapProps {
  className?: string;
  showControls?: boolean;
  trains?: LiveTrain[];
}

export default function LiveCorridorLeafletMap({
  className,
  showControls = true,
  trains: propTrains,
}: LiveCorridorLeafletMapProps) {
  const { selectedCorridorId, setSelectedCorridorId } = useCorridor();
  const [resetCount, setResetCount] = useState(0);

  // Map selectedCorridorId from CorridorContext to corridor-1 or corridor-2
  const activeKey: CorridorKey = useMemo(() => {
    if (selectedCorridorId != null) {
      const str = String(selectedCorridorId).toLowerCase();
      if (str === "2" || str.includes("bilaspur") || str.includes("corridor-2")) {
        return "corridor-2";
      }
    }
    return "corridor-1";
  }, [selectedCorridorId]);

  const currentCorridor = CORRIDOR_DATA[activeKey];
  const otherKey: CorridorKey = activeKey === "corridor-1" ? "corridor-2" : "corridor-1";
  const otherCorridor = CORRIDOR_DATA[otherKey];

  const stationPositions: [number, number][] = useMemo(
    () => currentCorridor.stations.map((s) => s.pos),
    [currentCorridor]
  );

  const otherStationPositions: [number, number][] = useMemo(
    () => otherCorridor.stations.map((s) => s.pos),
    [otherCorridor]
  );

  const occupiedCount = useMemo(
    () => currentCorridor.stations.filter((s) => s.status.toLowerCase() === "occupied").length,
    [currentCorridor]
  );

  const clearCount = currentCorridor.stations.length - occupiedCount;

  // Live Train Simulation State
  const [trains, setTrains] = useState<LiveTrain[]>(LIVE_TRAIN_DATASET);

  // Smooth movement tick: advance train coordinates along the track polyline over time
  useEffect(() => {
    const interval = setInterval(() => {
      setTrains((prev) =>
        prev.map((train) => {
          // Speed scaled to smooth progress increment per second
          const step = (train.speed / 60) * 0.00045 * train.direction;
          let nextProgress = train.progress + step;
          let nextDir = train.direction;

          if (nextProgress >= 0.98) {
            nextProgress = 0.98;
            nextDir = -1;
          } else if (nextProgress <= 0.02) {
            nextProgress = 0.02;
            nextDir = 1;
          }

          return {
            ...train,
            progress: nextProgress,
            direction: nextDir,
          };
        })
      );
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  // Filter and render the trains that match the active corridor ID
  const activeTrains = useMemo(() => {
    return trains.filter((t) => t.corridorId === activeKey);
  }, [trains, activeKey]);

  const handleSelectCorridor = (key: CorridorKey) => {
    const id = key === "corridor-1" ? 1 : 2;
    setSelectedCorridorId(id);
    setResetCount((prev) => prev + 1);
  };

  const handleResetView = () => {
    setResetCount((prev) => prev + 1);
  };

  return (
    <div
      className={cn(
        "relative w-full h-[450px] min-h-[380px] rounded-2xl overflow-hidden border border-border shadow-sm bg-slate-50",
        className
      )}
    >
      {/* Map Container */}
      <MapContainer
        center={DEFAULT_CENTER}
        zoom={DEFAULT_ZOOM}
        scrollWheelZoom={true}
        className="h-full w-full z-0"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          maxZoom={18}
        />

        <MapController selectedStations={currentCorridor.stations} triggerReset={resetCount} />

        {/* Inactive Corridor Track (Subtle Dashed Route) */}
        <Polyline
          positions={otherStationPositions}
          pathOptions={{
            color: otherCorridor.color,
            weight: 3.5,
            opacity: 0.35,
            dashArray: "6, 8",
            lineCap: "round",
            lineJoin: "round",
          }}
        />

        {/* Selected Corridor Track - Glow / Casing */}
        <Polyline
          positions={stationPositions}
          pathOptions={{
            color: "#ffffff",
            weight: 7,
            opacity: 0.85,
            lineCap: "round",
            lineJoin: "round",
          }}
        />

        {/* Selected Corridor Track - Main Line using Selected Corridor's Color */}
        <Polyline
          positions={stationPositions}
          pathOptions={{
            color: currentCorridor.color,
            weight: 4.5,
            opacity: 0.95,
            lineCap: "round",
            lineJoin: "round",
          }}
        />

        {/* Inactive Corridor Station Dots (semi-transparent) */}
        {otherCorridor.stations.map((stn) => {
          // Skip Raipur Jn on other corridor to avoid duplicate marker
          if (stn.code === "R") return null;
          return (
            <Marker
              key={`inactive-${otherKey}-${stn.code}`}
              position={stn.pos}
              icon={L.divIcon({
                className: "inactive-station-dot",
                html: `
                  <div style="
                    width: 14px;
                    height: 14px;
                    border-radius: 9999px;
                    background: #ffffff;
                    border: 2px solid ${otherCorridor.color};
                    opacity: 0.6;
                    box-shadow: 0 1px 3px rgba(0,0,0,0.2);
                  "></div>
                `,
                iconSize: [14, 14],
                iconAnchor: [7, 7],
              })}
            >
              <Tooltip direction="top" offset={[0, -8]}>
                <div className="text-xs font-semibold text-slate-700">
                  {stn.name} ({stn.code}) · <span className="opacity-75">{otherCorridor.name}</span>
                </div>
              </Tooltip>
            </Marker>
          );
        })}

        {/* Active Corridor Circular Station Markers */}
        {currentCorridor.stations.map((station) => {
          const isOccupied = station.status.toLowerCase() === "occupied";

          return (
            <Marker
              key={`${activeKey}-${station.code}`}
              position={station.pos}
              icon={createStationIcon(station, currentCorridor.color, station.code === "R")}
            >
              {/* Tooltip on hover */}
              <Tooltip direction="top" offset={[0, -18]} opacity={0.95}>
                <div className="text-xs space-y-0.5">
                  <div className="font-bold text-slate-900 flex items-center gap-1.5">
                    <span>{station.name}</span>
                    <span className="font-mono text-[10px] bg-slate-100 text-slate-700 px-1 py-0.2 rounded border">
                      {station.code}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 pt-0.5">
                    <span
                      className={cn(
                        "w-2 h-2 rounded-full",
                        isOccupied ? "bg-red-500 animate-pulse" : "bg-emerald-500"
                      )}
                    />
                    <span className={cn("font-medium", isOccupied ? "text-red-600 font-semibold" : "text-emerald-600")}>
                      Signal: {station.status}
                    </span>
                  </div>
                </div>
              </Tooltip>

              {/* Rich Popup on click */}
              <Popup offset={[0, -16]} className="custom-station-popup">
                <div className="p-1 min-w-[210px] space-y-2 text-slate-900">
                  <div className="flex items-start justify-between gap-2 border-b border-slate-100 pb-2">
                    <div>
                      <h4 className="font-bold text-sm text-slate-900 leading-tight">
                        {station.name}
                      </h4>
                      <span className="text-[11px] font-mono text-slate-500">
                        Code: <strong>{station.code}</strong>
                      </span>
                    </div>
                    <Badge
                      variant="outline"
                      className="text-[10px] uppercase font-bold"
                      style={{ borderColor: currentCorridor.color, color: currentCorridor.color }}
                    >
                      {activeKey.replace("-", " ")}
                    </Badge>
                  </div>

                  <div className="space-y-1.5 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500">Block / Signal:</span>
                      <span
                        className={cn(
                          "inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-semibold text-[11px]",
                          isOccupied
                            ? "bg-red-100 text-red-700 border border-red-200"
                            : "bg-emerald-100 text-emerald-700 border border-emerald-200"
                        )}
                      >
                        {isOccupied ? (
                          <>
                            <AlertCircle className="w-3 h-3 text-red-600" />
                            Occupied
                          </>
                        ) : (
                          <>
                            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                            Clear
                          </>
                        )}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-slate-500">
                      <span>Coordinates:</span>
                      <span className="font-mono text-[11px] text-slate-700">
                        {station.pos[0].toFixed(4)}, {station.pos[1].toFixed(4)}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-slate-500">
                      <span>Corridor Line:</span>
                      <span className="font-medium text-slate-800 truncate max-w-[130px]">
                        {currentCorridor.name.split(":")[1]?.trim() ?? currentCorridor.name}
                      </span>
                    </div>
                  </div>
                </div>
              </Popup>
            </Marker>
          );
        })}

        {/* Live Train Simulation Markers for Active Corridor */}
        {activeTrains.map((train) => {
          const coords = getTrainCoordinates(
            currentCorridor.stations,
            train.progress,
            train.track
          );

          return (
            <Marker
              key={`train-${train.id}`}
              position={coords}
              icon={createTrainIcon(train)}
              zIndexOffset={1000}
            >
              {/* Tooltip on hover */}
              <Tooltip direction="top" offset={[0, -40]} opacity={0.96}>
                <div className="text-xs space-y-1 p-0.5 min-w-[180px]">
                  <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-1">
                    <span className="font-mono font-bold text-slate-900">
                      {train.trainNo}
                    </span>
                    <span
                      className={cn(
                        "px-1.5 py-0.2 rounded text-[9px] font-bold text-white uppercase",
                        train.category === "Material"
                          ? "bg-amber-600"
                          : "bg-[#7c3aed]"
                      )}
                    >
                      {train.category === "Material" ? "MATERIAL" : "PASSENGER"}
                    </span>
                  </div>
                  <div className="font-semibold text-slate-800 text-[11px] leading-tight truncate">
                    {train.name}
                  </div>
                  <div className="flex items-center justify-between text-[10px] text-slate-600 pt-0.5">
                    <span>{train.track}</span>
                    <span className="font-bold text-slate-900">
                      {train.speed} km/h
                    </span>
                  </div>
                  <div className="text-[10px] text-slate-500 font-medium truncate max-w-[210px]">
                    {train.cargo}
                  </div>
                </div>
              </Tooltip>

              {/* Rich Popup on click */}
              <Popup offset={[0, -38]} className="custom-train-popup">
                <div className="p-1 min-w-[250px] max-w-[290px] space-y-2 text-slate-900">
                  <div className="border-b border-slate-100 pb-2">
                    <div className="flex items-center justify-between gap-1">
                      <span className="font-mono text-xs font-black text-slate-900 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                        {train.trainNo}
                      </span>
                      <Badge
                        className={cn(
                          "text-[10px] font-bold text-white tracking-wider",
                          train.category === "Material"
                            ? "bg-amber-600 hover:bg-amber-600"
                            : "bg-[#7c3aed] hover:bg-[#7c3aed]"
                        )}
                      >
                        {train.category === "Material" ? "MATERIAL" : "PASSENGER"}
                      </Badge>
                    </div>
                    <h4 className="font-bold text-sm text-slate-900 leading-snug mt-1.5">
                      {train.name}
                    </h4>
                    <p className="text-[11px] text-slate-500 font-medium">
                      {train.type}
                    </p>
                  </div>

                  <div className="space-y-1.5 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500 font-medium">Assigned Track:</span>
                      <span className="font-bold text-slate-800 bg-slate-100 px-1.5 py-0.5 rounded text-[11px]">
                        {train.track}
                      </span>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-slate-500 font-medium">Live Speed:</span>
                      <span className="font-mono font-bold text-slate-900 text-[11px]">
                        {train.speed} km/h
                      </span>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-slate-500 font-medium">Operational Status:</span>
                      <span
                        className={cn(
                          "font-semibold text-[11px] px-2 py-0.5 rounded-full border",
                          train.status.toLowerCase().includes("delayed")
                            ? "bg-amber-100 text-amber-800 border-amber-200"
                            : train.status.toLowerCase().includes("hold") ||
                              train.status.toLowerCase().includes("slow")
                            ? "bg-orange-100 text-orange-800 border-orange-200"
                            : "bg-emerald-100 text-emerald-800 border-emerald-200"
                        )}
                      >
                        {train.status}
                      </span>
                    </div>

                    <div className="pt-1.5 border-t border-slate-100">
                      <span className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider block mb-1">
                        Cargo / Consist Breakdown
                      </span>
                      <div className="bg-slate-50 p-2 rounded-lg border border-slate-200 text-[11px] font-medium text-slate-800 leading-snug">
                        {train.cargo}
                      </div>
                    </div>
                  </div>
                </div>
              </Popup>
            </Marker>
          );
        })}
      </MapContainer>

      {/* Top Overlay: Corridor Info & Controls */}
      {showControls && (
        <div className="absolute top-3 left-3 right-3 z-[1000] pointer-events-none flex flex-wrap items-center justify-between gap-2">
          {/* Active Corridor Card */}
          <div className="pointer-events-auto bg-white/95 backdrop-blur-md border border-slate-200 shadow-md rounded-xl p-2.5 flex items-center gap-3">
            <div
              className="w-3 h-9 rounded-md"
              style={{ backgroundColor: currentCorridor.color }}
            />
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-slate-900">
                  {currentCorridor.name}
                </span>
                <Badge
                  className="text-[10px] text-white px-1.5 py-0 h-4 font-semibold"
                  style={{ backgroundColor: currentCorridor.color }}
                >
                  Active Route
                </Badge>
              </div>
              <div className="flex items-center gap-2 text-[11px] text-slate-500 mt-0.5">
                <span>{currentCorridor.stations.length} Stations</span>
                <span>•</span>
                <span className="text-emerald-600 font-medium">{clearCount} Clear</span>
                {occupiedCount > 0 && (
                  <>
                    <span>•</span>
                    <span className="text-red-600 font-semibold flex items-center gap-0.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                      {occupiedCount} Occupied
                    </span>
                  </>
                )}
                <span>•</span>
                <span className="text-primary font-semibold">
                  {activeTrains.length} Active Trains
                </span>
              </div>
            </div>
          </div>

          {/* Quick Corridor Switcher & Recenter Control */}
          <div className="pointer-events-auto bg-white/95 backdrop-blur-md border border-slate-200 shadow-md rounded-xl p-1 flex items-center gap-1">
            <Button
              size="sm"
              variant={activeKey === "corridor-1" ? "default" : "ghost"}
              className={cn(
                "h-7 text-xs font-semibold rounded-lg px-2.5 transition-all",
                activeKey === "corridor-1"
                  ? "bg-[#7c3aed] text-white hover:bg-[#6d28d9]"
                  : "text-slate-600 hover:text-slate-900"
              )}
              onClick={() => handleSelectCorridor("corridor-1")}
            >
              <Radio className="w-3 h-3 mr-1" />
              Corridor 1
            </Button>

            <Button
              size="sm"
              variant={activeKey === "corridor-2" ? "default" : "ghost"}
              className={cn(
                "h-7 text-xs font-semibold rounded-lg px-2.5 transition-all",
                activeKey === "corridor-2"
                  ? "bg-[#2563eb] text-white hover:bg-[#1d4ed8]"
                  : "text-slate-600 hover:text-slate-900"
              )}
              onClick={() => handleSelectCorridor("corridor-2")}
            >
              <Radio className="w-3 h-3 mr-1" />
              Corridor 2
            </Button>

            <Button
              size="sm"
              variant="ghost"
              className="h-7 w-7 p-0 text-slate-500 hover:text-slate-900 rounded-lg"
              title="Fit route to view"
              onClick={handleResetView}
            >
              <Maximize2 className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
      )}

      {/* Bottom Overlay Legend */}
      <div className="absolute bottom-3 left-3 z-[1000] pointer-events-auto bg-white/95 backdrop-blur-md border border-slate-200 shadow-sm rounded-xl px-3 py-1.5 flex flex-wrap items-center gap-3 text-[11px] text-slate-600">
        <div className="flex items-center gap-1.5">
          <div
            className="w-4 h-1.5 rounded-full"
            style={{ backgroundColor: currentCorridor.color }}
          />
          <span className="font-medium text-slate-700">Track Route</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded-full bg-[#7c3aed] border border-white shadow-sm inline-block" />
          <span>Passenger Train</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded-sm bg-[#d97706] border border-white shadow-sm inline-block" />
          <span>Material Rake</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 border border-white shadow-sm inline-block" />
          <span>Clear Signal</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded-full bg-red-500 border border-white shadow-sm animate-pulse inline-block" />
          <span>Occupied Block</span>
        </div>
      </div>
    </div>
  );
}
