"use client"

import { useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { toast } from "sonner"
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui"
import { Loader2, MapPin, PlayCircle, RefreshCw, Upload, Clock } from "lucide-react"
import type { BlockRequest, BlockRequestStatus, ExecutionLog } from "@/lib/types"
import { cn } from "@/lib/utils"

interface SegmentName {
  name: string
}

interface BlockRequestRow extends BlockRequest {
  segments: SegmentName | null
}

const POLL_INTERVAL_MS = 15_000

const supabase = createClient()

const TOUCH_TARGET = "min-h-[44px] min-w-[44px]"

export default function FieldPage() {
  const [approved, setApproved] = useState<BlockRequestRow[]>([])
  const [inProgress, setInProgress] = useState<BlockRequestRow[]>([])
  const [completed, setCompleted] = useState<BlockRequestRow[]>([])
  const [logsByRequest, setLogsByRequest] = useState<Map<string, ExecutionLog>>(
    new Map(),
  )

  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [actingId, setActingId] = useState<string | null>(null)

  const [dialogOpen, setDialogOpen] = useState(false)
  const [completeTarget, setCompleteTarget] = useState<BlockRequestRow | null>(
    null,
  )
  const [beforeFile, setBeforeFile] = useState<File | null>(null)
  const [afterFile, setAfterFile] = useState<File | null>(null)
  const [actualEnd, setActualEnd] = useState("")
  const [lat, setLat] = useState("")
  const [lng, setLng] = useState("")
  const [locating, setLocating] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const fetchAll = async () => {
    setLoading(true)
    const { data: reqData, error: reqErr } = await supabase
      .from("block_requests")
      .select("*, segments(name)")
      .order("created_at", { ascending: false })
    const { data: logData, error: logErr } = await supabase
      .from("execution_logs")
      .select("*")
      .order("created_at", { ascending: false })

    if (reqErr) toast.error("Failed to load requests", { description: reqErr.message })
    if (logErr) toast.error("Failed to load work logs", { description: logErr.message })

    const requests = (reqData ?? []) as BlockRequestRow[]
    setApproved(requests.filter((r) => r.status === "approved"))
    setInProgress(requests.filter((r) => r.status === "in_progress"))
    setCompleted(requests.filter((r) => r.status === "executed"))

    const byRequest = new Map<string, ExecutionLog>()
    for (const log of (logData ?? []) as ExecutionLog[]) {
      if (log.block_request_id && !byRequest.has(log.block_request_id)) {
        byRequest.set(log.block_request_id, log)
      }
    }
    setLogsByRequest(byRequest)
    setLoading(false)
  }

  useEffect(() => {
    fetchAll()
    const id = setInterval(fetchAll, POLL_INTERVAL_MS)
    return () => clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleStart = async (req: BlockRequestRow) => {
    setActingId(req.id)
    try {
      const { error: logErr } = await supabase.from("execution_logs").insert({
        block_request_id: req.id,
        actual_start: new Date().toISOString(),
        status: "in_progress" as const,
      })
      if (logErr) throw logErr

      const { error: updErr } = await supabase
        .from("block_requests")
        .update({ status: "in_progress" as BlockRequestStatus })
        .eq("id", req.id)
      if (updErr) throw updErr

      toast.success("Work started")
      setApproved((prev) => prev.filter((r) => r.id !== req.id))
      setInProgress((prev) => [req, ...prev])
      const syntheticLog: ExecutionLog = {
        id: "",
        block_request_id: req.id,
        before_image_url: null,
        after_image_url: null,
        actual_start: new Date().toISOString(),
        actual_end: null,
        geo_lat: null,
        geo_lng: null,
        status: "in_progress",
        verified: false,
        created_at: new Date().toISOString(),
      }
      setLogsByRequest((prev) => new Map(prev).set(req.id, syntheticLog))
    } catch (e: any) {
      toast.error("Could not start work", { description: e.message })
    } finally {
      setActingId(null)
    }
  }

  const handleUseLocation = () => {
    if (!navigator.geolocation) {
      toast.error("Geolocation is not supported by this browser")
      return
    }
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLat(String(pos.coords.latitude))
        setLng(String(pos.coords.longitude))
        toast.success("Location captured")
        setLocating(false)
      },
      (err) => {
        toast.error("Could not capture location", {
          description: err?.message ?? "Please enter coordinates manually",
        })
        setLocating(false)
      },
    )
  }

  const uploadImage = async (file: File): Promise<string> => {
    const fileName = `${Date.now()}-${file.name}`
    const { error } = await supabase.storage
      .from("execution-images")
      .upload(fileName, file)
    if (error) throw error
    const { data } = supabase.storage.from("execution-images").getPublicUrl(fileName)
    return data.publicUrl
  }

  const openComplete = (req: BlockRequestRow) => {
    setCompleteTarget(req)
    setActualEnd(new Date().toISOString().slice(0, 16))
    setBeforeFile(null)
    setAfterFile(null)
    setLat("")
    setLng("")
    setDialogOpen(true)
  }

  const handleSubmitComplete = async () => {
    if (!completeTarget) return
    setSubmitting(true)
    try {
      let beforeUrl = ""
      let afterUrl = ""
      if (beforeFile) beforeUrl = await uploadImage(beforeFile)
      if (afterFile) afterUrl = await uploadImage(afterFile)

      const endTime = new Date(actualEnd).toISOString()

      const { data: logs, error: findErr } = await supabase
        .from("execution_logs")
        .select("*")
        .eq("block_request_id", completeTarget.id)
        .eq("status", "in_progress")
        .order("created_at", { ascending: false })
        .limit(1)
      if (findErr) throw findErr

      const log = logs?.[0]
      if (log) {
        const { error: updErr } = await supabase
          .from("execution_logs")
          .update({
            before_image_url: beforeUrl,
            after_image_url: afterUrl,
            actual_end: endTime,
            geo_lat: lat ? parseFloat(lat) : null,
            geo_lng: lng ? parseFloat(lng) : null,
            status: "completed" as const,
          })
          .eq("id", log.id)
        if (updErr) throw updErr
      }

      const { error: reqErr } = await supabase
        .from("block_requests")
        .update({ status: "executed" as BlockRequestStatus })
        .eq("id", completeTarget.id)
      if (reqErr) throw reqErr

      toast.success("Work completed — logged for AI learning.")

      fetch("/api/update-stats", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          segment_id: completeTarget.segment_id,
          work_type: completeTarget.work_type,
        }),
      }).catch((err) => console.error("update-stats error:", err))

      setDialogOpen(false)
      setCompleteTarget(null)
      setInProgress((prev) => prev.filter((r) => r.id !== completeTarget.id))
      await fetchAll()
    } catch (e: any) {
      toast.error("Could not complete work", { description: e.message })
    } finally {
      setSubmitting(false)
    }
  }

  const computeVariance = (
    log: ExecutionLog | undefined,
    requested: number,
  ): number | null => {
    if (!log?.actual_start || !log?.actual_end || !requested) return null
    const mins =
      (Date.parse(log.actual_end) - Date.parse(log.actual_start)) / 60000
    return Math.round(mins - requested)
  }

  const segmentLabel = (r: BlockRequestRow) =>
    r.segments?.name ?? `Segment #${r.segment_id ?? "—"}`

  const shortId = (id: string) => id.slice(0, 8)

  const varianceBadge = (variance: number | null) => {
    if (variance === null) {
      return (
        <span className="text-xs text-muted-foreground">—</span>
      )
    }
    if (variance < 0) {
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800">
          Saved {Math.abs(variance)} min
        </span>
      )
    }
    if (variance > 0) {
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-medium text-red-800">
          Over by {variance} min
        </span>
      )
    }
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800">
        On time
      </span>
    )
  }

  const ImageThumb = ({ url }: { url: string | null }) =>
    url ? (
      <a href={url} target="_blank" rel="noreferrer" className="inline-block">
        <img
          src={url}
          alt="work site"
          className="h-10 w-10 rounded object-cover ring-1 ring-border"
        />
      </a>
    ) : (
      <span className="text-xs text-muted-foreground">—</span>
    )

  return (
    <div className="space-y-8 bg-white min-h-screen">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">
            Field Execution Dashboard
          </h1>
          <p className="text-sm text-muted-foreground">
            Start approved work, complete it with site photos and a location,
            and review execution performance.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setRefreshing(true)
            fetchAll().finally(() => setRefreshing(false))
          }}
          disabled={refreshing}
          className={cn(TOUCH_TARGET)}
        >
          {refreshing ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
          Refresh
        </Button>
      </div>

      {/* Section 1 — Approved */}
      <Card>
        <CardHeader>
          <CardTitle>Approved — Ready to Start</CardTitle>
          <CardDescription>
            Block requests cleared for field work. Tap Start Work to begin.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ID</TableHead>
                  <TableHead>Segment</TableHead>
                  <TableHead>Work Type</TableHead>
                  <TableHead>Requested Start</TableHead>
                  <TableHead>Duration</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading
                  ? Array.from({ length: 6 }).map((_, i) => (
                      <TableRow key={i}>
                        <TableCell>
                          <Skeleton className="h-4 w-10" />
                        </TableCell>
                        <TableCell>
                          <Skeleton className="h-4 w-24" />
                        </TableCell>
                        <TableCell>
                          <Skeleton className="h-4 w-20" />
                        </TableCell>
                        <TableCell>
                          <Skeleton className="h-4 w-28" />
                        </TableCell>
                        <TableCell>
                          <Skeleton className="h-4 w-12" />
                        </TableCell>
                        <TableCell className="text-right">
                          <Skeleton className="h-9 w-28" />
                        </TableCell>
                      </TableRow>
                    ))
                  : approved.length === 0
                    ? (
                      <TableRow>
                        <TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">
                          No approved requests waiting.
                        </TableCell>
                      </TableRow>
                    )
                    : approved.map((r) => (
                        <TableRow key={r.id}>
                          <TableCell className="font-mono">
                            {shortId(r.id)}
                          </TableCell>
                          <TableCell>{segmentLabel(r)}</TableCell>
                          <TableCell className="capitalize">{r.work_type}</TableCell>
                          <TableCell>
                            {new Date(r.requested_start).toLocaleString(
                              undefined,
                              { dateStyle: "short", timeStyle: "short" },
                            )}
                          </TableCell>
                          <TableCell>{r.requested_duration_mins} m</TableCell>
                          <TableCell className="text-right">
                            <Button
                              onClick={() => handleStart(r)}
                              disabled={actingId === r.id}
                              className={cn(
                                "bg-primary hover:bg-primary/90 text-primary-foreground",
                                TOUCH_TARGET,
                              )}
                            >
                              {actingId === r.id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <PlayCircle className="h-4 w-4" />
                              )}
                              Start Work
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Section 2 — In Progress */}
      <Card className="border-2 border-primary">
        <CardHeader>
          <CardTitle className="text-primary">In Progress</CardTitle>
          <CardDescription>
            Work currently being performed by the crew. Complete it with
            before/after photos.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ID</TableHead>
                  <TableHead>Segment</TableHead>
                  <TableHead>Work Type</TableHead>
                  <TableHead>
                    <span className="inline-flex items-center gap-1">
                      <Clock className="h-3 w-3" /> Started
                    </span>
                  </TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {inProgress.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={5}
                      className="py-8 text-center text-sm text-muted-foreground"
                    >
                      No work in progress.
                    </TableCell>
                  </TableRow>
                ) : (
                  inProgress.map((r) => {
                    const log = logsByRequest.get(r.id)
                    const started = log?.actual_start
                    return (
                      <TableRow key={r.id}>
                        <TableCell className="font-mono">
                          {shortId(r.id)}
                        </TableCell>
                        <TableCell>{segmentLabel(r)}</TableCell>
                        <TableCell className="capitalize">{r.work_type}</TableCell>
                        <TableCell>
                          {started
                            ? new Date(started).toLocaleString(undefined, {
                                dateStyle: "short",
                                timeStyle: "short",
                              })
                            : "—"}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            onClick={() => openComplete(r)}
                            className={cn(
                              "bg-success hover:bg-success/90 text-success-foreground",
                              TOUCH_TARGET,
                            )}
                          >
                            Complete Work
                          </Button>
                        </TableCell>
                      </TableRow>
                    )
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Section 3 — Completed */}
      <Card>
        <CardHeader>
          <CardTitle>Completed Work</CardTitle>
          <CardDescription>
            Finished requests and their schedule variance against the requested
            duration.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ID</TableHead>
                  <TableHead>Segment</TableHead>
                  <TableHead>Work Type</TableHead>
                  <TableHead>Duration</TableHead>
                  <TableHead>Variance</TableHead>
                  <TableHead>Before</TableHead>
                  <TableHead>After</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading
                  ? Array.from({ length: 6 }).map((_, i) => (
                      <TableRow key={i}>
                        <TableCell>
                          <Skeleton className="h-4 w-10" />
                        </TableCell>
                        <TableCell>
                          <Skeleton className="h-4 w-24" />
                        </TableCell>
                        <TableCell>
                          <Skeleton className="h-4 w-20" />
                        </TableCell>
                        <TableCell>
                          <Skeleton className="h-4 w-12" />
                        </TableCell>
                        <TableCell>
                          <Skeleton className="h-5 w-16" />
                        </TableCell>
                        <TableCell>
                          <Skeleton className="h-10 w-10 rounded" />
                        </TableCell>
                        <TableCell>
                          <Skeleton className="h-10 w-10 rounded" />
                        </TableCell>
                      </TableRow>
                    ))
                  : completed.length === 0
                    ? (
                      <TableRow>
                        <TableCell
                          colSpan={7}
                          className="py-8 text-center text-sm text-muted-foreground"
                        >
                          No completed work yet.
                        </TableCell>
                      </TableRow>
                    )
                    : completed.map((r) => {
                        const log = logsByRequest.get(r.id)
                        const variance = computeVariance(
                          log,
                          r.requested_duration_mins,
                        )
                        return (
                          <TableRow key={r.id}>
                            <TableCell className="font-mono">
                              {shortId(r.id)}
                            </TableCell>
                            <TableCell>{segmentLabel(r)}</TableCell>
                            <TableCell className="capitalize">
                              {r.work_type}
                            </TableCell>
                            <TableCell>
                              {r.requested_duration_mins} m
                            </TableCell>
                            <TableCell>{varianceBadge(variance)}</TableCell>
                            <TableCell>
                              <ImageThumb url={log?.before_image_url ?? null} />
                            </TableCell>
                            <TableCell>
                              <ImageThumb url={log?.after_image_url ?? null} />
                            </TableCell>
                          </TableRow>
                        )
                      })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Complete Work dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="w-[95vw] max-w-lg bg-white">
          <DialogHeader>
            <DialogTitle>Complete Work</DialogTitle>
            <DialogDescription>
              {completeTarget
                ? `Recording completion for ${segmentLabel(completeTarget)}. Upload site photos, set the end time, and capture a location.`
                : "Complete work details"}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5 overflow-y-auto max-h-[60vh]">
            <div className="space-y-1.5">
              <label
                className="text-sm font-medium leading-none"
                htmlFor="before-image"
              >
                Site Before Work
              </label>
              <Input
                id="before-image"
                type="file"
                accept="image/*"
                capture="environment"
                onChange={(e) => setBeforeFile(e.target.files?.[0] ?? null)}
              />
              {beforeFile && (
                <p className="text-xs text-muted-foreground">
                  Selected: {beforeFile.name}
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <label
                className="text-sm font-medium leading-none"
                htmlFor="after-image"
              >
                Site After Work
              </label>
              <Input
                id="after-image"
                type="file"
                accept="image/*"
                capture="environment"
                onChange={(e) => setAfterFile(e.target.files?.[0] ?? null)}
              />
              {afterFile && (
                <p className="text-xs text-muted-foreground">
                  Selected: {afterFile.name}
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <label
                className="text-sm font-medium leading-none"
                htmlFor="actual-end"
              >
                Actual End Time
              </label>
              <Input
                id="actual-end"
                type="datetime-local"
                value={actualEnd}
                onChange={(e) => setActualEnd(e.target.value)}
                className={cn(TOUCH_TARGET, "h-11")}
              />
            </div>

            <div className="space-y-1.5">
              <label
                className="text-sm font-medium leading-none"
                htmlFor="geo-lat"
              >
                Location (editable)
              </label>
              <div className="grid grid-cols-2 gap-2">
                <Input
                  id="geo-lat"
                  type="number"
                  step="any"
                  placeholder="Latitude"
                  value={lat}
                  onChange={(e) => setLat(e.target.value)}
                  className={cn(TOUCH_TARGET, "h-11")}
                />
                <Input
                  id="geo-lng"
                  type="number"
                  step="any"
                  placeholder="Longitude"
                  value={lng}
                  onChange={(e) => setLng(e.target.value)}
                  className={cn(TOUCH_TARGET, "h-11")}
                />
              </div>
              <Button
                type="button"
                variant="outline"
                onClick={handleUseLocation}
                disabled={locating}
                className={cn("w-full", TOUCH_TARGET)}
              >
                {locating ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <MapPin className="h-4 w-4" />
                )}
                Use My Location
              </Button>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <DialogClose asChild>
              <Button
                type="button"
                variant="outline"
                disabled={submitting}
                className={cn(TOUCH_TARGET)}
              >
                Cancel
              </Button>
            </DialogClose>
            <Button
              onClick={handleSubmitComplete}
              disabled={submitting || !completeTarget}
              className={cn(
                "bg-success hover:bg-success/90 text-success-foreground",
                TOUCH_TARGET,
              )}
            >
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Submitting…
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4" />
                  Submit Completion
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
