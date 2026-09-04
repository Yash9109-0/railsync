"use client"

import { useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { toast } from "sonner"
import {
  ClipboardList,
  Loader2,
  MapPin,
  Send,
} from "lucide-react"
import type {
  BlockRequest,
  ExecutionLog,
  Segment,
  Station,
} from "@/lib/types"
import MapPreview from "@/components/MapPreview"
import { Progress } from "@/components/ui/progress"

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  approved: {
    label: "Approved",
    className:
      "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  },
  executed: {
    label: "Executed",
    className:
      "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
  },
}

const workTypeLabels: Record<string, string> = {
  track: "Track",
  signal: "Signal",
  electrical: "Electrical",
  other: "Other",
}

const safetyLabels: Record<string, string> = {
  routine: "Routine",
  urgent: "Urgent",
  safety_critical: "Safety Critical",
}

function toDateTimeLocal(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function formatDateTime(dateString: string): string {
  try {
    return new Date(dateString).toLocaleString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    })
  } catch {
    return dateString
  }
}

function formatDuration(mins: number): string {
  if (mins >= 60) {
    const h = Math.floor(mins / 60)
    const m = mins % 60
    return `${h}h ${m}m`
  }
  return `${mins} min`
}

function getStatusBadge(status: string) {
  return (
    STATUS_CONFIG[status] ?? {
      label: status.charAt(0).toUpperCase() + status.slice(1),
      className:
        "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200",
    }
  )
}

function getSegmentName(
  id: number | null | undefined,
  segments: Segment[],
  stations: Station[],
): string {
  if (id == null) return "—"
  const seg = segments.find((s) => s.id === id)
  if (!seg) return String(id)
  const from = stations.find((s) => s.id === seg.from_station_id)
  const to = stations.find((s) => s.id === seg.to_station_id)
  return `${from?.name ?? seg.from_station_id} → ${to?.name ?? seg.to_station_id}`
}

function formatVariance(mins: number): string {
  if (mins === 0) return "0 min (on time)"
  const sign = mins > 0 ? "+" : ""
  return `${sign}${mins} min ${mins > 0 ? "over" : "under"}`
}

interface LogExecutionDialogProps {
  request: BlockRequest
  segmentName: string
  workTypeLabel: string
  safetyLabel: string
  onLogged: () => void
}

