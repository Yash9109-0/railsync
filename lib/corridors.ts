export interface CorridorConfig {
  id: string;
  name: string;
  segments: string[];
}

export const CORRIDORS = [
  {
    id: "corridor-1",
    name: "Corridor 1 - Raipur – Durg Line",
    segments: [
      "Raipur Jn → Saraswati Nagar",
      "Saraswati Nagar → Sarona",
      "Sarona → Kumhari",
      "Kumhari → Bhilai",
    ],
  },
  {
    id: "corridor-2",
    name: "Corridor 2 - Raipur – Bilaspur Line",
    segments: [
      "Raipur Jn → WRS Colony",
      "WRS Colony → Urkura",
      "Urkura → Mandhar",
      "Mandhar → Silyari",
    ],
  },
];

/**
 * Mapping of database segment IDs to real Raipur railway section names.
 * Corridor 1 (Raipur - Durg): IDs 1-4
 * Corridor 2 (Raipur - Bilaspur): IDs 5-8
 */
export const SEGMENT_ID_MAP: Record<number, { name: string; corridorId: number }> = {
  1: { name: "Raipur Jn → Saraswati Nagar", corridorId: 1 },
  2: { name: "Saraswati Nagar → Sarona", corridorId: 1 },
  3: { name: "Sarona → Kumhari", corridorId: 1 },
  4: { name: "Kumhari → Bhilai", corridorId: 1 },
  5: { name: "Raipur Jn → WRS Colony", corridorId: 2 },
  6: { name: "WRS Colony → Urkura", corridorId: 2 },
  7: { name: "Urkura → Mandhar", corridorId: 2 },
  8: { name: "Mandhar → Silyari", corridorId: 2 },
};

/**
 * Get canonical display name for corridor
 */
export function getCorridorDisplayName(
  id: number | string | null | undefined,
  fallbackName?: string | null
): string {
  const str = String(id ?? "").toLowerCase();
  const raw = String(fallbackName ?? "").toLowerCase();

  if (str === "1" || str === "corridor-1" || raw.includes("durg") || raw.includes("demo") || raw.includes("corridor 1")) {
    return "Corridor 1 - Raipur – Durg Line";
  }
  if (str === "2" || str === "corridor-2" || raw.includes("bilaspur") || raw.includes("freight") || raw.includes("corridor 2")) {
    return "Corridor 2 - Raipur – Bilaspur Line";
  }

  return fallbackName || "Corridor 1 - Raipur – Durg Line";
}

/**
 * Get real railway station pair for a segment ID
 */
export function getSegmentDisplayName(
  segmentId: number | string | null | undefined,
  fallbackName?: string | null
): string {
  if (segmentId == null) return fallbackName ?? "—";
  const numId = Number(segmentId);
  if (SEGMENT_ID_MAP[numId]) {
    return SEGMENT_ID_MAP[numId].name;
  }
  return fallbackName ?? `Segment ${segmentId}`;
}

/**
 * Get station pair options filtered by selected corridor
 */
export function getSegmentsForCorridor(
  corridorId: number | string | null | undefined
): Array<{ id: number; displayName: string; corridorId: number }> {
  const numCorridor = corridorId != null ? Number(corridorId) : null;
  const isCorridor1 = numCorridor === 1 || String(corridorId) === "corridor-1";
  const isCorridor2 = numCorridor === 2 || String(corridorId) === "corridor-2";

  const all = Object.entries(SEGMENT_ID_MAP).map(([id, info]) => ({
    id: Number(id),
    displayName: info.name,
    corridorId: info.corridorId,
  }));

  if (isCorridor1) {
    return all.filter((s) => s.corridorId === 1);
  }
  if (isCorridor2) {
    return all.filter((s) => s.corridorId === 2);
  }
  return all;
}

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
    color: "#7c3aed",
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
    color: "#2563eb",
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
    color: "#d97706",
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
    color: "#d97706",
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
    color: "#059669",
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
    color: "#7c3aed",
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
    color: "#2563eb",
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
    color: "#d97706",
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
    color: "#d97706",
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
    color: "#059669",
  },
];

