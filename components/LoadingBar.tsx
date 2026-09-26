"use client"

import { useEffect, useState } from "react"
import { usePathname, useSearchParams } from "next/navigation"

export function LoadingBar() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [isLoading, setIsLoading] = useState(false)
  const [progress, setProgress] = useState(0)

  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout>
    let progressInterval: ReturnType<typeof setInterval>

    setIsLoading(true)
    setProgress(0)

    progressInterval = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 90) {
          clearInterval(progressInterval)
          return 90
        }
        return prev + Math.random() * 10
      })
    }, 100)

    timeoutId = setTimeout(() => {
      setProgress(100)
      setTimeout(() => {
        setIsLoading(false)
        setProgress(0)
      }, 200)
    }, 300)

    return () => {
      clearTimeout(timeoutId)
      clearInterval(progressInterval)
    }
  }, [pathname, searchParams])

  if (!isLoading) return null

  return (
    <div
      className="fixed top-0 left-0 right-0 z-[100] h-1 bg-primary/20 pointer-events-none"
      style={{ height: "3px" }}
      role="progressbar"
      aria-valuenow={progress}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className="h-full bg-primary transition-all duration-150 ease-out"
        style={{
          width: `${progress}%`,
          boxShadow: "0 0 10px hsl(var(--primary)), 0 0 20px hsl(var(--primary))",
        }}
      />
    </div>
  )
}