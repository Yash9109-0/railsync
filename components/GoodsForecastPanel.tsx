"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { toast } from "sonner"
import { Loader2, TrainFront } from "lucide-react"

export function GoodsForecastPanel() {
  const [loading, setLoading] = useState(false)

  const handleSimulate = async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/simulate-goods-forecast", { method: "POST" })
      const json = await res.json()
      if (!res.ok) {
        throw new Error(json?.error || "Failed to generate goods forecast")
      }
      toast.success("Goods forecast generated", {
        description: `${json.count ?? "?"} forecast rows created across ${json.segments ?? "?"} segments for ${json.forecast_days ?? "?"} days.`,
      })
    } catch (err) {
      toast.error("Failed to generate goods forecast", {
        description: err instanceof Error ? err.message : "Unknown error",
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <TrainFront className="h-5 w-5 text-muted-foreground" />
          Goods Train Forecast
        </CardTitle>
        <CardDescription>
          Generate a 30-day synthetic forecast of freight train volumes (trains per segment per day) and peak traffic hours.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button
          variant="outline"
          size="sm"
          onClick={handleSimulate}
          disabled={loading}
        >
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
              Simulating…
            </>
          ) : (
            <>Simulate Goods Forecast (30 days)</>
          )}
        </Button>
      </CardContent>
    </Card>
  )
}

export default GoodsForecastPanel
