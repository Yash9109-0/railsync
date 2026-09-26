import * as React from "react"

import { cn } from "@/lib/utils"

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "min-h-20 w-full rounded-lg border border-input bg-transparent px-3 py-1 text-base transition-colors duration-fast placeholder:text-muted-foreground disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 disabled:bg-input/50 aria-[invalid=true]:border-destructive md:text-sm dark:bg-input/30 dark:disabled:bg-input/80 dark:aria-[invalid=true]:border-destructive/50",
        className,
      )}
      {...props}
    />
  )
}

export { Textarea }
