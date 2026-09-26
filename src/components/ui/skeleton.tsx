import { cn } from "cn"

function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn(
        "relative overflow-hidden rounded-md bg-muted bg-[linear-gradient(100deg,transparent_0%,color-mix(in_oklch,var(--foreground)_6%,transparent)_50%,transparent_100%)] bg-[length:200%_100%] [animation:var(--animate-shimmer)]",
        className
      )}
      {...props}
    />
  )
}

export { Skeleton }
