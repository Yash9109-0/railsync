"use client"

import { useEffect, useState } from "react"
import {
  MapContainer,
  TileLayer,
  Marker,
  useMapEvents,
} from "react-leaflet"
import L from "leaflet"
import { cn } from "@/lib/utils"

if (typeof window !== "undefined") {
  delete (L.Icon.Default.prototype as L.Icon.Default & {
    _getIconUrl?: unknown
  })._getIconUrl

  L.Icon.Default.mergeOptions({
    iconRetinaUrl:
      "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
    iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
    shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  })
}

interface MapPreviewProps {
  lat: number | null
  lng: number | null
  className?: string
}

function MapEvents({
  onCenter,
}: {
  onCenter: (center: L.LatLngExpression) => void
}) {
  const map = useMapEvents({
    click() {
      map?.getCenter && onCenter(map.getCenter())
    },
  })
  useEffect(() => {
    if (map) onCenter(map.getCenter())
  }, [map, onCenter])
  return null
}

export default function MapPreview({
  lat,
  lng,
  className,
}: MapPreviewProps) {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) {
    return (
      <div
        className={cn(
          "flex items-center justify-center rounded-md border bg-muted/30 text-sm text-muted-foreground",
          className,
        )}
      >
        Map preview loads after submit
      </div>
    )
  }

  const position: L.LatLngExpression =
    lat != null && lng != null ? [lat, lng] : [20, 0]

  return (
    <MapContainer
      center={position}
      zoom={lat != null && lng != null ? 13 : 2}
      className={cn("rounded-md border", className)}
      scrollWheelZoom={false}
    >
      <TileLayer
        attribution='&copy; <a href="https://osm.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {lat != null && lng != null && <Marker position={[lat, lng]} />}
    </MapContainer>
  )
}
