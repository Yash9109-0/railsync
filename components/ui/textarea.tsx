import * as React from "react"

import { cn } from "@/lib/utils"

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "min-h-20 w-full rounded-xl border border-input bg-transparent px-3 py-2 text-base transition-all duration-fast hover:border-border-strong focus:border-primary focus:ring-1 focus:ring-primary focus-visible:!outline-none !outline-none placeholder:text-muted-foreground disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 disabled:bg-input/50 aria-[invalid=true]:border-destructive md:text-sm dark:bg-input/30 dark:disabled:bg-input/80 dark:aria-[invalid=true]:border-destructive/50",
        className,
      )}
      {...props}
    />
  )
}

export { Textarea }
