"use client"

import { AsyncButton } from "@/components/ui/async-button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { toast } from "sonner"
import { TrainFront } from "lucide-react"

export function GoodsForecastPanel({
  corridorId,
}: {
  corridorId: number | null
}) {
  const handleSimulate = async () => {
    const res = await fetch("/api/simulate-goods-forecast", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ corridorId }),
    })
    const json = await res.json()
    if (!res.ok) {
      throw new Error(json?.error || "Failed to generate goods forecast")
    }
    toast.success("Goods forecast generated", {
      description: `${json.count ?? "?"} forecast rows created across ${json.segments ?? "?"} segments for ${json.forecast_days ?? "?"} days.`,
    })
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
        <AsyncButton
          variant="outline"
          size="sm"
          onClick={handleSimulate}
          successMessage="Goods forecast generated"
          errorMessage="Failed to generate goods forecast"
          icon={<TrainFront className="h-4 w-4" />}
        >
          Simulate Goods Forecast (30 days)
        </AsyncButton>
      </CardContent>
    </Card>
  )
}

export default GoodsForecastPanel
