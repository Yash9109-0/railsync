"use client"

import * as React from "react"
import { cn } from "@/lib/utils"
import { Search, X } from "lucide-react"
import { Input } from "@/components/ui/input"

interface SearchInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  onSearchChange: (value: string) => void
  placeholder?: string
  debounceMs?: number
}

export function SearchInput({
  onSearchChange,
  placeholder = "Search...",
  debounceMs = 200,
  className,
  ...props
}: SearchInputProps) {
  const [internalValue, setInternalValue] = React.useState("")
  const debouncedSearchRef = React.useRef<NodeJS.Timeout | null>(null)

  const handleChange = (value: string) => {
    setInternalValue(value)
    if (debouncedSearchRef.current) {
      clearTimeout(debouncedSearchRef.current)
    }
    debouncedSearchRef.current = setTimeout(() => {
      onSearchChange(value)
    }, debounceMs)
  }

  React.useEffect(() => {
    return () => {
      if (debouncedSearchRef.current) {
        clearTimeout(debouncedSearchRef.current)
      }
    }
  }, [])

  const { className: _propsClassName, ...restProps } = props as React.InputHTMLAttributes<HTMLInputElement>

  return (
    <div className={cn("relative w-full max-w-xs", className)}>
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
      <Input
        type="search"
        placeholder={placeholder}
        value={internalValue}
        onChange={(e) => handleChange(e.target.value)}
        className={cn("pl-9 pr-9", _propsClassName)}
        {...restProps}
      />
      {internalValue && (
        <button
          type="button"
          onClick={() => {
            setInternalValue("")
            onSearchChange("")
          }}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          aria-label="Clear search"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  )
}