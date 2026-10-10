"use client"

import type { LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"

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
}: DashboardPageHeaderProps) {
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
          <h1 className="text-2xl font-semibold tracking-tight text-purple-700 dark:text-purple-300 flex items-center gap-2 font-heading">
            {title}
          </h1>
          {description && (
            <p className="text-sm text-muted-foreground dark:text-slate-400">{description}</p>
          )}
        </div>
      </div>
      {action && <div className="flex items-center gap-2">{action}</div>}
    </header>
  )
}
