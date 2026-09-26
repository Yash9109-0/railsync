"use client"

import { useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { useCorridor } from "@/context/CorridorContext"
import { toast } from "sonner"
import {
  Badge,
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
  EmptyState,
  Input,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui"
import type { User } from "@supabase/supabase-js";
import { DashboardPageHeader } from "@/components/dashboard-page-header"
import { Loader2, MapPin, PlayCircle, RefreshCw, Upload, Clock } from "lucide-react"
import Image from "next/image"
import type {
  BlockRequest,
  BlockRequestStatus,
  DefectStatus,
  ExecutionLog,
} from "@/lib/types"
import { cn } from "@/lib/utils"
import { CheckCircle, AlertTriangle } from "lucide-react"

interface WeeklyProgressProps {
  selectedCorridorId: number | null
}

function WeeklyProgressCard({ selectedCorridorId }: WeeklyProgressProps) {
  const [completedThisWeek, setCompletedThisWeek] = useState(0)
  const [avgVariance, setAvgVariance] = useState<number | null>(null)
  const [inProgressCount, setInProgressCount] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      const supabase = createClient()

      try {
        const weekAgo = new Date()
        weekAgo.setDate(weekAgo.getDate() - 7)
        weekAgo.setHours(0, 0, 0, 0)

        let segmentIds: number[] | null = null
        if (selectedCorridorId != null) {
          const { data: segData } = await supabase
            .from("segments")
            .select("id")
            .eq("corridor_id", selectedCorridorId)
          segmentIds = (segData ?? []).map((s) => s.id)
        }

        const baseQuery = supabase
          .from("block_requests")
          .select("id, status, requested_duration_mins, created_at, segment_id")
          .order("created_at", { ascending: false })

        const scopedQuery = segmentIds?.length
          ? baseQuery.in("segment_id", segmentIds)
          : baseQuery

        const { data: requests } = await scopedQuery

        if (!requests || cancelled) return

        const executedThisWeek = requests.filter(
          (r) =>
            r.status === "executed" &&
            new Date(r.created_at) >= weekAgo
        )
        const inProgress = requests.filter((r) => r.status === "in_progress")

        if (cancelled) return
        setCompletedThisWeek(executedThisWeek.length)
        setInProgressCount(inProgress.length)

        if (executedThisWeek.length > 0) {
          const { data: logs } = await supabase
            .from("execution_logs")
            .select("block_request_id, actual_start, actual_end")
            .in("block_request_id", executedThisWeek.map((r) => r.id))
            .eq("status", "completed")

          if (!cancelled && logs) {
            let totalVariance = 0
            let countWithVariance = 0
            for (const log of logs) {
              const req = executedThisWeek.find((r) => r.id === log.block_request_id)
              if (req && log.actual_start && log.actual_end && req.requested_duration_mins) {
                const actualMins = Math.round(
                  (Date.parse(log.actual_end) - Date.parse(log.actual_start)) / 60000
                )
                totalVariance += actualMins - req.requested_duration_mins
                countWithVariance++
              }
            }
            if (countWithVariance > 0) {
              setAvgVariance(Math.round(totalVariance / countWithVariance))
            }
          }
        }
      } catch {
        if (!cancelled) {
          setCompletedThisWeek(0)
          setAvgVariance(null)
          setInProgressCount(0)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => { cancelled = true }
  }, [selectedCorridorId])

  const statItems = [
    {
      label: "Completed This Week",
      value: loading ? "—" : String(completedThisWeek),
      icon: <CheckCircle className="h-4 w-4 text-success" />,
      desc: "Work items executed",
    },
    {
      label: "Avg Variance",
      value: loading ? "—" : avgVariance === null ? "—" : `${avgVariance >= 0 ? "+" : ""}${avgVariance} min`,
      icon: <Clock className="h-4 w-4 text-primary" />,
      desc: avgVariance === null ? "No data" : avgVariance > 0 ? "Over planned" : avgVariance < 0 ? "Under planned" : "On time",
    },
    {
      label: "In Progress",
      value: loading ? "—" : String(inProgressCount),
      icon: <AlertTriangle className="h-4 w-4 text-warning" />,
      desc: "Currently being worked",
    },
  ]

  return (
    <Card className="bg-gradient-card border border-border/50">
      <CardContent className="py-3">
        <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground mb-2">
          <span className="font-medium text-sm">This Week's Progress</span>
          {loading && <Loader2 className="h-3 w-3 animate-spin" />}
        </div>
        <div className="grid grid-cols-3 gap-3 sm:gap-4">
          {statItems.map((item) => (
            <div
              key={item.label}
              className="flex items-center gap-2 p-2 rounded-lg bg-card border border-border/50 hover:bg-muted/30 transition-colors"
            >
              <div className="flex-shrink-0">{item.icon}</div>
              <div className="min-w-0">
                <p className="text-xl font-bold tabular-nums font-heading leading-tight">{item.value}</p>
                <p className="text-[10px] text-muted-foreground truncate">{item.label}</p>
                <p className="text-[10px] text-muted-foreground/70 truncate">{item.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

interface SegmentInfo {
  name: string
  corridor_id: number | null
}

interface BlockRequestRow extends BlockRequest {
  segments: SegmentInfo | null
}

const POLL_INTERVAL_MS = 15_000

const supabase = createClient()

const TOUCH_TARGET = "min-h-[44px] min-w-[44px]"

export default function FieldPage() {
  const { selectedCorridorId } = useCorridor()
  const [user, setUser] = useState<User | null>(null)
  const [approved, setApproved] = useState<BlockRequestRow[]>([])
  const [inProgress, setInProgress] = useState<BlockRequestRow[]>([])
  const [completed, setCompleted] = useState<BlockRequestRow[]>([])
  const [logsByRequest, setLogsByRequest] = useState<Map<string, ExecutionLog>>(
    new Map(),
  )
  const [corridorNames, setCorridorNames] = useState<Map<number, string>>(
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
      .select("*, segments(name, corridor_id)")
      .order("created_at", { ascending: false })
    const { data: logData, error: logErr } = await supabase
      .from("execution_logs")
      .select("*")
      .order("created_at", { ascending: false })
    const { data: corrData, error: corrErr } = await supabase
      .from("corridors")
      .select("id, name")

    if (reqErr) toast.error("Failed to load requests", { description: reqErr.message })
    if (logErr) toast.error("Failed to load work logs", { description: logErr.message })
    if (corrErr) toast.error("Failed to load corridors", { description: corrErr.message })

    setCorridorNames(new Map((corrData ?? []).map((c) => [c.id, c.name])))

    const requests = (reqData ?? []) as BlockRequestRow[]
    const visible =
      selectedCorridorId == null
        ? requests
        : requests.filter(
            (r) => r.segments?.corridor_id === selectedCorridorId,
          )
    setApproved(visible.filter((r) => r.status === "approved"))
    setInProgress(visible.filter((r) => r.status === "in_progress"))
    setCompleted(visible.filter((r) => r.status === "executed"))

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
    const loadUser = async () => {
      const { data } = await supabase.auth.getUser();
      setUser(data.user ?? null);
    };
    loadUser();
    fetchAll()
    const id = setInterval(fetchAll, POLL_INTERVAL_MS)
    return () => clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCorridorId])

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

      const { data: linkedDefects, error: defectLookupErr } = await supabase
        .from("defects")
        .select("id")
        .eq("linked_block_request_id", completeTarget.id)
      if (defectLookupErr) throw defectLookupErr

      const hasLinkedDefect = linkedDefects && linkedDefects.length > 0

      if (hasLinkedDefect) {
        const { error: defectUpdateErr } = await supabase
          .from("defects")
          .update({ status: "resolved" as DefectStatus })
          .eq("linked_block_request_id", completeTarget.id)
        if (defectUpdateErr) throw defectUpdateErr
      }

      toast.success("Work completed — logged for AI learning.")
      if (hasLinkedDefect) {
        toast.success("Linked defect marked resolved.")
      }

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

  const corridorLabel = (r: BlockRequestRow) => {
    const cid = r.segments?.corridor_id ?? null
    if (cid == null) return null
    return corridorNames.get(cid) ?? `Corridor #${cid}`
  }

  const segmentCell = (r: BlockRequestRow) => {
    const label = corridorLabel(r)
    return (
      <div className="flex items-center gap-1.5">
        <span>{segmentLabel(r)}</span>
        {label ? (
          <Badge variant="secondary" className="text-xs">
            {label}
          </Badge>
        ) : null}
      </div>
    )
  }

  const shortId = (id: string) => id.slice(0, 8)

  const varianceBadge = (variance: number | null) => {
    if (variance === null) {
      return (
        <span className="text-xs text-muted-foreground">—</span>
      )
    }
    if (variance < 0) {
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-success-bg px-2.5 py-0.5 text-xs font-medium text-success">
          Saved {Math.abs(variance)} min
        </span>
      )
    }
    if (variance > 0) {
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-destructive-bg px-2.5 py-0.5 text-xs font-medium text-destructive">
          Over by {variance} min
        </span>
      )
    }
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-success-bg px-2.5 py-0.5 text-xs font-medium text-success">
        On time
      </span>
    )
  }

  const ImageThumb = ({ url }: { url: string | null }) =>
    url ? (
      <a href={url} target="_blank" rel="noreferrer" className="inline-block">
        <Image
          src={url}
          alt="work site"
          width={40}
          height={40}
          className="rounded object-cover ring-1 ring-border"
          loading="lazy"
        />
      </a>
    ) : (
      <span className="text-xs text-muted-foreground">—</span>
    )

  return (
    <div className="space-y-8 min-h-screen">
      <DashboardPageHeader
        icon={MapPin}
        title="Field Execution Dashboard"
        description="Start approved work, complete it with site photos and a location, and review execution performance."
        userName={user?.email?.split("@")[0] || "User"}
        action={
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
        }
      />

      <WeeklyProgressCard selectedCorridorId={selectedCorridorId} />

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
                        <TableCell colSpan={6} className="py-8">
                          <EmptyState
                            illustrationSrc="maintenance-all-clear.svg"
                            illustrationAlt="All caught up - no approved requests"
                            title="All caught up!"
                            description="No approved requests waiting — you're all caught up!"
                            className="py-4"
                          />
                        </TableCell>
                      </TableRow>
                    )
                    : approved.map((r) => (
                        <TableRow key={r.id}>
                          <TableCell className="font-mono">
                            {shortId(r.id)}
                          </TableCell>
                          <TableCell>{segmentCell(r)}</TableCell>
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
                              data-tour="start-work-btn"
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
                    <TableCell colSpan={5} className="py-8">
                      <EmptyState
                        illustrationSrc="field-empty-progress.svg"
                        illustrationAlt="No work in progress"
                        title="No work in progress"
                        description="Nothing to complete right now. Start approved work to see it here."
                        className="py-4"
                      />
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
                        <TableCell>{segmentCell(r)}</TableCell>
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
                            data-tour="complete-work-btn"
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
                        <TableCell colSpan={7} className="py-8">
                          <EmptyState
                            illustrationSrc="maintenance-all-clear.svg"
                            illustrationAlt="No completed work yet"
                            title="No completed work yet"
                            description="Finish a job to see it here."
                            className="py-4"
                          />
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
                            <TableCell>{segmentCell(r)}</TableCell>
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
      <DialogContent className="w-[95vw] max-w-lg bg-background">
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
