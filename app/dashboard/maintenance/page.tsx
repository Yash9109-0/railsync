"use client"

import { useEffect, useMemo, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
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
import { ClipboardList, RefreshCw, Search } from "lucide-react"
import type { BlockRequest, Segment, PlanOption, Defect } from "@/lib/types"

interface SegmentOption extends Segment {
  displayName: string
}

interface CurrentUser {
  id: string
  email?: string | null
}

const DEPARTMENT_OPTIONS = ["TMS", "TDMS", "SMMS"]

const DEFECT_TYPE_OPTIONS = [
  { value: "rail_crack", label: "Rail Crack" },
  { value: "signal_fault", label: "Signal Fault" },
  { value: "ohe_wear", label: "OHE Wear" },
  { value: "track_geometry", label: "Track Geometry" },
  { value: "other", label: "Other" },
] as const

const SEVERITY_OPTIONS = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
  { value: "critical", label: "Critical" },
] as const

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
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
      "bg-red-100 text-red-900 dark:bg-red-900 dark:text-red-200",
  },
  safety_blocked: {
    label: "Safety Blocked",
    className:
      "bg-red-100 text-red-900 dark:bg-red-900 dark:text-red-200",
  },
}

const DEFECT_STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  open: {
    label: "Open",
    className:
      "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200",
  },
  block_requested: {
    label: "Block Requested",
    className:
      "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  },
  in_progress: {
    label: "In Progress",
    className:
      "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
  },
  resolved: {
    label: "Resolved",
    className:
      "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
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

const DEFECT_TYPE_LABELS: Record<string, string> = {
  rail_crack: "Rail Crack",
  signal_fault: "Signal Fault",
  ohe_wear: "OHE Wear",
  track_geometry: "Track Geometry",
  other: "Other",
}

const SEVERITY_LABELS: Record<string, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  critical: "Critical",
}

const SEVERITY_BADGE: Record<string, string> = {
  low: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  medium: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
  high: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
  critical: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
}

function severityToSafetyCriticality(severity: string): string {
  switch (severity) {
    case "low":
    case "medium":
      return "routine"
    case "high":
      return "urgent"
    case "critical":
      return "safety_critical"
    default:
      return ""
  }
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

function formatDate(dateString: string): string {
  try {
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    })
  } catch {
    return dateString
  }
}

