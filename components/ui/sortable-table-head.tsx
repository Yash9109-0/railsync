"use client"

import * as React from "react"
import { cn } from "@/lib/utils"
import { ChevronUp, ChevronDown } from "lucide-react"

type SortDirection = "asc" | "desc" | null

interface SortableTableHeadProps {
  columns: Array<{
    key: string
    label: string
    sortable?: boolean
    className?: string
  }>
  sortBy: string | null
  sortDirection: SortDirection
  onSortChange: (key: string, direction: SortDirection) => void
  className?: string
}

export function SortableTableHead({
  columns,
  sortBy,
  sortDirection,
  onSortChange,
  className,
}: SortableTableHeadProps) {
  return (
    <thead className={cn("[&_tr]:border-b", className)}>
      <tr>
        {columns.map((col) => (
          <th
            key={col.key}
            className={cn(
              "h-10 px-2 text-left align-middle font-medium whitespace-nowrap text-foreground [&:has([role=checkbox])]:pr-0",
              col.sortable && "cursor-pointer select-none hover:bg-muted/50 transition-colors",
              col.className
            )}
            onClick={() => {
              if (!col.sortable) return
              let newDirection: SortDirection = "asc"
              if (sortBy === col.key && sortDirection === "asc") {
                newDirection = "desc"
              } else if (sortBy === col.key && sortDirection === "desc") {
                newDirection = null
              }
              onSortChange(col.key, newDirection)
            }}
          >
            <div className="flex items-center gap-1">
              <span>{col.label}</span>
              {col.sortable && sortBy === col.key && (
                <span className="flex items-center">
                  {sortDirection === "asc" ? (
                    <ChevronUp className="h-3.5 w-3.5 text-primary" />
                  ) : sortDirection === "desc" ? (
                    <ChevronDown className="h-3.5 w-3.5 text-primary" />
                  ) : (
                    <ChevronUp className="h-3.5 w-3.5 text-muted-foreground/50" />
                  )}
                </span>
              )}
              {col.sortable && sortBy !== col.key && (
                <span className="flex items-center text-muted-foreground/30">
                  <ChevronUp className="h-3.5 w-3.5" />
                </span>
              )}
            </div>
          </th>
        ))}
      </tr>
    </thead>
  )
}