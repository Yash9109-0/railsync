"use client"

import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Skeleton } from "@/components/ui/skeleton"
import { Slider } from "@/components/ui/slider"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { toast } from "sonner"
import { BlockRequest } from "@/lib/types"
import { useEffect, useState } from "react"
import { Loader2, Play } from "lucide-react"

type Row = BlockRequest & {
  trains_scheduled_in_window?: number | null
  asset_risk_flag?: number | null
  historical_overrun_rate?: number | null
}

type Draft = { duration: number; trains: number }

const supabase = createClient()

function delayRiskBadge(risk: string | null | undefined) {
  const r = (risk ?? "").toLowerCase()
  switch (r) {
    case "low":
      return "text-green-700 dark:text-green-400 bg-green-500/10 border-green-600/20"
    case "medium":
      return "text-amber-700 dark:text-amber-400 bg-amber-500/10 border-amber-600/20"
    case "high":
      return "text-red-700 dark:text-red-400 bg-red-500/10 border-red-600/20"
    default:
      return "text-muted-foreground bg-muted/50"
  }
}

function safetyBadge(criticality: string | null | undefined) {
  const c = (criticality ?? "").toLowerCase()
  switch (c) {
    case "critical":
    case "safety_critical":
      return "text-red-700 dark:text-red-400 bg-red-500/10 border-red-600/20"
    case "high":
      return "text-orange-700 dark:text-orange-400 bg-orange-500/10 border-orange-600/20"
    case "medium":
      return "text-amber-700 dark:text-amber-400 bg-amber-500/10 border-amber-600/20"
    case "low":
    case "routine":
      return "text-green-700 dark:text-green-400 bg-green-500/10 border-green-600/20"
    default:
      return "text-muted-foreground bg-muted/50"
  }
}

function formatStart(requestedStart: string) {
  const parsed = Date.parse(requestedStart)
  if (Number.isNaN(parsed)) return requestedStart
  return new Date(parsed).toLocaleString([], {
    dateStyle: "medium",
    timeStyle: "short",
  })
}

