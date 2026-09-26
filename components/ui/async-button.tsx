"use client"

import * as React from "react"
import { Button } from "@/components/ui/button"
import { Loader2 } from "lucide-react"
import { toast } from "sonner"
import type { VariantProps } from "class-variance-authority"
import { buttonVariants } from "@/components/ui/button"

export interface AsyncButtonProps
  extends Omit<React.ComponentProps<"button">, "onClick">,
    VariantProps<typeof buttonVariants> {
  onClick: () => Promise<void>
  loadingText?: React.ReactNode
  successMessage?: string
  errorMessage?: string
  onOptimistic?: () => void
  onErrorRevert?: () => void
  icon?: React.ReactNode
  loadingIcon?: React.ReactNode
}

export function AsyncButton({
  onClick,
  children,
  loadingText,
  successMessage,
  errorMessage = "Action failed. Please try again.",
  onOptimistic,
  onErrorRevert,
  disabled = false,
  className,
  variant,
  size,
  icon,
  loadingIcon,
  ...props
}: AsyncButtonProps) {
  const [loading, setLoading] = React.useState(false)

  const handleClick = async () => {
    if (loading) return
    setLoading(true)

    if (onOptimistic) {
      onOptimistic()
    }

    try {
      await onClick()
      if (successMessage) {
        toast.success(successMessage)
      }
    } catch (err) {
      const description = err instanceof Error ? err.message : undefined
      if (onErrorRevert) {
        onErrorRevert()
      }
      toast.error(errorMessage, {
        description: description ?? (errorMessage !== "Action failed. Please try again." ? errorMessage : undefined),
      })
    } finally {
      setLoading(false)
    }
  }

  const showSpinner = loading
  const spinner = <Loader2 className="h-4 w-4 animate-spin" />
  const defaultIcon = showSpinner ? (loadingIcon ?? spinner) : (icon ?? null)

  return (
    <Button
      {...props}
      variant={variant}
      size={size}
      disabled={disabled || loading}
      className={className}
      onClick={handleClick}
    >
      {defaultIcon && <span className="mr-2 shrink-0">{defaultIcon}</span>}
      {showSpinner && loadingText ? loadingText : children}
    </Button>
  )
}
