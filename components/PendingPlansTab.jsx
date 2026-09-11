"use client"

import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"

export function generatePlanOptions(request) {
  const base = {
    duration: request.requested_duration_mins,
    workType: request.work_type,
    priorityScore: request.priority_score,
  }

  return [
    {
      id: "A",
      label: "Conservative Plan",
      description: "Minimal track possession, lower risk, later start window.",
      suggestedStartOffset: 120,
      ...base,
    },
    {
      id: "B",
      label: "Balanced Plan",
      description: "Standard scheduling that balances efficiency and safety.",
      suggestedStartOffset: 0,
      ...base,
    },
    {
      id: "C",
      label: "Aggressive Plan",
      description: "Earliest possible window to maximize throughput.",
      suggestedStartOffset: -120,
      ...base,
    },
  ]
}

export function ExplainabilityPanel({ score, factors }) {
  const factorEntries = factors ?? []

  return (
    <div className="border rounded-lg bg-muted/20 p-3 space-y-2">
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium">Explainability</span>
        <Badge variant="secondary">{score?.toFixed(1) ?? "—"}</Badge>
      </div>
      <ul className="text-xs text-muted-foreground space-y-1">
        {factorEntries.length === 0 && (
          <li>No contributing factors recorded.</li>
        )}
        {factorEntries.map((f, i) => (
          <li key={i}>
            {f.name}: <span className="font-medium">{f.value}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

export function WhatIfButtons({ requestId }) {
  return (
    <div className="flex flex-wrap gap-2">
      <Button
        variant="outline"
        size="sm"
        onClick={() => {
          fetch(`/api/requests/${requestId}/re-score`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ scenario: "sooner" }),
          }).catch(console.error)
        }}
      >
        Run Sooner
      </Button>
      <Button
        variant="outline"
        size="sm"
        onClick={() => {
          fetch(`/api/requests/${requestId}/re-score`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ scenario: "later" }),
          }).catch(console.error)
        }}
      >
        Run Later
      </Button>
      <Button
        variant="outline"
        size="sm"
        onClick={() => {
          fetch(`/api/requests/${requestId}/re-score`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ scenario: "shorter" }),
          }).catch(console.error)
        }}
      >
        Run Shorter
      </Button>
    </div>
  )
}
