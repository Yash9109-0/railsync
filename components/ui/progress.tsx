"use client"

import * as React from "react"

import { cn } from "@/lib/utils"

function Progress({
  className,
  value,
  max = 100,
  ...props
}: React.ComponentProps<"progress"> & {
  value?: number | null
  max?: number
}) {
  return (
    <progress
      data-slot="progress"
      value={value ?? 0}
      max={max}
      className={cn(
        "w-full appearance-none overflow-hidden rounded-full bg-muted/50 [&>span]:sr-only",
        className,
      )}
      {...props}
    />
  )
}

export { Progress }
