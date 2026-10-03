"use client"

import type { LucideIcon } from "lucide-react"
import { useEffect, useState } from "react"
import { cn } from "@/lib/utils"
import { getTimeAwareGreeting } from "@/lib/utils"

interface DashboardPageHeaderProps {
  icon?: LucideIcon
  title: string
  description?: string
  action?: React.ReactNode
  userName?: string
}

export function DashboardPageHeader({
  icon: Icon,
  title,
  description,
  action,
  userName,
}: DashboardPageHeaderProps) {
  const [greeting, setGreeting] = useState("")

  useEffect(() => {
    setGreeting(getTimeAwareGreeting())
  }, [])

  return (
    <header
      className={cn(
        "flex items-start justify-between gap-2 flex-wrap",
        "divider-gradient pb-6 bg-transparent",
      )}
    >
      <div className="flex items-center gap-3">
        {Icon && (
          <div className="flex shrink-0 items-center justify-center rounded-xl bg-purple-100 p-3 text-primary">
            <Icon className="h-5 w-5" />
          </div>
        )}
        <div className="flex flex-col">
          <h1 className="text-2xl font-semibold tracking-tight text-purple-700 flex items-center gap-2 font-heading">
            {userName && (
              <span className="text-lg font-medium text-muted-foreground">
                {greeting}, {userName}
              </span>
            )}
            {title}
          </h1>
          {description && (
            <p className="text-sm text-muted-foreground">{description}</p>
          )}
        </div>
      </div>
      {action && <div className="flex items-center gap-2">{action}</div>}
    </header>
  )
}