function formatDateOnly(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
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

function getDefectStatusBadge(
  status: string,
): { label: string; className: string } {
  return (
    DEFECT_STATUS_CONFIG[status] ?? {
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

function formatFromTimestamp(dateString: string): string {
  const date = new Date(dateString)
  if (isNaN(date.getTime())) {
    return toDateTimeLocal(new Date())
  }
  return toDateTimeLocal(date)
}

export default function MaintenancePage() {
  const [user, setUser] = useState<CurrentUser | null>(null)
  const [segments, setSegments] = useState<SegmentOption[]>([])
  const [requests, setRequests] = useState<BlockRequest[]>([])
  const [planOptions, setPlanOptions] = useState<Record<string, PlanOption[]>>({})
  const [defects, setDefects] = useState<Defect[]>([])
  const [blockRequestScores, setBlockRequestScores] = useState<
    Record<string, { priority_score: number | null; status: string }>
  >({})
  const [loading, setLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const [segmentId, setSegmentId] = useState<string>("")
  const [department, setDepartment] = useState<string>("")
  const [defectType, setDefectType] = useState<string>("")
  const [severity, setSeverity] = useState<string>("")
  const [dueDate, setDueDate] = useState<string>(() => formatDateOnly(new Date()))
  const [workDescription, setWorkDescription] = useState<string>("")
  const [justification, setJustification] = useState<string>("")
  const [requestedStart, setRequestedStart] = useState<string>(
    () => toDateTimeLocal(new Date()),
  )
  const [requestedDurationMins, setRequestedDurationMins] = useState<string>("")
  const [requestBlock, setRequestBlock] = useState<boolean>(true)
  const [errors, setErrors] = useState<Record<string, string>>({})

  const [searchQuery, setSearchQuery] = useState<string>("")
  const [statusFilter, setStatusFilter] = useState<string>("all")
  const [reprocessing, setReprocessing] = useState<Record<string, boolean>>({})
  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(null)

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
          const requestsArray = (requestsData ?? []) as BlockRequest[]
          setRequests(requestsArray)

          const scoredRequests = requestsArray.filter((r) => r.status === "scored")
          if (scoredRequests.length > 0) {
            const { data: optData, error: optError } = await supabase
              .from("block_plan_options")
              .select("*")
              .in("block_request_id", scoredRequests.map((r) => r.id))
            if (!optError && optData) {
              const grouped: Record<string, PlanOption[]> = {}
              for (const opt of (optData ?? []) as PlanOption[]) {
                if (!grouped[opt.block_request_id]) grouped[opt.block_request_id] = []
                grouped[opt.block_request_id].push(opt)
              }
              setPlanOptions(grouped)
            }
          }
        }
      }

      setLoading(false)
    }

    fetchData()
    fetchDefects()
  }, [])

  const fetchDefects = async () => {
    const supabase = createClient()
    const { data, error } = await supabase
      .from("defects")
      .select("*")
      .order("due_date", { ascending: true })
    if (error) {
      toast.error("Failed to load defects")
      return
    }
    const defectsData = (data ?? []) as Defect[]
    setDefects(defectsData)

    const linkedIds = defectsData
      .filter((d) => d.linked_block_request_id)
      .map((d) => d.linked_block_request_id as string)
    if (linkedIds.length > 0) {
      const { data: brData } = await supabase
        .from("block_requests")
        .select("id, priority_score, status")
        .in("id", linkedIds)
      const scoreMap: Record<string, { priority_score: number | null; status: string }> = {}
      for (const br of (brData ?? []) as { id: string; priority_score: number | null; status: string }[]) {
        scoreMap[br.id] = {
          priority_score: br.priority_score,
          status: br.status,
        }
      }
      setBlockRequestScores(scoreMap)
    }
  }

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
    const requestsData = (data ?? []) as BlockRequest[]
    setRequests(requestsData)

    const scoredRequests = requestsData.filter((r) => r.status === "scored")
    if (scoredRequests.length > 0) {
      const { data: optData, error: optError } = await supabase
        .from("block_plan_options")
        .select("*")
        .in("block_request_id", scoredRequests.map((r) => r.id))
      if (!optError && optData) {
        const grouped: Record<string, PlanOption[]> = {}
        for (const opt of (optData ?? []) as PlanOption[]) {
          if (!grouped[opt.block_request_id]) grouped[opt.block_request_id] = []
          grouped[opt.block_request_id].push(opt)
        }
        setPlanOptions(grouped)
      }
    }
  }

  const handleReprocess = async (requestId: string) => {
    setReprocessing((p) => ({ ...p, [requestId]: true }))
    try {
      const res = await fetch('/api/block-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ block_request_id: requestId })
      })
      const json = await res.json()
      if (!res.ok || json.error) {
        toast.error(`Reprocessing failed: ${json.error ?? 'Unknown error'}`)
      } else {
        toast.success("Reprocessed successfully")
        await fetchRequests()
      }
    } catch (err) {
      toast.error("Reprocessing failed")
    } finally {
      setReprocessing((p) => ({ ...p, [requestId]: false }))
    }
  }

  const resetForm = () => {
    setSegmentId("")
    setDepartment("")
    setDefectType("")
    setSeverity("")
    setDueDate(formatDateOnly(new Date()))
    setWorkDescription("")
    setJustification("")
    setRequestedStart(toDateTimeLocal(new Date()))
    setRequestedDurationMins("")
    setRequestBlock(true)
    setErrors({})
  }

  const triggerAIScoring = async (blockRequestId: string) => {
    try {
      const res = await fetch('/api/block-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ block_request_id: blockRequestId })
      })
      const json = await res.json()
      if (!res.ok || json.error) {
        toast.error(`AI processing failed: ${json.error ?? 'Unknown error'}`)
      } else {
        toast.success("AI scoring complete!")
      }
    } catch (err) {
      toast.success("Block request submitted. AI scoring may be pending.")
    }
  }

  const createBlockRequestFromDefect = async (defect: Defect) => {
    if (!user) {
      toast.error("User not loaded. Please refresh the page.")
      return
    }

    const supabase = createClient()
    const { data: blockReqData, error: blockReqError } = await supabase
      .from("block_requests")
      .insert({
        segment_id: defect.segment_id,
        work_type: "other",
        work_description: defect.work_description ?? defect.asset_description ?? "",
        justification:
          defect.justification ??
          `Defect: ${DEFECT_TYPE_LABELS[defect.defect_type] ?? defect.defect_type}, severity: ${defect.severity}, due ${defect.due_date}`,
        requested_start: defect.requested_start
          ? defect.requested_start
          : `${toDateTimeLocal(new Date())}:00`,
        requested_duration_mins: defect.requested_duration_mins ?? 60,
        safety_criticality: severityToSafetyCriticality(defect.severity),
        department: defect.department ?? null,
        status: "submitted",
        requested_by: user.id,
      })
      .select()
      .single()

    if (blockReqError) {
      toast.error(`Failed to create block request: ${blockReqError.message}`)
      return
    }

    await supabase
      .from("defects")
      .update({
        linked_block_request_id: blockReqData.id,
        status: "block_requested",
      })
      .eq("id", defect.id)

    await triggerAIScoring(blockReqData.id)
    await fetchDefects()
    await fetchRequests()
  }

  const validateForm = () => {
    const newErrors: Record<string, string> = {}
    if (!segmentId) newErrors.segment = "Please select a segment"
    if (!department) newErrors.department = "Please select a department"
    if (!defectType) newErrors.defectType = "Please select a defect type"
    if (!severity) newErrors.severity = "Please select a severity"
    if (!dueDate) newErrors.dueDate = "Please select a due date"
    if (!workDescription || workDescription.length < 10)
      newErrors.workDescription =
        "Work description must be at least 10 characters"
    if (!justification || justification.length < 10)
      newErrors.justification =
        "Justification must be at least 10 characters"
    if (!requestedStart)
      newErrors.requestedStart = "Please select a date and time"
    if (!requestedDurationMins || Number(requestedDurationMins) <= 0)
      newErrors.requestedDurationMins = "Please enter a valid duration"
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const isFormValid = () => {
    return Boolean(
      user &&
        !loading &&
        segmentId &&
        department &&
        defectType &&
        severity &&
        dueDate &&
        workDescription.length >= 10 &&
        justification.length >= 10 &&
        requestedStart &&
        requestedDurationMins &&
        Number(requestedDurationMins) > 0,
    )
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

    const defectInsertPayload = {
      segment_id: Number(segmentId),
      department,
      work_description: workDescription,
      defect_type: defectType,
      severity,
      due_date: dueDate,
      requested_start: `${requestedStart}:00`,
      requested_duration_mins: Number(requestedDurationMins),
      status: "open",
      created_by: user.id,
    }

    const { data: defectData, error: defectError } = await supabase
      .from("defects")
      .insert(defectInsertPayload)
      .select()
      .single()

    if (defectError) {
      toast.error(`Failed to log defect: ${defectError.message}`)
      setIsSubmitting(false)
      return
    }

    if (requestBlock && defectData?.id) {
      const { data: blockReqData, error: blockReqError } = await supabase
        .from("block_requests")
        .insert({
          segment_id: Number(segmentId),
          work_type: "other",
          work_description: workDescription,
          justification,
          requested_start: `${requestedStart}:00`,
          requested_duration_mins: Number(requestedDurationMins),
          safety_criticality: severityToSafetyCriticality(severity),
          department,
          status: "submitted",
          requested_by: user.id,
        })
        .select()
        .single()

      if (blockReqError) {
        toast.error(
          `Defect logged but failed to create block request: ${blockReqError.message}`,
        )
        setIsSubmitting(false)
        await fetchDefects()
        return
      }

      await supabase
        .from("defects")
        .update({
          linked_block_request_id: blockReqData.id,
          status: "block_requested",
        })
        .eq("id", defectData.id)

      await triggerAIScoring(blockReqData.id)
      await fetchRequests()
    } else {
      toast.success("Defect logged successfully")
    }

    resetForm()
    setIsSubmitting(false)
    await fetchDefects()
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
          Log defects and request track blocks for maintenance work. All requests
          are routed to AI scoring and approval.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Log Defect &amp; Request Block</CardTitle>
          <CardDescription>
            Record a defect and optionally request a track block in a single
            action. The defect is always saved; the block request is created
            only if the checkbox below is checked.
          </CardDescription>
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
                htmlFor="department"
                className="text-sm font-medium leading-none"
              >
                Department
              </label>
              <Select
                value={department}
                onValueChange={setDepartment}
                disabled={loading}
              >
                <SelectTrigger id="department">
                  <SelectValue placeholder="Select a department" />
                </SelectTrigger>
                <SelectContent>
                  {DEPARTMENT_OPTIONS.map((opt) => (
                    <SelectItem key={opt} value={opt}>
                      {opt}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.department && (
                <p
                  className="text-xs text-destructive"
                  id="department-error"
                >
                  {errors.department}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <label
                htmlFor="defect-type"
                className="text-sm font-medium leading-none"
              >
                Defect Type
              </label>
              <Select
                value={defectType}
                onValueChange={setDefectType}
                disabled={loading}
              >
                <SelectTrigger id="defect-type">
                  <SelectValue placeholder="Select a defect type" />
                </SelectTrigger>
                <SelectContent>
                  {DEFECT_TYPE_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.defectType && (
                <p
                  className="text-xs text-destructive"
                  id="defect-type-error"
                >
                  {errors.defectType}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <label
                htmlFor="severity"
                className="text-sm font-medium leading-none"
              >
                Severity
              </label>
              <Select
                value={severity}
                onValueChange={setSeverity}
                disabled={loading}
              >
                <SelectTrigger id="severity">
                  <SelectValue placeholder="Select a severity" />
                </SelectTrigger>
                <SelectContent>
                  {SEVERITY_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.severity && (
                <p
                  className="text-xs text-destructive"
                  id="severity-error"
                >
                  {errors.severity}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <label
                htmlFor="due-date"
                className="text-sm font-medium leading-none"
              >
                Due Date
              </label>
              <Input
                id="due-date"
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                disabled={loading}
                required
              />
              {errors.dueDate && (
                <p
                  className="text-xs text-destructive"
                  id="due-date-error"
                >
                  {errors.dueDate}
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
                htmlFor="requested-duration-mins"
                className="text-sm font-medium leading-none"
              >
                Duration (minutes)
              </label>
              <Input
                id="requested-duration-mins"
                type="number"
                min="1"
                placeholder="e.g. 60"
                value={requestedDurationMins}
                onChange={(e) => setRequestedDurationMins(e.target.value)}
                disabled={loading}
              />
              {errors.requestedDurationMins && (
                <p
                  className="text-xs text-destructive"
                  id="requested-duration-mins-error"
                >
                  {errors.requestedDurationMins}
                </p>
              )}
            </div>

            <div className="space-y-2 md:col-span-2">
              <label
                htmlFor="work-description"
                className="text-sm font-medium leading-none"
              >
                Work Description
              </label>
              <Textarea
                id="work-description"
                placeholder="Describe the defect or maintenance work to be performed"
                value={workDescription}
                onChange={(e) => setWorkDescription(e.target.value)}
                disabled={loading}
                minLength={10}
                required
              />
              {errors.workDescription && (
                <p
                  className="text-xs text-destructive"
                  id="work-description-error"
                >
                  {errors.workDescription}
                </p>
              )}
            </div>

            <div className="space-y-2 md:col-span-2">
              <label
                htmlFor="justification"
                className="text-sm font-medium leading-none"
              >
                Justification
              </label>
              <Textarea
                id="justification"
                placeholder="Why is this work needed now?"
                value={justification}
                onChange={(e) => setJustification(e.target.value)}
                disabled={loading}
                minLength={10}
                required
              />
              {errors.justification && (
                <p
                  className="text-xs text-destructive"
                  id="justification-error"
                >
                  {errors.justification}
                </p>
              )}
            </div>

            <div className="flex items-end md:col-span-2">
              <label className="flex items-center gap-2 text-sm">
                <input
                  id="request-block"
                  type="checkbox"
                  checked={requestBlock}
                  onChange={(e) => setRequestBlock(e.target.checked)}
                  disabled={loading}
                  className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary dark:border-gray-600 dark:bg-gray-800"
                />
                <span className="font-medium leading-none">
                  Request a block for this now
                </span>
              </label>
            </div>

            <div className="md:col-span-2 flex justify-end">
              <Button
                type="submit"
                disabled={!isFormValid() || isSubmitting}
              >
                {isSubmitting ? "Submitting..." : "Submit"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>All Defects</CardTitle>
          <CardDescription>
            {defects.length} defect{defects.length !== 1 ? "s" : ""} tracked.
            Defects with a linked block request show the AI priority score once
            scored.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : defects.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <ClipboardList className="h-12 w-12 text-muted-foreground/50 mb-4" />
              <h3 className="text-lg font-medium">No defects logged</h3>
              <p className="text-sm text-muted-foreground mt-2 max-w-sm">
                Log a defect using the form above and it will appear here.
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Segment</TableHead>
                  <TableHead>Department</TableHead>
                  <TableHead>Work Description</TableHead>
                  <TableHead>Defect Type</TableHead>
                  <TableHead>Severity</TableHead>
                  <TableHead>Due Date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Block Priority</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {defects.map((defect) => {
                  const statusBadge = getDefectStatusBadge(defect.status)
                  const linkedBR = defect.linked_block_request_id
                    ? blockRequestScores[defect.linked_block_request_id]
                    : undefined
                  return (
                    <TableRow key={defect.id}>
                      <TableCell>
                        {getSegmentName(defect.segment_id, segments)}
                      </TableCell>
                      <TableCell>{defect.department ?? "—"}</TableCell>
                      <TableCell>
                        <div
                          className="max-w-xs truncate"
                          title={
                            defect.work_description ??
                            defect.asset_description ??
                            undefined
                          }
                        >
                          {defect.work_description ??
                            defect.asset_description ??
                            "—"}
                        </div>
                      </TableCell>
                      <TableCell>
                        {DEFECT_TYPE_LABELS[defect.defect_type] ??
                          defect.defect_type}
                      </TableCell>
                      <TableCell>
                        <Badge
                          className={
                            SEVERITY_BADGE[defect.severity] ??
                            "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200"
                          }
                        >
                          {SEVERITY_LABELS[defect.severity] ?? defect.severity}
                        </Badge>
                      </TableCell>
                      <TableCell>{formatDate(defect.due_date)}</TableCell>
                      <TableCell>
                        <Badge className={statusBadge.className}>
                          {statusBadge.label}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {linkedBR &&
                        linkedBR.status === "scored" &&
                        linkedBR.priority_score !== null ? (
                          <span className="text-sm font-medium">
                            {linkedBR.priority_score.toFixed(1)}
                          </span>
                        ) : linkedBR ? (
                          <span className="text-xs text-muted-foreground">
                            {linkedBR.status === "submitted"
                              ? "AI Processing..."
                              : linkedBR.status}
                          </span>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                      <TableCell>
                        {defect.status === "open" && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => createBlockRequestFromDefect(defect)}
                            disabled={isSubmitting || loading}
                          >
                            Request Block Now
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {selectedRequestId && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>AI Plan Options</CardTitle>
              <CardDescription>
                Generated for request:{" "}
                <strong>
                  {requests.find((r) => r.id === selectedRequestId)?.work_type}
                </strong>{" "}
                on{" "}
                <strong>
                  {getSegmentName(
                    requests.find((r) => r.id === selectedRequestId)?.segment_id,
                    segments,
                  )}
                </strong>
              </CardDescription>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSelectedRequestId(null)}
            >
              Clear Selection
            </Button>
          </CardHeader>
          <CardContent>
            {planOptions[selectedRequestId]?.length ? (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {planOptions[selectedRequestId].map((opt) => (
                  <div
                    key={opt.id}
                    className={`rounded-lg border p-4 space-y-3 ${
                      opt.is_recommended
                        ? "border-2 border-[#960DF2] bg-[#960DF2]/5"
                        : ""
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-semibold">
                        {opt.option_label}
                      </span>
                      {opt.is_recommended && (
                        <Badge className="bg-[#960DF2] hover:bg-[#960DF2] text-white text-xs">
                          Recommended
                        </Badge>
                      )}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      <span>{formatDateTime(opt.adjusted_start)}</span> ·{" "}
                      {opt.adjusted_duration_mins ?? 0} min
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-lg font-bold text-primary">
                        {opt.priority_score != null
                          ? Math.round(opt.priority_score)
                          : "—"}
                      </span>
                      {opt.delay_risk && (
                        <Badge variant="outline">
                          {opt.delay_risk}
                        </Badge>
                      )}
                    </div>
                    {opt.explanation && (
                      <p className="text-sm text-muted-foreground">
                        {opt.explanation}
                      </p>
                    )}
                    {opt.is_recommended && opt.what_if_note && (
                      <p className="text-sm italic text-muted-foreground border-t pt-2 mt-2">
                        {opt.what_if_note}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <p className="font-medium">No plan options yet</p>
                <p className="text-sm mt-1">
                  AI processing may still be running. Click "Reprocess" in the
                  table if stuck.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

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
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredRequests.map((request, index) => {
                      const badge = getStatusBadge(request.status)
                      const isSelected = selectedRequestId === request.id
                      const canSelect = request.status === "scored"
                      return (
                        <TableRow
                          key={request.id}
                          className={`animate-fade-in ${
                            canSelect
                              ? "cursor-pointer hover:bg-muted/50"
                              : ""
                          } ${isSelected ? "bg-primary/5" : ""}`}
                          style={{
                            animationDelay: `${Math.min(index * 40, 400)}ms`,
                          }}
                          onClick={
                            canSelect
                              ? () => setSelectedRequestId(request.id)
                              : undefined
                          }
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
                            {request.status === "submitted" ? (
                              <Badge className={`${badge.className} animate-pulse`}>
                                AI Processing...
                              </Badge>
                            ) : request.status === "scored" ? (
                              <div className="flex items-center gap-2">
                                <Badge className={badge.className}>
                                  {badge.label}
                                </Badge>
                                <span className="text-sm font-medium">
                                  {request.priority_score !== null
                                    ? request.priority_score.toFixed(1)
                                    : "N/A"}
                                </span>
                                <a
                                  href="/dashboard/ai"
                                  className="text-xs font-medium text-blue-600 hover:underline dark:text-blue-400"
                                >
                                  View AI Plan
                                </a>
                              </div>
                            ) : (
                              <Badge className={badge.className}>
                                {badge.label}
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            {request.priority_score !== null
                              ? request.priority_score.toFixed(1)
                              : "Pending AI review"}
                          </TableCell>
                          <TableCell>
                            {request.status === "submitted" && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  handleReprocess(request.id)
                                }}
                                disabled={reprocessing[request.id]}
                              >
                                {reprocessing[request.id] ? (
                                  <>
                                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                                    Processing...
                                  </>
                                ) : (
                                  "Reprocess"
                                )}
                              </Button>
                            )}
                            {request.status === "scored" && (
                              <span className="text-xs text-muted-foreground">
                                Click row for plan options
                              </span>
                            )}
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
