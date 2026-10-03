"use client"

import { useEffect, useMemo, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
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
import { EmptyState } from "@/components/ui/EmptyState"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { toast } from "sonner"
import { useCorridor } from "@/context/CorridorContext"
import {
  Bug,
  Building2,
  Calendar,
  CheckCircle2,
  ClipboardList,
  Download,
  Eye,
  HelpCircle,
  History,
  Layers,
  MapPin,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Signal,
  Wrench,
  Zap,
} from "lucide-react"
import { DashboardPageHeader } from "@/components/dashboard-page-header"
import { downloadDefectsPdf, type DefectPdfRow } from "@/lib/defects-pdf"
import type { BlockRequest, Segment, PlanOption, Defect } from "@/lib/types"
import {
  CORRIDORS,
  getSegmentDisplayName,
  getSegmentsForCorridor,
} from "@/lib/corridors"


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

const STATUS_CONFIG: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" | "success" | "warning" }> = {
  submitted: { label: "Submitted", variant: "secondary" },
  scored: { label: "Scored", variant: "default" },
  approved: { label: "Approved", variant: "success" },
  executed: { label: "Executed", variant: "default" },
  rejected: { label: "Rejected", variant: "destructive" },
  safety_blocked: { label: "Safety Blocked", variant: "destructive" },
}

const DEFECT_STATUS_CONFIG: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" | "success" | "warning" }> = {
  open: { label: "Open", variant: "secondary" },
  block_requested: { label: "Block Requested", variant: "default" },
  in_progress: { label: "In Progress", variant: "warning" },
  resolved: { label: "Resolved", variant: "success" },
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

const DEFECT_TYPE_ICONS: Record<string, React.ReactNode> = {
  rail_crack: <Bug className="h-4 w-4" />,
  signal_fault: <Signal className="h-4 w-4" />,
  ohe_wear: <Zap className="h-4 w-4" />,
  track_geometry: <Layers className="h-4 w-4" />,
  other: <HelpCircle className="h-4 w-4" />,
}

const SEVERITY_LABELS: Record<string, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  critical: "Critical",
}

const SEVERITY_PILL: Record<string, string> = {
  low: "bg-[#7009c6]/15 text-[#7009c6]",
  medium: "bg-[#7009c6] text-white",
  high: "bg-orange-500 text-white",
  critical: "bg-red-500 text-white",
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
): { label: string; variant: "default" | "secondary" | "destructive" | "outline" | "success" | "warning" } {
  return (
    STATUS_CONFIG[status] ?? {
      label: status.charAt(0).toUpperCase() + status.slice(1),
      variant: "secondary",
    }
  )
}

function getDefectStatusBadge(
  status: string,
): { label: string; variant: "default" | "secondary" | "destructive" | "outline" | "success" | "warning" } {
  return (
    DEFECT_STATUS_CONFIG[status] ?? {
      label: status.charAt(0).toUpperCase() + status.slice(1),
      variant: "secondary",
    }
  )
}

function getSegmentName(
  id: number | null | undefined,
  segments: SegmentOption[],
): string {
  if (id == null) return "—"
  const seg = segments.find((s) => s.id === id)
  return seg ? seg.displayName : getSegmentDisplayName(id)
}

function isOverdue(defect: Defect): boolean {
  if (!defect.due_date) return false
  try {
    const due = new Date(defect.due_date)
    if (isNaN(due.getTime())) return false
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const compare = new Date(due)
    compare.setHours(0, 0, 0, 0)
    return compare < today && defect.status !== "resolved"
  } catch {
    return false
  }
}

