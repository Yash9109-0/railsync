import * as React from "react"

import { cn } from "@/lib/utils"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "h-10 w-full min-w-0 rounded-xl border border-input bg-transparent px-4 py-2 text-base transition-all duration-fast hover:border-border-strong focus:border-primary focus:ring-2 focus:ring-primary/20 focus:shadow-sm file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 aria-[invalid=true]:border-destructive aria-[invalid=true]:focus:ring-destructive/20 aria-[invalid=true]:focus:border-destructive md:text-sm dark:bg-input/30 dark:disabled:bg-input/80 dark:aria-[invalid=true]:border-destructive/50 dark:aria-[invalid=true]:focus:ring-destructive/10",
        className
      )}
      {...props}
    />
  )
}

export { Input }
