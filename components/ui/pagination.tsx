"use client"

import * as React from "react"
import { cn } from "@/lib/utils"
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react"
import { Button } from "@/components/ui/button"

interface PaginationProps {
  currentPage: number
  totalPages: number
  onPageChange: (page: number) => void
  className?: string
  showPageNumbers?: boolean
  maxPageNumbers?: number
}

export function Pagination({
  currentPage,
  totalPages,
  onPageChange,
  className,
  showPageNumbers = true,
  maxPageNumbers = 5,
}: PaginationProps) {
  const pages = React.useMemo(() => {
    if (totalPages <= 1 || !showPageNumbers) return []

    const pages: (number | "ellipsis")[] = []
    const half = Math.floor(maxPageNumbers / 2)

    let start = Math.max(2, currentPage - half)
    let end = Math.min(totalPages - 1, start + maxPageNumbers - 3)

    if (end - start + 1 < maxPageNumbers - 2) {
      start = Math.max(2, end - maxPageNumbers + 3)
    }

    pages.push(1)

    if (start > 2) {
      pages.push("ellipsis")
    }

    for (let i = start; i <= end; i++) {
      pages.push(i)
    }

    if (end < totalPages - 1) {
      pages.push("ellipsis")
    }

    if (totalPages > 1) {
      pages.push(totalPages)
    }

    return pages
  }, [currentPage, totalPages, maxPageNumbers, showPageNumbers])

  if (totalPages <= 1) return null

  return (
    <nav
      className={cn("flex items-center gap-1", className)}
      aria-label="Pagination"
    >
      <Button
        variant="outline"
        size="sm"
        onClick={() => onPageChange(1)}
        disabled={currentPage === 1}
        aria-label="First page"
      >
        <ChevronsLeft className="h-4 w-4" />
      </Button>
      <Button
        variant="outline"
        size="sm"
        onClick={() => onPageChange(currentPage - 1)}
        disabled={currentPage === 1}
        aria-label="Previous page"
      >
        <ChevronLeft className="h-4 w-4" />
      </Button>

      {showPageNumbers && (
        <div className="flex items-center gap-1">
          {pages.map((page, index) =>
            page === "ellipsis" ? (
              <span key={`ellipsis-${index}`} className="px-2 text-muted-foreground">
                ...
              </span>
            ) : (
              <Button
                key={page}
                variant={currentPage === page ? "default" : "outline"}
                size="sm"
                onClick={() => onPageChange(page as number)}
                className="min-w-[2.25rem] h-8"
              >
                {page}
              </Button>
            )
          )}
        </div>
      )}

      <Button
        variant="outline"
        size="sm"
        onClick={() => onPageChange(currentPage + 1)}
        disabled={currentPage === totalPages}
        aria-label="Next page"
      >
        <ChevronRight className="h-4 w-4" />
      </Button>
      <Button
        variant="outline"
        size="sm"
        onClick={() => onPageChange(totalPages)}
        disabled={currentPage === totalPages}
        aria-label="Last page"
      >
        <ChevronsRight className="h-4 w-4" />
      </Button>
    </nav>
  )
}

interface LoadMoreProps {
  hasMore: boolean
  onLoadMore: () => void
  loading?: boolean
  className?: string
}

export function LoadMore({
  hasMore,
  onLoadMore,
  loading = false,
  className,
}: LoadMoreProps) {
  if (!hasMore) return null

  return (
    <div className={cn("flex justify-center py-4", className)}>
      <Button
        variant="outline"
        size="sm"
        onClick={onLoadMore}
        disabled={loading}
      >
        {loading ? "Loading..." : "Load More"}
      </Button>
    </div>
  )
}