export default function MaintenancePage() {
  const { selectedCorridorId } = useCorridor()
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
  const [exportingPdf, setExportingPdf] = useState(false)

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

  const availableSegments = useMemo(() => {
    const corridorSegments = getSegmentsForCorridor(selectedCorridorId)
    if (segments.length > 0) {
      const filtered =
        selectedCorridorId != null
          ? segments.filter((s) => s.corridor_id === Number(selectedCorridorId))
          : segments
      if (filtered.length > 0) {
        return filtered.map((seg) => ({
          ...seg,
          displayName: getSegmentDisplayName(seg.id, seg.displayName),
        }))
      }
    }
    return corridorSegments.map((s) => ({
      id: s.id,
      name: s.displayName,
      from_station_id: s.id,
      to_station_id: s.id + 1,
      corridor_id: s.corridorId,
      displayName: s.displayName,
    }))
  }, [segments, selectedCorridorId])

  useEffect(() => {
    if (segmentId && !availableSegments.some((s) => String(s.id) === segmentId)) {
      setSegmentId("")
    }
  }, [availableSegments, segmentId])

  useEffect(() => {
    const fetchData = async () => {
      const supabase = createClient()

      setLoading(true)

      const { data: { user: currentUser } } =
        await supabase.auth.getUser()

      let segmentsQuery = supabase
        .from("segments")
        .select("id, name, from_station_id, to_station_id, corridor_id")
        .order("name")

      if (selectedCorridorId != null) {
        segmentsQuery = segmentsQuery.eq("corridor_id", selectedCorridorId)
      }

      const [segmentsRes, stationsRes] = await Promise.all([
        segmentsQuery,
        supabase.from("stations").select("id, name"),
      ])

      let corridorSegmentIds: number[] = []

      if (segmentsRes.data && stationsRes.data) {
        const stationMap = new Map(stationsRes.data.map((s) => [s.id, s.name]))
        const segmentsWithOptions: SegmentOption[] = segmentsRes.data.map(
          (seg) => ({
            ...seg,
            displayName: getSegmentDisplayName(
              seg.id,
              `${stationMap.get(seg.from_station_id) ?? seg.from_station_id} → ${stationMap.get(seg.to_station_id) ?? seg.to_station_id}`,
            ),
          }),
        )
        setSegments(segmentsWithOptions)
        corridorSegmentIds = segmentsWithOptions.map((s) => s.id)
      } else {
        const fallback = getSegmentsForCorridor(selectedCorridorId).map((s) => ({
          id: s.id,
          name: s.displayName,
          from_station_id: s.id,
          to_station_id: s.id + 1,
          corridor_id: s.corridorId,
          displayName: s.displayName,
        }))
        setSegments(fallback)
        corridorSegmentIds = fallback.map((s) => s.id)
      }

      if (currentUser) {
        setUser({ id: currentUser.id, email: currentUser.email })

        let requestsQuery = supabase
          .from("block_requests")
          .select("*")
          .eq("requested_by", currentUser.id)
          .order("created_at", { ascending: false })

        if (selectedCorridorId != null) {
          requestsQuery = requestsQuery.in("segment_id", corridorSegmentIds)
        }

        const { data: requestsData, error: requestsError } =
          await requestsQuery

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

      await fetchDefects(corridorSegmentIds)
      setSelectedRequestId(null)
      setLoading(false)
    }

    fetchData()
  }, [selectedCorridorId]) // eslint-disable-line react-hooks/exhaustive-deps

  const fetchDefects = async (segmentIds: number[] = segments.map((s) => s.id)) => {
    const supabase = createClient()
    let query = supabase
      .from("defects")
      .select("*")
      .order("due_date", { ascending: true })

    if (selectedCorridorId != null) {
      query = query.in("segment_id", segmentIds)
    }

    const { data, error } = await query
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

  const fetchRequests = async (segmentIds: number[] = segments.map((s) => s.id)) => {
    if (!user) return
    const supabase = createClient()
    let query = supabase
      .from("block_requests")
      .select("*")
      .eq("requested_by", user.id)
      .order("created_at", { ascending: false })

    if (selectedCorridorId != null) {
      query = query.in("segment_id", segmentIds)
    }

    const { data, error } = await query
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
    } catch {
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
    } catch {
      toast.success("Block request submitted. AI scoring may be pending.")
    }
  }

  const createBlockRequestFromDefect = async (defect: Defect) => {
    if (!user) {
      toast.error("User not loaded. Please refresh the page.")
      return
    }

    const workDescriptionFromDefect =
      defect.work_description ?? defect.asset_description ?? ""
    if (!workDescriptionFromDefect || workDescriptionFromDefect.trim() === "") {
      toast.error(
        "Cannot request a block: the defect has no work description. Please add a description first.",
      )
      return
    }

    const supabase = createClient()
    const { data: blockReqData, error: blockReqError } = await supabase
      .from("block_requests")
      .insert({
        segment_id: defect.segment_id,
        work_type: "other",
        work_description: workDescriptionFromDefect,
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
      console.error("Failed to create block request from defect:", blockReqError)
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

    const { data: defectData, error: defectError } = await supabase
      .from("defects")
      .insert({
        segment_id: Number(segmentId),
        department,
        defect_type: defectType,
        severity,
        due_date: dueDate,
        status: "open",
        created_by: user.id,
      })
      .select()
      .single()

    if (defectError) {
      console.error("Failed to insert defect:", defectError)
      toast.error(`Failed to log defect: ${defectError.message}`)
      setIsSubmitting(false)
      return
    }

    if (requestBlock) {
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
        console.error("Failed to insert block request:", blockReqError)
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
      toast.success("Defect and block request created")
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

  const handleExportPdf = async () => {
    if (defects.length === 0 || exportingPdf) return

    setExportingPdf(true)
    try {
      const rows: DefectPdfRow[] = defects.map((defect) => {
        const linkedBR = defect.linked_block_request_id
          ? blockRequestScores[defect.linked_block_request_id]
          : undefined

        let score = "—"
        if (linkedBR) {
          if (linkedBR.status === "scored" && linkedBR.priority_score !== null) {
            score = linkedBR.priority_score.toFixed(1)
          } else if (linkedBR.status === "submitted") {
            score = "AI Processing"
          } else {
            score = linkedBR.status
          }
        } else {
          score = "No block"
        }

        return {
          defectType:
            DEFECT_TYPE_LABELS[defect.defect_type] ?? defect.defect_type,
          severity: SEVERITY_LABELS[defect.severity] ?? defect.severity,
          status: getDefectStatusBadge(defect.status).label,
          description:
            defect.work_description ?? defect.asset_description ?? "—",
          segment: getSegmentName(defect.segment_id, segments),
          department: defect.department ?? "—",
          dueDate: formatDate(defect.due_date),
          overdue: isOverdue(defect),
          score,
        }
      })

      await downloadDefectsPdf(rows, {
        generatedBy: user?.email ?? null,
        corridorLabel:
          selectedCorridorId != null
            ? `Corridor ${selectedCorridorId}`
            : "All corridors",
      })
      toast.success("Defect register exported to PDF")
    } catch (error) {
      console.error("Failed to export defect register:", error)
      toast.error("Failed to export defect register to PDF")
    } finally {
      setExportingPdf(false)
    }
  }

  const renderSafetyBadge = (criticality: string) => {
    const key = (criticality ?? "").toLowerCase().trim()
    let bgClass = "bg-purple-100"
    if (key === "safety_critical" || key === "safety critical") {
      bgClass = "bg-red-100"
    } else if (key === "urgent") {
      bgClass = "bg-orange-100"
    } else {
      bgClass = "bg-purple-100"
    }
    const label = safetyLabels[criticality] ?? criticality ?? "Routine"
    return (
      <span
        className={cn(
          "inline-flex items-center justify-center whitespace-nowrap px-2 py-1 rounded-full text-[11px] font-bold text-[#7009c6]",
          bgClass,
        )}
      >
        {label}
      </span>
    )
  }

  const renderStatusBadge = (request: BlockRequest) => {
    const status = (request.status ?? "").toLowerCase()
    const base =
      "inline-flex items-center justify-center whitespace-nowrap px-2 py-1 rounded-full text-[11px] font-bold"
    if (status === "approved") {
      return (
        <span className={cn(base, "bg-green-100 text-green-700")}>
          Approved
        </span>
      )
    }
    if (status === "submitted") {
      return (
        <span
          className={cn(
            base,
            "bg-purple-50 text-[#7009c6] border border-[#7009c6]/20 animate-pulse",
          )}
        >
          AI Processing...
        </span>
      )
    }
    if (status === "scored") {
      return (
        <span className={cn(base, "bg-[#7009c6]/10 text-[#7009c6]")}>
          Scored
        </span>
      )
    }
    if (status === "in_progress") {
      return (
        <span className={cn(base, "bg-yellow-100 text-yellow-700")}>
          In Progress
        </span>
      )
    }
    if (status === "executed") {
      return (
        <span className={cn(base, "bg-blue-100 text-blue-700")}>
          Executed
        </span>
      )
    }
    if (status === "rejected" || status === "safety_blocked") {
      return (
        <span className={cn(base, "bg-red-100 text-red-700")}>
          {status === "safety_blocked" ? "Safety Blocked" : "Rejected"}
        </span>
      )
    }
    const badge = getStatusBadge(request.status)
    return (
      <span className={cn(base, "bg-purple-50 text-[#7009c6]")}>
        {badge.label}
      </span>
    )
  }

  return (
    <div className="w-full m-0 p-3 bg-[#f5f0ff] dark:bg-slate-950">
      <DashboardPageHeader
        icon={Wrench}
        title="Maintenance"
        description="Log defects and request track blocks for maintenance work. All requests are routed to AI scoring and approval."
        userName={user?.email?.split("@")[0] || "User"}
      />

      <Tabs defaultValue="log" className="w-full space-y-2 bg-transparent">
        <TabsList className="bg-[#f5f0ff] dark:bg-slate-900 border border-transparent dark:border-slate-800">
          <TabsTrigger value="log" data-tour="combined-form-tab">
            <Plus className="h-4 w-4 mr-2" />
            Log Defect / Request
          </TabsTrigger>
          <TabsTrigger value="register" data-tour="defect-register-tab">
            <ClipboardList className="h-4 w-4 mr-2" />
            Defect Register
          </TabsTrigger>
          <TabsTrigger value="requests" data-tour="my-requests-tab">
            <History className="h-4 w-4 mr-2" />
            My Requests
          </TabsTrigger>
        </TabsList>

        <TabsContent value="log" className="w-full m-0 mb-0 p-0 bg-transparent">
          <div
            data-tour="combined-form"
            className="w-full m-0 bg-white dark:bg-slate-900 rounded-[16px] border border-[#7009c6]/20 dark:border-slate-800 dark:text-slate-100 shadow-md p-4 space-y-3"
          >
            <div className="space-y-0.5">
              <h2 className="text-base font-bold tracking-tight text-slate-900 dark:text-slate-100">
                Log Defect &amp; Request Block
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Record a defect and optionally request a track block in a single
                action. The defect is always saved; the block request is created
                only if the checkbox below is checked.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="w-full space-y-3">
              {/* Row 1: Segment + Department in grid-cols-2 gap-3 */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 w-full">
                <div className="w-full">
                  <label
                    htmlFor="segment"
                    className="text-xs font-bold text-black dark:text-slate-200 leading-none mb-1 block"
                  >
                    Segment
                  </label>
                  <Select
                    value={segmentId}
                    onValueChange={setSegmentId}
                    disabled={loading}
                  >
                    <SelectTrigger
                      id="segment"
                      className="h-9 rounded-[10px] border-[#7009c6]/20 dark:border-slate-700 focus:border-[#7009c6] focus:ring-1 focus:ring-[#7009c6] bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 dark:placeholder-slate-500 text-xs w-full"
                    >
                      <SelectValue
                        placeholder={
                          loading
                            ? "Loading segments..."
                            : "Select a segment"
                        }
                      />
                    </SelectTrigger>
                    <SelectContent className="bg-white dark:bg-slate-800 border-[#7009c6]/20 dark:border-slate-700 rounded-xl shadow-lg dark:text-slate-100">
                      {availableSegments.map((seg) => (
                        <SelectItem key={seg.id} value={String(seg.id)}>
                          {seg.displayName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {errors.segment && (
                    <p
                      className="text-xs text-destructive mt-0.5"
                      id="segment-error"
                    >
                      {errors.segment}
                    </p>
                  )}
                </div>

                <div className="w-full">
                  <label
                    htmlFor="department"
                    className="text-xs font-bold text-black dark:text-slate-200 leading-none mb-1 block"
                  >
                    Department
                  </label>
                  <Select
                    value={department}
                    onValueChange={setDepartment}
                    disabled={loading}
                  >
                    <SelectTrigger
                      id="department"
                      className="h-9 rounded-[10px] border-[#7009c6]/20 dark:border-slate-700 focus:border-[#7009c6] focus:ring-1 focus:ring-[#7009c6] bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 dark:placeholder-slate-500 text-xs w-full"
                    >
                      <SelectValue placeholder="Select a department" />
                    </SelectTrigger>
                    <SelectContent className="bg-white dark:bg-slate-800 border-[#7009c6]/20 dark:border-slate-700 rounded-xl shadow-lg dark:text-slate-100">
                      {DEPARTMENT_OPTIONS.map((opt) => (
                        <SelectItem key={opt} value={opt}>
                          {opt}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {errors.department && (
                    <p
                      className="text-xs text-destructive mt-0.5"
                      id="department-error"
                    >
                      {errors.department}
                    </p>
                  )}
                </div>
              </div>

              {/* Row 2: Defect Type + Severity in grid-cols-2 gap-3 */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 w-full">
                <div className="w-full">
                  <label
                    htmlFor="defect-type"
                    className="text-xs font-bold text-black dark:text-slate-200 leading-none mb-1 block"
                  >
                    Defect Type
                  </label>
                  <Select
                    value={defectType}
                    onValueChange={setDefectType}
                    disabled={loading}
                  >
                    <SelectTrigger
                      id="defect-type"
                      className="h-9 rounded-[10px] border-[#7009c6]/20 dark:border-slate-700 focus:border-[#7009c6] focus:ring-1 focus:ring-[#7009c6] bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 dark:placeholder-slate-500 text-xs w-full"
                    >
                      <SelectValue placeholder="Select a defect type" />
                    </SelectTrigger>
                    <SelectContent className="bg-white dark:bg-slate-800 border-[#7009c6]/20 dark:border-slate-700 rounded-xl shadow-lg dark:text-slate-100">
                      {DEFECT_TYPE_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {errors.defectType && (
                    <p
                      className="text-xs text-destructive mt-0.5"
                      id="defect-type-error"
                    >
                      {errors.defectType}
                    </p>
                  )}
                </div>

                <div className="w-full">
                  <label
                    htmlFor="severity"
                    className="text-xs font-bold text-black dark:text-slate-200 leading-none mb-1 block"
                  >
                    Severity
                  </label>
                  <Select
                    value={severity}
                    onValueChange={setSeverity}
                    disabled={loading}
                  >
                    <SelectTrigger
                      id="severity"
                      className="h-9 rounded-[10px] border-[#7009c6]/20 dark:border-slate-700 focus:border-[#7009c6] focus:ring-1 focus:ring-[#7009c6] bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 dark:placeholder-slate-500 text-xs w-full"
                    >
                      <SelectValue placeholder="Select a severity" />
                    </SelectTrigger>
                    <SelectContent className="bg-white dark:bg-slate-800 border-[#7009c6]/20 dark:border-slate-700 rounded-xl shadow-lg dark:text-slate-100">
                      {SEVERITY_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {errors.severity && (
                    <p
                      className="text-xs text-destructive mt-0.5"
                      id="severity-error"
                    >
                      {errors.severity}
                    </p>
                  )}
                </div>
              </div>

              {/* Row 3: Due Date + Requested Start + Duration in grid-cols-3 gap-3 */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 w-full">
                <div className="w-full">
                  <label
                    htmlFor="due-date"
                    className="text-xs font-bold text-black dark:text-slate-200 leading-none mb-1 block"
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
                    className="h-9 rounded-[10px] border-[#7009c6]/20 dark:border-slate-700 focus:border-[#7009c6] focus-visible:ring-1 focus-visible:ring-[#7009c6] bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 dark:placeholder-slate-500 text-xs w-full"
                  />
                  {errors.dueDate && (
                    <p
                      className="text-xs text-destructive mt-0.5"
                      id="due-date-error"
                    >
                      {errors.dueDate}
                    </p>
                  )}
                </div>

                <div className="w-full">
                  <label
                    htmlFor="requested-start"
                    className="text-xs font-bold text-black dark:text-slate-200 leading-none mb-1 block"
                  >
                    Requested Start
                  </label>
                  <Input
                    id="requested-start"
                    type="datetime-local"
                    value={requestedStart}
                    onChange={(e) => setRequestedStart(e.target.value)}
                    disabled={loading}
                    className="h-9 rounded-[10px] border-[#7009c6]/20 dark:border-slate-700 focus:border-[#7009c6] focus-visible:ring-1 focus-visible:ring-[#7009c6] bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 dark:placeholder-slate-500 text-xs w-full"
                  />
                  {errors.requestedStart && (
                    <p
                      className="text-xs text-destructive mt-0.5"
                      id="requested-start-error"
                    >
                      {errors.requestedStart}
                    </p>
                  )}
                </div>

                <div className="w-full">
                  <label
                    htmlFor="requested-duration-mins"
                    className="text-xs font-bold text-black dark:text-slate-200 leading-none mb-1 block"
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
                    className="h-9 rounded-[10px] border-[#7009c6]/20 dark:border-slate-700 focus:border-[#7009c6] focus-visible:ring-1 focus-visible:ring-[#7009c6] bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 dark:placeholder-slate-500 text-xs w-full"
                  />
                  {errors.requestedDurationMins && (
                    <p
                      className="text-xs text-destructive mt-0.5"
                      id="requested-duration-mins-error"
                    >
                      {errors.requestedDurationMins}
                    </p>
                  )}
                </div>
              </div>

              {/* Work Description: textarea h-20 */}
              <div className="w-full">
                <label
                  htmlFor="work-description"
                  className="text-xs font-bold text-black dark:text-slate-200 leading-none mb-1 block"
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
                  className="h-20 min-h-[5rem] max-h-24 resize-none rounded-[10px] border-[#7009c6]/20 dark:border-slate-700 focus:border-[#7009c6] focus-visible:ring-1 focus-visible:ring-[#7009c6] bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 dark:placeholder-slate-500 placeholder:text-slate-400 dark:placeholder:text-slate-500 text-xs w-full"
                />
                {errors.workDescription && (
                  <p
                    className="text-xs text-destructive mt-0.5"
                    id="work-description-error"
                  >
                    {errors.workDescription}
                  </p>
                )}
              </div>

              {/* Justification: textarea h-20 */}
              <div className="w-full">
                <label
                  htmlFor="justification"
                  className="text-xs font-bold text-black dark:text-slate-200 leading-none mb-1 block"
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
                  className="h-20 min-h-[5rem] max-h-24 resize-none rounded-[10px] border-[#7009c6]/20 dark:border-slate-700 focus:border-[#7009c6] focus-visible:ring-1 focus-visible:ring-[#7009c6] bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 dark:placeholder-slate-500 placeholder:text-slate-400 dark:placeholder:text-slate-500 text-xs w-full"
                />
                {errors.justification && (
                  <p
                    className="text-xs text-destructive mt-0.5"
                    id="justification-error"
                  >
                    {errors.justification}
                  </p>
                )}
              </div>

              {/* Checkbox */}
              <div className="pt-0.5">
                <label className="flex items-center gap-2 text-xs text-black dark:text-slate-200 font-bold cursor-pointer select-none">
                  <input
                    id="request-block"
                    type="checkbox"
                    checked={requestBlock}
                    onChange={(e) => setRequestBlock(e.target.checked)}
                    disabled={loading}
                    className="h-4 w-4 rounded border-[#7009c6]/40 text-[#7009c6] focus:ring-[#7009c6] accent-[#7009c6]"
                  />
                  <span>Request a block for this now</span>
                </label>
              </div>

              {/* Submit button: bg-[#7009c6] w-full rounded-full */}
              <Button
                type="submit"
                disabled={!isFormValid() || isSubmitting}
                className="w-full bg-[#7009c6] hover:bg-[#7009c6]/90 text-white rounded-full h-10 font-medium text-sm shadow-sm transition-all"
              >
                {isSubmitting ? "Submitting..." : "Submit"}
              </Button>
            </form>
          </div>
        </TabsContent>

        <TabsContent value="register" className="space-y-3 m-0 mb-0 p-0 bg-transparent">
          <div className="w-full h-auto bg-[#f5f0ff] dark:bg-slate-900 rounded-[16px] border border-[#7009c6]/20 dark:border-slate-800 shadow-sm p-3">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div>
                <h2 className="text-base font-bold tracking-tight text-[#7009c6]">
                  Defect Register
                </h2>
                <p className="text-xs text-slate-500">
                  {defects.length} defect{defects.length !== 1 ? "s" : ""} tracked.
                  Defects with a linked block request show the AI priority score
                  once scored.
                </p>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={handleExportPdf}
                disabled={loading || exportingPdf || defects.length === 0}
                className="rounded-full border-[#7009c6]/30 text-[#7009c6] hover:bg-[#7009c6]/10 bg-white"
              >
                <Download className="h-4 w-4 mr-2" />
                {exportingPdf ? "Exporting..." : "Download PDF"}
              </Button>
            </div>

            <div className="mt-3">
              {loading ? (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <Skeleton key={i} className="h-36 w-full" />
                  ))}
                </div>
              ) : defects.length === 0 ? (
                <EmptyState
                  illustrationSrc="maintenance-all-clear.svg"
                  illustrationAlt="All clear - no defects"
                  title="No defects reported"
                  context="no-requests"
                  hasAnyData={false}
                />
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {defects.map((defect) => {
                    const statusBadge = getDefectStatusBadge(defect.status)
                    const linkedBR = defect.linked_block_request_id
                      ? blockRequestScores[defect.linked_block_request_id]
                      : undefined
                    const overdue = isOverdue(defect)
                    return (
                      <div
                        key={defect.id}
                        className="flex flex-col bg-white rounded-[16px] border border-[#7009c6]/30 p-3 shadow-sm hover:shadow-md transition-shadow"
                      >
                        {/* Card header: icon + name + badges (wrapping, no overlap) */}
                        <div className="flex flex-row flex-wrap gap-2 items-center">
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#7009c6]/15 text-[#7009c6]">
                            {DEFECT_TYPE_ICONS[defect.defect_type] ?? (
                              <HelpCircle className="h-4 w-4" />
                            )}
                          </span>
                          <span className="text-black font-bold text-[14px] leading-5 overflow-visible">
                            {DEFECT_TYPE_LABELS[defect.defect_type] ??
                              defect.defect_type}
                          </span>
                          <span
                            className={cn(
                              "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold min-w-fit whitespace-nowrap",
                              SEVERITY_PILL[defect.severity] ??
                                "bg-[#7009c6]/15 text-[#7009c6]",
                            )}
                          >
                            {SEVERITY_LABELS[defect.severity] ?? defect.severity}
                          </span>
                          {defect.status !== "open" && (
                            <span className="inline-flex items-center rounded-full bg-[#7009c6] px-2.5 py-0.5 text-[10px] font-bold text-white whitespace-nowrap ml-1">
                              {statusBadge.label}
                            </span>
                          )}
                        </div>

                        {/* Card inner content */}
                        <div className="flex flex-col gap-1.5 pt-2">
                          <div className="flex items-center gap-2">
                            <MapPin className="h-3.5 w-3.5 shrink-0 text-[#7009c6]" />
                            <span className="text-black font-bold text-[12px] leading-5 overflow-visible">
                              {getSegmentName(defect.segment_id, segments)}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Calendar className="h-3.5 w-3.5 shrink-0 text-[#7009c6]" />
                            <span className="text-black font-bold text-[12px] leading-5 overflow-visible">Due {formatDate(defect.due_date)}</span>
                            {overdue && (
                              <Badge
                                variant="destructive"
                                className="rounded-full text-[10px] font-bold leading-none"
                              >
                                Overdue
                              </Badge>
                            )}
                          </div>
                          {linkedBR && (
                            <div className="flex items-center gap-2">
                              <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-[#7009c6]" />
                              <span className="text-black font-bold text-[12px] leading-5 overflow-visible">
                                {linkedBR.status === "submitted"
                                  ? "AI Processing"
                                  : linkedBR.status.charAt(0).toUpperCase() +
                                    linkedBR.status.slice(1)}
                              </span>
                            </div>
                          )}
                          {defect.department && (
                            <div className="flex items-center gap-2">
                              <Building2 className="h-3.5 w-3.5 shrink-0 text-[#7009c6]" />
                              <span className="text-black font-bold text-[12px] leading-5 overflow-visible">{defect.department}</span>
                            </div>
                          )}
                        </div>

                        {defect.status === "open" && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => createBlockRequestFromDefect(defect)}
                            disabled={isSubmitting || loading}
                            className="mt-2.5 h-8 w-full rounded-full border-[#7009c6]/30 bg-white text-xs font-medium text-[#7009c6] hover:bg-[#7009c6]/10"
                          >
                            Request Block Now
                          </Button>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="requests" className="space-y-6 m-0 mb-0 p-0 bg-transparent">
          {selectedRequestId && (
            <div className="!bg-[#f5f0ff] rounded-[24px] shadow-sm border border-[#7009c6]/20 p-6 space-y-4">
              <div className="flex flex-row items-center justify-between pb-3 border-b border-[#7009c6]/10">
                <div>
                  <h3 className="text-lg font-bold text-[#7009c6]">AI Plan Options</h3>
                  <p className="text-sm text-slate-500">
                    Generated for request:{" "}
                    <strong className="text-slate-900">
                      {requests.find((r) => r.id === selectedRequestId)?.work_type}
                    </strong>{" "}
                    on{" "}
                    <strong className="text-slate-900">
                      {getSegmentName(
                        requests.find((r) => r.id === selectedRequestId)?.segment_id,
                        segments,
                      )}
                    </strong>
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="rounded-full text-[#7009c6] hover:bg-[#7009c6]/10"
                  onClick={() => setSelectedRequestId(null)}
                >
                  Clear Selection
                </Button>
              </div>
              <div>
                {planOptions[selectedRequestId]?.length ? (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    {planOptions[selectedRequestId].map((opt) => (
                      <div
                        key={opt.id}
                        className={`rounded-2xl border p-4 space-y-3 !bg-[#f5f0ff] transition-all ${
                          opt.is_recommended
                            ? "border-2 border-[#7009c6] !bg-[#7009c6]/5 shadow-sm"
                            : "border-slate-200"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-semibold text-slate-900">
                            {opt.option_label}
                          </span>
                          {opt.is_recommended && (
                            <Badge className="bg-[#7009c6] hover:bg-[#7009c6]/90 text-white text-xs rounded-full">
                              Recommended
                            </Badge>
                          )}
                        </div>
                        <div className="text-sm text-slate-500">
                          <span>{formatDateTime(opt.adjusted_start)}</span> ·{" "}
                          {opt.adjusted_duration_mins ?? 0} min
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-2xl font-bold tracking-tight font-heading tabular-nums text-[#7009c6]">
                            {opt.priority_score != null
                              ? Math.round(opt.priority_score)
                              : "—"}
                          </span>
                          {opt.delay_risk && (
                            <Badge variant="outline" className="border-[#7009c6]/30 text-[#7009c6] bg-white">
                              {opt.delay_risk}
                            </Badge>
                          )}
                        </div>
                        {opt.explanation && (
                          <p className="text-sm text-slate-600">
                            {opt.explanation}
                          </p>
                        )}
                        {opt.is_recommended && opt.what_if_note && (
                          <p className="text-sm italic text-slate-500 border-t border-slate-100 pt-2 mt-2">
                            {opt.what_if_note}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 text-slate-500">
                    <p className="font-medium">No plan options yet</p>
                    <p className="text-sm mt-1">
                      AI processing may still be running. Click "Reprocess" in
                      the list if stuck.
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="w-full m-0 !bg-[#f5f0ff] rounded-[24px] shadow-sm border border-slate-200/80 p-4 space-y-4">
            <div className="space-y-1">
              <h2 className="text-xl font-bold tracking-tight text-slate-900">My Requests</h2>
              <p className="text-sm text-slate-500">
                {user
                  ? `${requests.length} request${requests.length !== 1 ? "s" : ""} submitted`
                  : ""}
              </p>
            </div>

            {loading ? (
              <div className="space-y-3">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div
                    key={i}
                    className="h-16 w-full rounded-xl bg-[#f5f0ff] animate-pulse border border-slate-100 border-l-4 border-l-[#7009c6]/30"
                  />
                ))}
              </div>
            ) : requests.length === 0 ? (
              <EmptyState
                illustrationSrc="maintenance-all-clear.svg"
                illustrationAlt="All clear - no requests"
                title="No requests submitted"
                context="no-requests"
                hasAnyData={false}
              />
            ) : (
              <>
                <div className="flex flex-col sm:flex-row gap-4 items-center">
                  <div className="relative flex-1 max-w-sm w-full">
                    <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#7009c6]" />
                    <Input
                      placeholder="Search by segment or work type..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-10 h-10 rounded-full border-[#7009c6]/20 bg-white text-slate-800 placeholder:text-slate-400 focus-visible:ring-2 focus-visible:ring-[#7009c6] text-sm shadow-none"
                    />
                  </div>
                  <Select
                    value={statusFilter}
                    onValueChange={setStatusFilter}
                  >
                    <SelectTrigger className="w-full sm:w-[170px] h-10 rounded-full border-[#7009c6]/20 bg-white text-slate-800 focus:ring-2 focus:ring-[#7009c6] text-sm shadow-none">
                      <SelectValue placeholder="All Statuses" />
                    </SelectTrigger>
                    <SelectContent className="bg-white dark:bg-slate-800 border-[#7009c6]/20 dark:border-slate-700 rounded-xl shadow-lg dark:text-slate-100">
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
                  <div className="py-12 text-center !bg-[#f5f0ff] rounded-xl border border-dashed border-[#7009c6]/20 p-6">
                    <Search className="mx-auto h-8 w-8 text-[#7009c6]/40 mb-2" />
                    <p className="font-semibold text-slate-800">No matching requests</p>
                    <p className="text-xs text-slate-500 mt-1">Try adjusting your search terms or filter</p>
                  </div>
                ) : (
                  <div className="w-full m-0 p-0 overflow-x-auto">
                    <div className="min-w-[960px] w-full m-0 p-0 bg-white rounded-2xl border border-[#7009c6]/20 overflow-hidden shadow-sm">
                      {/* Table header row */}
                      <div className="grid grid-cols-[2fr_1.1fr_1.6fr_0.9fr_1.3fr_1.1fr_1fr_1.1fr] items-center gap-4 bg-[#7009c6] text-white font-bold text-[13px] rounded-full px-4 py-3">
                        <div>Segment</div>
                        <div>Work Type</div>
                        <div>Requested Start</div>
                        <div>Duration</div>
                        <div>Safety</div>
                        <div>Status</div>
                        <div>Priority Score</div>
                        <div>Actions</div>
                      </div>

                      {/* Modern Cards for each row */}
                      {filteredRequests.map((request, index) => {
                        const isSelected = selectedRequestId === request.id
                        const canSelect = request.status === "scored"

                        return (
                          <div
                            key={request.id}
                            className={cn(
                              "grid grid-cols-[2fr_1.1fr_1.6fr_0.9fr_1.3fr_1.1fr_1fr_1.1fr] items-center gap-4 px-4 py-3 text-black font-bold text-[12px] border-b border-[#7009c6]/10 last:border-b-0 transition-colors duration-200",
                              canSelect && "cursor-pointer hover:bg-[#7009c6]/5",
                              isSelected && "bg-[#7009c6]/5"
                            )}
                            style={{
                              animationDelay: `${Math.min(index * 40, 400)}ms`,
                            }}
                            onClick={
                              canSelect
                                ? () => setSelectedRequestId(request.id)
                                : undefined
                            }
                          >
                            <div className="flex items-center gap-2">
                              <span
                                className="h-2 w-2 shrink-0 rounded-full bg-[#7009c6]"
                                aria-hidden="true"
                              />
                              <span className="truncate">
                                {getSegmentName(request.segment_id, segments)}
                              </span>
                            </div>
                            <div>
                              {workTypeLabels[request.work_type] ?? request.work_type}
                            </div>
                            <div className="font-semibold">
                              {formatDateTime(request.requested_start)}
                            </div>
                            <div className="font-semibold">
                              {request.requested_duration_mins} min
                            </div>
                            <div>
                              {renderSafetyBadge(request.safety_criticality)}
                            </div>
                            <div>
                              {renderStatusBadge(request)}
                            </div>
                            <div className="tabular-nums">
                              {request.priority_score !== null ? (
                                <span className="text-black font-bold text-[14px]">
                                  {request.priority_score.toFixed(1)}
                                </span>
                              ) : (
                                <span className="font-semibold">
                                  Pending AI review
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                title="View plan options"
                                aria-label="View plan options"
                                className="p-1 rounded-md text-slate-500 hover:text-[#7009c6] hover:bg-[#7009c6]/10 transition-colors"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  setSelectedRequestId(request.id)
                                }}
                              >
                                <Eye className="h-4 w-4" />
                              </button>
                              <button
                                type="button"
                                title="Reprocess request"
                                aria-label="Reprocess request"
                                className="p-1 rounded-md text-slate-500 hover:text-[#7009c6] hover:bg-[#7009c6]/10 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  handleReprocess(request.id)
                                }}
                                disabled={
                                  reprocessing[request.id] ||
                                  request.status !== "submitted"
                                }
                              >
                                {reprocessing[request.id] ? (
                                  <RefreshCw className="h-4 w-4 animate-spin" />
                                ) : (
                                  <Pencil className="h-4 w-4" />
                                )}
                              </button>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
