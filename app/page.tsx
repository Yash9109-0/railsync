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
import { useEffect, useRef, useState } from "react"

type Row = BlockRequest & {
  trains_scheduled_in_window?: number | null
  asset_risk_flag?: number | null
  historical_overrun_rate?: number | null
}

type Draft = { duration: number; trains: number }

const supabase = createClient()

export default function AiPage() {
  const [requests, setRequests] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)

  const load = useRef(
    async () => {
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
  )

  useEffect(() => {
    load.current()
  }, [])

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold">AI Dashboard</h1>
      <p className="text-muted-foreground">AI-ranked block requests and priority scoring.</p>
    </div>
  )
}