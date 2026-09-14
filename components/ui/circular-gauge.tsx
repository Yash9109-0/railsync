"use client"

import { cn } from "@/lib/utils"

type GaugeColor =
  | "primary"
  | "success"
  | "warning"
  | "destructive"
  | "muted"

const GAUGE_STROKE: Record<GaugeColor, string> = {
  primary: "hsl(var(--primary))",
  success: "hsl(var(--success))",
  warning: "hsl(var(--warning))",
  destructive: "hsl(var(--destructive))",
  muted: "hsl(var(--muted))",
}

interface CircularGaugeProps {
  value: number | null
  max?: number
  size?: number
  strokeWidth?: number
  label?: string
  color?: GaugeColor
  className?: string
  valueFormatter?: (value: number) => string
}

function CircularGauge({
  value,
  max = 100,
  size = 96,
  strokeWidth = 8,
  label,
  color = "muted",
  className,
  valueFormatter = (v) => `${Math.round(v)}%`,
}: CircularGaugeProps) {
  const numeric = value == null ? 0 : Number(value)
  const clamped = Number.isNaN(numeric) ? 0 : Math.max(0, Math.min(max, numeric))
  const ratio = clamped / max
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const offset = circumference * (1 - ratio)
  const display = value == null ? "—" : valueFormatter(clamped)

  return (
    <div
      className={cn(
        "inline-flex w-max flex-col items-center gap-1",
        className,
      )}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeWidth={strokeWidth}
          fill="none"
          stroke="hsl(var(--muted))"
          opacity={0.4}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeWidth={strokeWidth}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={offset}
          stroke={GAUGE_STROKE[color]}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          className="transition-[stroke-dashoffset] duration-300 ease-out"
        />
      </svg>
      <div className="flex flex-col items-center">
        <span className="text-lg font-bold tabular-nums">{display}</span>
        {label ? (
          <span className="text-xs text-muted-foreground">{label}</span>
        ) : null}
      </div>
    </div>
  )
}

export { CircularGauge }
export type { GaugeColor }
