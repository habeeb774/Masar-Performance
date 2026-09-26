import * as React from "react"
import { cn } from "cn"

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "flex field-sizing-content min-h-16 w-full rounded-lg border border-input bg-muted/40 px-2.5 py-2 text-base shadow-[var(--shadow-inset)] outline-none transition-[box-shadow,border-color,background-color] duration-150 [transition-timing-function:var(--ease-press)] placeholder:text-muted-foreground focus-visible:border-ring focus-visible:bg-background focus-visible:shadow-[var(--shadow-inset-focus)] disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 disabled:shadow-none aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm dark:bg-input/20 dark:disabled:bg-input/80 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40",
        className
      )}
      {...props}
    />
  )
}

export { Textarea }
