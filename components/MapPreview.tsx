"use client";

import dynamic from "next/dynamic";
import { Skeleton } from "@/components/ui/skeleton";
import { Loader2, MapPin } from "lucide-react";
import { cn } from "@/lib/utils";
import type { LiveCorridorLeafletMapProps } from "./LiveCorridorLeafletMap";

export {
  CORRIDOR_DATA,
  LIVE_TRAIN_DATASET,
  type LiveTrain,
  type StationData,
  type CorridorDetail,
  type CorridorKey,
} from "./LiveCorridorLeafletMap";

// Client-only dynamic import of react-leaflet component to avoid Next.js SSR window errors
const DynamicCorridorMap = dynamic(
  () => import("./LiveCorridorLeafletMap"),
  {
    ssr: false,
    loading: () => (
      <div className="relative w-full h-[450px] min-h-[380px] rounded-2xl border border-border bg-slate-50 flex flex-col items-center justify-center p-6 space-y-3">
        <div className="flex items-center gap-2 text-primary font-semibold text-sm">
          <Loader2 className="w-5 h-5 animate-spin text-primary" />
          <span>Loading Live Corridor Map...</span>
        </div>
        <p className="text-xs text-muted-foreground text-center max-w-sm">
          Initializing Raipur – Durg and Raipur – Bilaspur rail telemetry coordinates
        </p>
        <div className="w-full max-w-md space-y-2 pt-2">
          <Skeleton className="h-4 w-full rounded" />
          <Skeleton className="h-4 w-3/4 rounded mx-auto" />
        </div>
      </div>
    ),
  }
);

export interface MapPreviewProps extends LiveCorridorLeafletMapProps {
  lat?: number | null;
  lng?: number | null;
  trains?: import("./LiveCorridorLeafletMap").LiveTrain[];
}

export default function MapPreview({
  className,
  showControls = true,
  trains,
}: MapPreviewProps) {
  return (
    <div className={cn("w-full", className)}>
      <DynamicCorridorMap showControls={showControls} trains={trains} />
    </div>
  );
}