function LogExecutionDialog({
  request,
  segmentName,
  workTypeLabel,
  safetyLabel,
       onLogged,
}: LogExecutionDialogProps) {
  const [open, setOpen] = useState(false)
  const [beforeImage, setBeforeImage] = useState<File | null>(null)
  const [afterImage, setAfterImage] = useState<File | null>(null)
  const [uploadProgress, setUploadProgress] = useState<{
    before: number | null
    after: number | null
  }>({ before: null, after: null })
  const [actualStart, setActualStart] = useState<string>(
    () =>
      request.requested_start
        ? toDateTimeLocal(new Date(request.requested_start))
        : toDateTimeLocal(new Date()),
  )
  const [actualEnd, setActualEnd] = useState<string>(() => {
    const start = request.requested_start
      ? new Date(request.requested_start)
      : new Date()
    start.setMinutes(start.getMinutes() + request.requested_duration_mins)
    return toDateTimeLocal(start)
  })
  const [geoLat, setGeoLat] = useState<string>("")
  const [geoLng, setGeoLng] = useState<string>("")
  const [locating, setLocating] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const uploadImage = async (
    file: File,
    onProgress: (pct: number) => void,
  ): Promise<string | null> => {
    const supabase = createClient()
    const fileName = `${request.id}_${Date.now()}_${file.name}`
    const { error } = await supabase.storage
      .from("execution-images")
      .upload(fileName, file, {
        upsert: false,
        onUploadProgress: (event: { loaded: number; total: number }) => {
          if (event.total > 0) {
            onProgress(Math.round((event.loaded / event.total) * 100))
          }
        },
      } as any)

    if (error) {
      console.error("Upload error:", error)
      onProgress(0)
      return null
    }

    const { data: publicUrlData } = supabase.storage
      .from("execution-images")
      .getPublicUrl(fileName)

    return publicUrlData?.publicUrl ?? null
  }

  const handleUseMyLocation = () => {
    if (!navigator.geolocation) {
      toast.error("Geolocation is not supported by your browser")
      return
    }

    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGeoLat(String(pos.coords.latitude))
        setGeoLng(String(pos.coords.longitude))
        setLocating(false)
        toast.success("Location captured")
      },
      (err) => {
        setLocating(false)
        if (err.code === err.PERMISSION_DENIED) {
          toast.error("Location permission denied. Enter coordinates manually.")
        } else {
          toast.error("Could not get location. Enter coordinates manually.")
        }
      },
      { enableHighAccuracy: true, timeout: 10000 },
    )
  }

  const handleSubmit = async () => {
    if (!beforeImage || !afterImage) {
      toast.error("Both before and after images are required")
      return
    }

    if (!actualStart || !actualEnd) {
      toast.error("Please provide actual start and end times")
      return
    }

    const start = new Date(`${actualStart}:00`)
    const end = new Date(`${actualEnd}:00`)

    if (end <= start) {
      toast.error("Actual end must be after actual start")
      return
    }

    setSubmitting(true)
    setUploadProgress({ before: null, after: null })

    try {
      const beforeUrl = await uploadImage(beforeImage, (pct) =>
        setUploadProgress((p) => ({ ...p, before: pct })),
      )
      const afterUrl = await uploadImage(afterImage, (pct) =>
        setUploadProgress((p) => ({ ...p, after: pct })),
      )

      if (!beforeUrl || !afterUrl) {
        throw new Error("Failed to upload one or both images")
      }
      setUploadProgress({ before: null, after: null })

      const supabase = createClient()

      const { error: logError } = await supabase.from("execution_logs").insert({
        block_request_id: request.id,
        before_image_url: beforeUrl,
        after_image_url: afterUrl,
        actual_start: start.toISOString(),
        actual_end: end.toISOString(),
        geo_lat: geoLat ? Number(geoLat) : null,
        geo_lng: geoLng ? Number(geoLng) : null,
      })

      if (logError) throw logError

      const { error: updateError } = await supabase
        .from("block_requests")
        .update({ status: "executed" })
        .eq("id", request.id)

      if (updateError) throw updateError

      toast.success("Execution logged successfully")
      onLogged()
      setOpen(false)
    } catch (err) {
      toast.error(
        `Failed to log execution: ${err instanceof Error ? err.message : String(err)}`,
      )
    } finally {
      setSubmitting(false)
      setUploadProgress({ before: null, after: null })
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          Log Execution
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Log Execution</DialogTitle>
          <DialogDescription>
            <div className="space-y-1">
              <div>
                <span className="font-medium">{segmentName}</span>
              </div>
              <div className="text-sm text-muted-foreground">
                {workTypeLabel} work &middot; {safetyLabel} &middot; Requested
                start: {formatDateTime(request.requested_start)}
              </div>
            </div>
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 py-4">
          <div className="space-y-2">
            <label
              htmlFor="before-image"
              className="text-sm font-medium leading-none"
            >
              Before Image
            </label>
            <Input
              id="before-image"
              type="file"
              accept="image/*"
              onChange={(e) => setBeforeImage(e.target.files?.[0] ?? null)}
            />
            {uploadProgress.before != null && (
              <div className="space-y-1 pt-1">
                <Progress value={uploadProgress.before} className="h-2" />
                <span className="text-xs text-muted-foreground">
                  Uploading before image: {uploadProgress.before}%
                </span>
              </div>
            )}
          </div>

          <div className="space-y-2">
            <label
              htmlFor="after-image"
              className="text-sm font-medium leading-none"
            >
              After Image
            </label>
            <Input
              id="after-image"
              type="file"
              accept="image/*"
              onChange={(e) => setAfterImage(e.target.files?.[0] ?? null)}
            />
            {uploadProgress.after != null && (
              <div className="space-y-1 pt-1">
                <Progress value={uploadProgress.after} className="h-2" />
                <span className="text-xs text-muted-foreground">
                  Uploading after image: {uploadProgress.after}%
                </span>
              </div>
            )}
          </div>

          <div className="space-y-2">
            <label
              htmlFor="actual-start"
              className="text-sm font-medium leading-none"
            >
              Actual Start
            </label>
            <Input
              id="actual-start"
              type="datetime-local"
              value={actualStart}
              onChange={(e) => setActualStart(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <label
              htmlFor="actual-end"
              className="text-sm font-medium leading-none"
            >
              Actual End
            </label>
            <Input
              id="actual-end"
              type="datetime-local"
              value={actualEnd}
              onChange={(e) => setActualEnd(e.target.value)}
            />
          </div>

          <div className="space-y-2 md:col-span-2">
            <label className="text-sm font-medium leading-none">
              Location
            </label>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleUseMyLocation}
                disabled={locating}
              >
                {locating ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <MapPin className="h-4 w-4 mr-2" />
                )}
                {locating ? "Locating..." : "Use My Location"}
              </Button>
              <span className="text-xs text-muted-foreground self-center">
                (auto-fills lat/lng below)
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2 mt-2">
              <div className="space-y-1">
                <label
                  htmlFor="geo-lat"
                  className="text-xs text-muted-foreground"
                >
                  Latitude
                </label>
                <Input
                  id="geo-lat"
                  type="number"
                  step="any"
                  placeholder="e.g. 40.7128"
                  value={geoLat}
                  onChange={(e) => setGeoLat(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <label
                  htmlFor="geo-lng"
                  className="text-xs text-muted-foreground"
                >
                  Longitude
                </label>
                <Input
                  id="geo-lng"
                  type="number"
                  step="any"
                  placeholder="e.g. -74.0060"
                  value={geoLng}
                  onChange={(e) => setGeoLng(e.target.value)}
                />
              </div>
            </div>

            {(geoLat && geoLng) || submitting ? (
              <div className="space-y-1 mt-2">
                <MapPreview
                  lat={geoLat ? Number(geoLat) : null}
                  lng={geoLng ? Number(geoLng) : null}
                  className="h-40 w-full"
                />
              </div>
            ) : null}
          </div>
        </div>

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline" disabled={submitting}>
              Cancel
            </Button>
          </DialogClose>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Send className="h-4 w-4 mr-2" />
                Save Execution Log
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

interface PendingTableProps {
  requests: BlockRequest[]
  segments: Segment[]
  stations: Station[]
  loading: boolean
  onLogged: () => void
}

function PendingTable({
  requests,
  segments,
  stations,
  loading,
  onLogged,
}: PendingTableProps) {
  if (loading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    )
  }

  if (requests.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <ClipboardList className="h-12 w-12 text-muted-foreground/50 mb-4" />
        <h3 className="text-lg font-medium">No approved requests</h3>
        <p className="text-sm text-muted-foreground mt-2 max-w-sm">
          Approved block requests will appear here for execution logging.
        </p>
      </div>
    )
  }

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Segment</TableHead>
            <TableHead>Work Type</TableHead>
            <TableHead>Requested Start</TableHead>
            <TableHead>Duration</TableHead>
            <TableHead>Safety</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {requests.map((request, index) => {
            const segmentName = getSegmentName(
              request.segment_id,
              segments,
              stations,
            )
            const workTypeLabel =
              workTypeLabels[request.work_type] ?? request.work_type
            const safetyLabel =
              safetyLabels[request.safety_criticality] ??
              request.safety_criticality
            const badge = getStatusBadge(request.status)
            return (
              <TableRow
                key={request.id}
                className="animate-fade-in"
                style={{ animationDelay: `${Math.min(index * 40, 400)}ms` }}
              >
                <TableCell>{segmentName}</TableCell>
                <TableCell>{workTypeLabel}</TableCell>
                <TableCell>
                  {formatDateTime(request.requested_start)}
                </TableCell>
                <TableCell>
                  {formatDuration(request.requested_duration_mins)}
                </TableCell>
                <TableCell>{safetyLabel}</TableCell>
                <TableCell>
                  <Badge className={badge.className}>{badge.label}</Badge>
                </TableCell>
                <TableCell className="text-right">
                  <LogExecutionDialog
                    request={request}
                    segmentName={segmentName}
                    workTypeLabel={workTypeLabel}
                    safetyLabel={safetyLabel}
                    onLogged={onLogged}
                  />
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}

interface CompletedTableProps {
  logs: ExecutionLog[]
  requests: BlockRequest[]
  segments: Segment[]
  stations: Station[]
  loading: boolean
}

function CompletedTable({
  logs,
  requests,
  segments,
  stations,
  loading,
}: CompletedTableProps) {
  const reqById = new Map(requests.map((r) => [r.id, r]))

  if (loading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    )
  }

  if (logs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <ClipboardList className="h-12 w-12 text-muted-foreground/50 mb-4" />
        <h3 className="text-lg font-medium">No completed work yet</h3>
        <p className="text-sm text-muted-foreground mt-2 max-w-sm">
          Executed block requests will be listed here once logged.
        </p>
      </div>
    )
  }

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Segment</TableHead>
            <TableHead>Requested Start</TableHead>
            <TableHead>Actual Start</TableHead>
            <TableHead>Actual End</TableHead>
            <TableHead>Duration</TableHead>
            <TableHead>Variance</TableHead>
            <TableHead>Images</TableHead>
            <TableHead>Location</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {logs.map((log) => {
            const request = reqById.get(log.block_request_id ?? "")
            const segmentName =
              request != null
                ? getSegmentName(request.segment_id, segments, stations)
                : "—"

            let varianceMins: number | null = null
            if (
              log.actual_start != null &&
              log.actual_end != null &&
              request != null
            ) {
              const actualMs =
                new Date(log.actual_end).getTime() -
                new Date(log.actual_start).getTime()
              const actualMins = Math.round(actualMs / 60000)
              varianceMins = actualMins - request.requested_duration_mins
            }

            const varianceLabel =
              varianceMins != null ? formatVariance(varianceMins) : "—"
            const varianceColor =
              varianceMins != null && varianceMins > 0
                ? "text-destructive"
                : "text-success"

            return (
              <TableRow key={log.id}>
                <TableCell>{segmentName}</TableCell>
                <TableCell>
                  {request != null
                    ? formatDateTime(request.requested_start)
                    : "—"}
                </TableCell>
                <TableCell>
                  {log.actual_start != null
                    ? formatDateTime(log.actual_start)
                    : "—"}
                </TableCell>
                <TableCell>
                  {log.actual_end != null
                    ? formatDateTime(log.actual_end)
                    : "—"}
                </TableCell>
                <TableCell>
                  {varianceMins != null
                    ? formatDuration(
                        Math.round(
                          (new Date(log.actual_end!).getTime() -
                            new Date(log.actual_start!).getTime()) /
                            60000,
                        ),
                      )
                    : "—"}
                </TableCell>
                <TableCell className={varianceColor}>
                  {varianceLabel}
                </TableCell>
                <TableCell>
                  {log.before_image_url != null ||
                  log.after_image_url != null ? (
                    <div className="flex gap-1">
                      {log.before_image_url != null && (
                        <img
                          src={log.before_image_url}
                          alt="Before"
                          className="h-10 w-10 object-cover rounded border"
                        />
                      )}
                      {log.after_image_url != null && (
                        <img
                          src={log.after_image_url}
                          alt="After"
                          className="h-10 w-10 object-cover rounded border"
                        />
                      )}
                    </div>
                  ) : (
                    <span className="text-xs text-muted-foreground">
                      No images
                    </span>
                  )}
                </TableCell>
                <TableCell>
                  {log.geo_lat != null && log.geo_lng != null ? (
                    <div className="flex items-center gap-2">
                      <span className="text-xs">
                        {log.geo_lat.toFixed(4)}, {log.geo_lng.toFixed(4)}
                      </span>
                      <MapPreview
                        lat={log.geo_lat}
                        lng={log.geo_lng}
                        className="h-12 w-12 rounded"
                      />
                    </div>
                  ) : (
                    <span className="text-xs text-muted-foreground">
                      Not captured
                    </span>
                  )}
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}

export default function FieldPage() {
  const [approvedRequests, setApprovedRequests] = useState<BlockRequest[]>([])
  const [executedRequests, setExecutedRequests] = useState<BlockRequest[]>([])
  const [logs, setLogs] = useState<ExecutionLog[]>([])
  const [segments, setSegments] = useState<Segment[]>([])
  const [stations, setStations] = useState<Station[]>([])
  const [loading, setLoading] = useState(true)

  const fetchPending = async () => {
    const supabase = createClient()
    const { data, error } = await supabase
      .from("block_requests")
      .select("*")
      .eq("status", "approved")
      .order("requested_start", { ascending: true })

    if (error) {
      toast.error("Failed to load approved requests")
      return
    }
    setApprovedRequests((data ?? []) as BlockRequest[])
  }

  const fetchCompleted = async () => {
    const supabase = createClient()
    const { data, error } = await supabase
      .from("execution_logs")
      .select("*")
      .order("actual_start", { ascending: false })

    if (error) {
      toast.error("Failed to load completed work")
      return
    }
    setLogs((data ?? []) as ExecutionLog[])
  }

  const fetchExecutedRequests = async () => {
    const supabase = createClient()
    const { data, error } = await supabase
      .from("block_requests")
      .select("*")
      .eq("status", "executed")

    if (error) {
      toast.error("Failed to load executed requests")
      return
    }
    setExecutedRequests((data ?? []) as BlockRequest[])
  }

  useEffect(() => {
    const fetchData = async () => {
      const supabase = createClient()

      const { data: segData } = await supabase
        .from("segments")
        .select("id, name, from_station_id, to_station_id")
        .order("name")
      const { data: stnData } = await supabase
        .from("stations")
        .select("id, name")

      setSegments(segData ?? [])
      setStations((stnData ?? []) as Station[])

      await Promise.all([
        fetchPending(),
        fetchCompleted(),
        fetchExecutedRequests(),
      ])
      setLoading(false)
    }

    void fetchData()
  }, [])

  const handleLogged = () => {
    void fetchPending()
    void fetchCompleted()
    void fetchExecutedRequests()
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Field</h1>
        <p className="text-muted-foreground">
          Execution logs and field operations.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Approved Requests</CardTitle>
          <CardDescription>
            Block requests awaiting execution, sorted by requested start time.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <PendingTable
            requests={approvedRequests}
            segments={segments}
            stations={stations}
            loading={loading}
            onLogged={handleLogged}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Completed Work</CardTitle>
          <CardDescription>
            Executed block requests with duration variance and image previews.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CompletedTable
            logs={logs}
            requests={executedRequests}
            segments={segments}
            stations={stations}
            loading={loading}
          />
        </CardContent>
      </Card>
    </div>
  )
}