export default function AiPage() {
  const [requests, setRequests] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [scoring, setScoring] = useState(false)
  const [explanations, setExplanations] = useState<Record<string, string>>({})
  const [explaining, setExplaining] = useState<Record<string, boolean>>({})
  const [whatIfOpenId, setWhatIfOpenId] = useState<string | null>(null)
  const [whatIfDrafts, setWhatIfDrafts] = useState<Record<string, Draft>>({})
  const [whatIfScores, setWhatIfScores] = useState<Record<string, number | null>>({})

  const loadRequests = async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from("block_requests")
      .select("*")
      .in("status", ["submitted", "scored"])
      .order("created_at", { ascending: false })
    if (error) {
      toast.error("Failed to load block requests")
      setRequests([])
    } else {
      setRequests((data ?? []) as Row[])
    }
    setLoading(false)
  }

  useEffect(() => {
    loadRequests()
  }, [])

  const sorted = [...requests].sort((a, b) => {
    const sa = a.priority_score ?? -Infinity
    const sb = b.priority_score ?? -Infinity
    return sb - sa
  })

  const pendingCount = requests.filter((r) => r.priority_score === null).length
  const scoredScores = requests
    .map((r) => r.priority_score)
    .filter((s): s is number => s !== null)
  const avgScore = scoredScores.length
    ? Math.round(scoredScores.reduce((sum, s) => sum + s, 0) / scoredScores.length)
    : null
  const delayRiskCounts = { low: 0, medium: 0, high: 0 }
  for (const r of requests) {
    const level = (r.delay_risk ?? "").toLowerCase()
    if (level === "low" || level === "medium" || level === "high") {
      delayRiskCounts[level]++
    }
  }

  const handleScoreAll = async () => {
    const pending = requests.filter((r) => r.priority_score === null)
    if (pending.length === 0) {
      toast.info("No pending requests to score")
      return
    }
    setScoring(true)
    const toastId = toast.loading(`Scoring ${pending.length} request(s)...`)
    let failed = 0
    await Promise.all(
      pending.map(async (r) => {
        const res = await fetch("/api/score", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: r.id }),
        })
        const json = await res.json()
        if (!res.ok || json.error) failed += 1
      })
    )
    toast.dismiss(toastId)
    if (failed > 0) {
      toast.error(`${failed} request(s) failed to score`)
    } else {
      toast.success(`${pending.length} request(s) scored`)
    }
    setScoring(false)
    await loadRequests()
  }

  const handleGenerateExplanation = async (id: string) => {
    setExplaining((p) => ({ ...p, [id]: true }))
    try {
      const res = await fetch("/api/explain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      })
      const json = await res.json()
      if (!res.ok || json.error) {
        toast.error(json.error ?? "Failed to generate explanation")
        return
      }
      setExplanations((p) => ({ ...p, [id]: json.ai_explanation }))
      toast.success("Explanation generated")
    } catch {
      toast.error("Failed to generate explanation")
    } finally {
      setExplaining((p) => ({ ...p, [id]: false }))
    }
  }

  const previewScore = async (id: string, duration: number, trains: number) => {
    const res = await fetch("/api/score", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id,
        preview: true,
        requested_duration_mins: duration,
        trains_scheduled_in_window: trains,
      }),
    })
    const json = await res.json()
    if (!res.ok || json.error) {
      toast.error(json.error ?? "Preview failed")
      return
    }
    setWhatIfScores((p) => ({ ...p, [id]: json.priority_score ?? null }))
  }

  useEffect(() => {
    if (!whatIfOpenId) return
    const draft = whatIfDrafts[whatIfOpenId]
    if (!draft) return
    const id = setTimeout(() => {
      previewScore(whatIfOpenId, draft.duration, draft.trains)
    }, 500)
    return () => clearTimeout(id)
  }, [whatIfDrafts, whatIfOpenId])

  const openWhatIf = (row: Row) => {
    setWhatIfDrafts((p) => ({
      ...p,
      [row.id]: {
        duration: row.requested_duration_mins,
        trains: row.trains_scheduled_in_window ?? 1,
      },
    }))
    setWhatIfScores((p) => ({ ...p, [row.id]: null }))
    setWhatIfOpenId(row.id)
  }

  const updateDraft = (id: string, patch: Partial<Draft>) => {
    setWhatIfDrafts((p) => ({
      ...p,
      [id]: { ...p[id], ...patch },
    }))
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">AI Priority & Scoring</h1>
          <p className="text-muted-foreground">
            AI-ranked block requests with priority scoring and explanations.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={loadRequests} disabled={loading}>
            Refresh
          </Button>
          <Button
            variant="default"
            size="sm"
            onClick={handleScoreAll}
            disabled={scoring || loading}
          >
            {scoring ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Scoring...
              </>
            ) : (
              <>
                <Play className="h-4 w-4 mr-2" />
                Score All Pending
              </>
            )}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="pt-6">
            <p className="text-xs uppercase text-muted-foreground">Pending</p>
            <div className="text-2xl font-bold">{pendingCount}</div>
            <p className="text-xs text-muted-foreground">unscored requests</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-xs uppercase text-muted-foreground">Avg priority</p>
            <div className="text-2xl font-bold">{avgScore ?? "—"}</div>
            <p className="text-xs text-muted-foreground">of {scoredScores.length} scored</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-xs uppercase text-muted-foreground">Delay risk</p>
            <div className="mt-2 flex justify-around">
              <div className="flex flex-col items-center">
                <span className="text-xl font-bold text-green-600">
                  {delayRiskCounts.low}
                </span>
                <span className="text-[10px] text-muted-foreground">Low</span>
              </div>
              <div className="flex flex-col items-center">
                <span className="text-xl font-bold text-amber-600">
                  {delayRiskCounts.medium}
                </span>
                <span className="text-[10px] text-muted-foreground">Med</span>
              </div>
              <div className="flex flex-col items-center">
                <span className="text-xl font-bold text-red-600">
                  {delayRiskCounts.high}
                </span>
                <span className="text-[10px] text-muted-foreground">High</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : sorted.length === 0 ? (
        <Card>
          <CardContent className="pt-6">
            <p className="text-center text-muted-foreground">
              No submitted or scored block requests.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[90px]">Priority</TableHead>
                  <TableHead>Request</TableHead>
                  <TableHead>Segment</TableHead>
                  <TableHead>Start</TableHead>
                  <TableHead className="w-[110px]">Duration</TableHead>
                  <TableHead className="w-[120px]">Delay risk</TableHead>
                  <TableHead className="w-[200px]">Explanation</TableHead>
                  <TableHead className="w-[160px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sorted.map((row, index) => {
                  const isTop = index === 0 && row.priority_score != null
                  const hasScore = row.priority_score != null
                  return (
                    <TableRow
                      key={row.id}
                      className={isTop ? "border-l-4 border-[#960DF2]" : undefined}
                    >
                      <TableCell>
                        <div className="flex items-center gap-1.5">
                          {hasScore ? (
                            <span
                              className={
                                index < 3
                                  ? "text-lg font-bold text-primary"
                                  : "text-sm font-medium"
                              }
                            >
                              {Math.round(row.priority_score!)}
                            </span>
                          ) : (
                            <span className="text-sm text-muted-foreground">—</span>
                          )}
                          {isTop && (
                            <Badge variant="secondary" className="text-xs">
                              Top
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="font-medium">{row.work_type}</span>
                          <Badge
                            variant="outline"
                            className={safetyBadge(row.safety_criticality)}
                          >
                            {row.safety_criticality}
                          </Badge>
                        </div>
                      </TableCell>
                      <TableCell>{row.segment_id ?? "—"}</TableCell>
                      <TableCell className="text-sm">
                        {formatStart(row.requested_start)}
                      </TableCell>
                      <TableCell>{row.requested_duration_mins} min</TableCell>
                      <TableCell>
                        {row.delay_risk ? (
                          <Badge
                            variant="outline"
                            className={delayRiskBadge(row.delay_risk)}
                          >
                            {row.delay_risk}
                          </Badge>
                        ) : (
                          <span className="text-sm text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {explanations[row.id] ? (
                          <p className="mt-1 animate-in fade-in text-sm italic text-muted-foreground">
                            {explanations[row.id]}
                          </p>
                        ) : (
                          <Button
                            variant="link"
                            size="sm"
                            disabled={!hasScore || explaining[row.id]}
                            onClick={() => handleGenerateExplanation(row.id)}
                          >
                            {explaining[row.id] ? "Generating..." : "Generate"}
                          </Button>
                        )}
                      </TableCell>
                      <TableCell>
                        <Dialog
                          open={whatIfOpenId === row.id}
                          onOpenChange={(open) => {
                            if (open) openWhatIf(row)
                            else setWhatIfOpenId(null)
                          }}
                        >
                          <DialogTrigger asChild>
                            <Button variant="outline" size="sm">
                              What if?
                            </Button>
                          </DialogTrigger>
                          <DialogContent>
                            <DialogHeader>
                              <DialogTitle>What if…</DialogTitle>
                              <DialogDescription>
                                Adjust duration and trains to see how the
                                priority score changes (preview only — nothing is saved).
                              </DialogDescription>
                            </DialogHeader>
                            <div className="space-y-5 py-2">
                              <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                  <label className="text-sm font-medium">
                                    Duration (minutes)
                                  </label>
                                  <span className="text-sm font-medium">
                                    {whatIfDrafts[row.id]?.duration ??
                                      row.requested_duration_mins}
                                  </span>
                                </div>
                                <Slider
                                  value={[
                                    whatIfDrafts[row.id]?.duration ??
                                      row.requested_duration_mins,
                                  ]}
                                  min={30}
                                  max={240}
                                  step={10}
                                  onValueChange={(v) =>
                                    updateDraft(row.id, { duration: v[0] })
                                  }
                                />
                              </div>
                              <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                  <label className="text-sm font-medium">
                                    Trains in window
                                  </label>
                                  <span className="text-sm font-medium">
                                    {whatIfDrafts[row.id]?.trains ??
                                      row.trains_scheduled_in_window ??
                                      0}
                                  </span>
                                </div>
                                <Slider
                                  value={[
                                    whatIfDrafts[row.id]?.trains ??
                                      row.trains_scheduled_in_window ??
                                      1,
                                  ]}
                                  min={0}
                                  max={8}
                                  step={1}
                                  onValueChange={(v) =>
                                    updateDraft(row.id, { trains: v[0] })
                                  }
                                />
                              </div>
                              <div className="rounded-md border bg-muted/40 p-3 text-center">
                                <span className="text-xs uppercase text-muted-foreground">
                                  Predicted priority
                                </span>
                                <p className="text-2xl font-bold">
                                  {whatIfScores[row.id] == null
                                    ? "—"
                                    : Math.round(whatIfScores[row.id] as number)}
                                </p>
                              </div>
                            </div>
                          </DialogContent>
                        </Dialog>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
