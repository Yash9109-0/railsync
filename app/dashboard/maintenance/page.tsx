"use client"

import { useEffect, useMemo, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { toast } from "sonner"
import { ClipboardList, Copy, Search } from "lucide-react"
import type { BlockRequest, Segment } from "@/lib/types"

interface SegmentOption extends Segment {
  displayName: string
}

interface CurrentUser {
  id: string
  email?: string | null
}

const WORK_TYPE_OPTIONS = [
  { value: "track", label: "Track" },
  { value: "signal", label: "Signal" },
  { value: "electrical", label: "Electrical" },
  { value: "other", label: "Other" },
] as const

const SAFETY_OPTIONS = [
  { value: "routine", label: "Routine" },
  { value: "urgent", label: "Urgent" },
  { value: "safety_critical", label: "Safety Critical" },
] as const

const STATUS_CONFIG: Record<
  string,
  { label: string; className: string }
> = {
  submitted: {
    label: "Submitted",
    className:
      "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200",
  },
  scored: {
    label: "Scored",
    className:
      "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  },
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
  rejected: {
    label: "Rejected",
    className:
      "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
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

function getStatusBadge(
  status: string,
): { label: string; className: string } {
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
  segments: SegmentOption[],
): string {
  if (id == null) return "—"
  const seg = segments.find((s) => s.id === id)
  return seg ? seg.displayName : String(id)
}

export default function MaintenancePage() {
  const [user, setUser] = useState<CurrentUser | null>(null)
  const [segments, setSegments] = useState<SegmentOption[]>([])
  const [requests, setRequests] = useState<BlockRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const [segmentId, setSegmentId] = useState<string>("")
  const [workType, setWorkType] = useState<string>("")
  const [requestedStart, setRequestedStart] = useState<string>(
    () => toDateTimeLocal(new Date()),
  )
  const [duration, setDuration] = useState<string>("")
  const [safetyCriticality, setSafetyCriticality] = useState<string>("")
  const [errors, setErrors] = useState<Record<string, string>>({})

  const [searchQuery, setSearchQuery] = useState<string>("")
  const [statusFilter, setStatusFilter] = useState<string>("all")

  useEffect(() => {
    const fetchData = async () => {
      const supabase = createClient()

      const { data: { user: currentUser } } =
        await supabase.auth.getUser()

      const [segmentsRes, stationsRes] = await Promise.all([
        supabase
          .from("segments")
          .select("id, name, from_station_id, to_station_id")
          .order("name"),
        supabase.from("stations").select("id, name"),
      ])

      if (segmentsRes.data && stationsRes.data) {
        const stationMap = new Map(stationsRes.data.map((s) => [s.id, s.name]))
        const segmentsWithOptions: SegmentOption[] = segmentsRes.data.map(
          (seg) => ({
            ...seg,
            displayName: `${stationMap.get(seg.from_station_id) ?? seg.from_station_id} → ${stationMap.get(seg.to_station_id) ?? seg.to_station_id}`,
          }),
        )
        setSegments(segmentsWithOptions)
      }

      if (currentUser) {
        setUser({ id: currentUser.id, email: currentUser.email })

        const { data: requestsData, error: requestsError } =
          await supabase
            .from("block_requests")
            .select("*")
            .eq("requested_by", currentUser.id)
            .order("created_at", { ascending: false })

        if (requestsError) {
          toast.error("Failed to load requests")
        } else {
          setRequests((requestsData ?? []) as BlockRequest[])
        }
      }

      setLoading(false)
    }

    fetchData()
  }, [])

  const fetchRequests = async () => {
    if (!user) return
    const supabase = createClient()
    const { data, error } = await supabase
      .from("block_requests")
      .select("*")
      .eq("requested_by", user.id)
      .order("created_at", { ascending: false })
    if (error) {
      toast.error("Failed to load requests")
      return
    }
    setRequests((data ?? []) as BlockRequest[])
  }

  const resetForm = () => {
    setSegmentId("")
    setWorkType("")
    setRequestedStart(toDateTimeLocal(new Date()))
    setDuration("")
    setSafetyCriticality("")
    setErrors({})
  }

  const copyLastRequest = () => {
    const last = requests[0]
    if (!last) {
      toast("No previous requests to copy")
      return
    }
    setSegmentId(String(last.segment_id ?? ""))
    setWorkType(last.work_type)
    setRequestedStart(formatFromTimestamp(last.requested_start))
    setDuration(String(last.requested_duration_mins))
    setSafetyCriticality(last.safety_criticality)
    setErrors({})
    toast.success("Form pre-filled from last request")
  }

  const validateForm = () => {
    const newErrors: Record<string, string> = {}
    if (!segmentId) newErrors.segment = "Please select a segment"
    if (!workType) newErrors.workType = "Please select a work type"
    if (!requestedStart)
      newErrors.requestedStart = "Please select a date and time"
    if (!duration || Number(duration) <= 0)
      newErrors.duration = "Please enter a valid duration"
    if (!safetyCriticality)
      newErrors.safety = "Please select a safety level"
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!validateForm() || isSubmitting) return
    if (!user) {
      toast.error("User not loaded. Please refresh the page.")
      return
    }

    setIsSubmitting(true)

    const supabase = createClient()
    const { error } = await supabase.from("block_requests").insert({
      segment_id: Number(segmentId),
      work_type: workType,
      requested_start: `${requestedStart}:00`,
      requested_duration_mins: Number(duration),
      safety_criticality: safetyCriticality,
      status: "submitted",
      requested_by: user.id,
    })

    if (error) {
      toast.error(`Failed to submit request: ${error.message}`)
      setIsSubmitting(false)
      return
    }

    toast.success("Block request submitted successfully")
    resetForm()
    void fetchRequests()
    setIsSubmitting(false)
  }

  const isFormValid = () => {
    return Boolean(
      user &&
        !loading &&
        segmentId &&
        workType &&
        requestedStart &&
        duration &&
        Number(duration) > 0 &&
        safetyCriticality,
    )
  }

  const filteredRequests = useMemo(() => {
    return requests.filter((req) => {
      const segmentName = getSegmentName(req.segment_id, segments)
      const workTypeLabel =
        workTypeLabels[req.work_type] ?? req.work_type
      const matchesSearch =
        searchQuery === "" ||
        segmentName
          .toLowerCase()
          .includes(searchQuery.toLowerCase()) ||
        workTypeLabel
          .toLowerCase()
          .includes(searchQuery.toLowerCase())
      const matchesStatus =
        statusFilter === "all" || req.status === statusFilter
      return matchesSearch && matchesStatus
    })
  }, [requests, searchQuery, statusFilter, segments])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Maintenance</h1>
        <p className="text-muted-foreground">
          Block requests and maintenance scheduling.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>New Block Request</CardTitle>
          <CardDescription>
            Request a track block for maintenance work. All requests are
            routed to AI scoring and approval.
          </CardDescription>
          <CardAction>
            <Button
              variant="outline"
              size="sm"
              disabled={requests.length === 0 || loading}
              onClick={copyLastRequest}
            >
              <Copy className="h-4 w-4 mr-2" />
              Copy Last Request
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={handleSubmit}
            className="grid grid-cols-1 md:grid-cols-2 gap-4"
          >
            <div className="space-y-2">
              <label
                htmlFor="segment"
                className="text-sm font-medium leading-none"
              >
                Segment
              </label>
              <Select
                value={segmentId}
                onValueChange={setSegmentId}
                disabled={loading}
              >
                <SelectTrigger id="segment">
                  <SelectValue
                    placeholder={
                      loading
                        ? "Loading segments..."
                        : "Select a segment"
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {segments.map((seg) => (
                    <SelectItem key={seg.id} value={String(seg.id)}>
                      {seg.displayName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.segment && (
                <p
                  className="text-xs text-destructive"
                  id="segment-error"
                >
                  {errors.segment}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <label
                htmlFor="work-type"
                className="text-sm font-medium leading-none"
              >
                Work Type
              </label>
              <Select
                value={workType}
                onValueChange={setWorkType}
                disabled={loading}
              >
                <SelectTrigger id="work-type">
                  <SelectValue placeholder="Select a work type" />
                </SelectTrigger>
                <SelectContent>
                  {WORK_TYPE_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.workType && (
                <p
                  className="text-xs text-destructive"
                  id="work-type-error"
                >
                  {errors.workType}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <label
                htmlFor="requested-start"
                className="text-sm font-medium leading-none"
              >
                Requested Start
              </label>
              <Input
                id="requested-start"
                type="datetime-local"
                value={requestedStart}
                onChange={(e) => setRequestedStart(e.target.value)}
                disabled={loading}
              />
              {errors.requestedStart && (
                <p
                  className="text-xs text-destructive"
                  id="requested-start-error"
                >
                  {errors.requestedStart}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <label
                htmlFor="duration"
                className="text-sm font-medium leading-none"
              >
                Duration (minutes)
              </label>
              <Input
                id="duration"
                type="number"
                min="1"
                placeholder="e.g. 60"
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
                disabled={loading}
              />
              {errors.duration && (
                <p
                  className="text-xs text-destructive"
                  id="duration-error"
                >
                  {errors.duration}
                </p>
              )}
            </div>

            <div className="space-y-2 md:col-span-2">
              <label
                htmlFor="safety"
                className="text-sm font-medium leading-none"
              >
                Safety Criticality
              </label>
              <Select
                value={safetyCriticality}
                onValueChange={setSafetyCriticality}
                disabled={loading}
              >
                <SelectTrigger id="safety">
                  <SelectValue placeholder="Select a safety level" />
                </SelectTrigger>
                <SelectContent>
                  {SAFETY_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.safety && (
                <p
                  className="text-xs text-destructive"
                  id="safety-error"
                >
                  {errors.safety}
                </p>
              )}
            </div>

            <div className="md:col-span-2 flex justify-end">
              <Button
                type="submit"
                disabled={!isFormValid() || isSubmitting}
              >
                {isSubmitting ? "Submitting..." : "Submit Request"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>My Requests</CardTitle>
          <CardDescription>
            {user
              ? `${requests.length} request${requests.length !== 1 ? "s" : ""} submitted`
              : ""}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : requests.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <ClipboardList className="h-12 w-12 text-muted-foreground/50 mb-4" />
              <h3 className="text-lg font-medium">No requests yet</h3>
              <p className="text-sm text-muted-foreground mt-2 max-w-sm">
                Submit your first block request using the form above. Once
                submitted, it will appear here for tracking.
              </p>
            </div>
          ) : (
            <>
              <div className="flex flex-col sm:flex-row gap-4 mb-4">
                <div className="relative max-w-sm flex-1">
                  <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="Search by segment or work type..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-8"
                  />
                </div>
                <Select
                  value={statusFilter}
                  onValueChange={setStatusFilter}
                >
                  <SelectTrigger className="max-w-xs">
                    <SelectValue placeholder="Filter by status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Statuses</SelectItem>
                    <SelectItem value="submitted">Submitted</SelectItem>
                    <SelectItem value="scored">Scored</SelectItem>
                    <SelectItem value="approved">Approved</SelectItem>
                    <SelectItem value="executed">Executed</SelectItem>
                    <SelectItem value="rejected">Rejected</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {filteredRequests.length === 0 ? (
                <div className="text-center py-8 text-sm text-muted-foreground">
                  No matching results
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Segment</TableHead>
                      <TableHead>Work Type</TableHead>
                      <TableHead>Requested Start</TableHead>
                      <TableHead>Duration</TableHead>
                      <TableHead>Safety</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Priority Score</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredRequests.map((request, index) => {
                      const badge = getStatusBadge(request.status)
                      return (
                        <TableRow
                          key={request.id}
                          className="animate-fade-in"
                          style={{
                            animationDelay: `${Math.min(index * 40, 400)}ms`,
                          }}
                        >
                          <TableCell>
                            {getSegmentName(request.segment_id, segments)}
                          </TableCell>
                          <TableCell>
                            {workTypeLabels[request.work_type] ??
                              request.work_type}
                          </TableCell>
                          <TableCell>
                            {formatDateTime(request.requested_start)}
                          </TableCell>
                          <TableCell>
                            {request.requested_duration_mins} min
                          </TableCell>
                          <TableCell>
                            {safetyLabels[request.safety_criticality] ??
                              request.safety_criticality}
                          </TableCell>
                          <TableCell>
                            <Badge className={badge.className}>
                              {badge.label}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {request.priority_score !== null
                              ? request.priority_score.toFixed(1)
                              : "Pending AI review"}
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function formatFromTimestamp(dateString: string): string {
  const date = new Date(dateString)
  if (isNaN(date.getTime())) {
    return toDateTimeLocal(new Date())
  }
  return toDateTimeLocal(date)
}
