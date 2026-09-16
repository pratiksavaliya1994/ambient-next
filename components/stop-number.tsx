import { cn } from "@/lib/utils"

/**
 * A stop's position on its driver's route. Shared by Active trips — where it
 * replaced the plain timeline dot — and the Dispatch board, hence
 * `components/` rather than living next to either.
 *
 * The two screens feed it different numbers on purpose. Active trips passes
 * the row's index within its driver card, so the column always reads 1..N
 * contiguously even before anyone has saved an order. The Dispatch board
 * passes the *stored* position (`stopPosition(request.order)`) and renders
 * nothing when the request was never sequenced — that board isn't grouped by
 * driver, so a positional index there would be a number about nothing.
 */
export function StopNumber({
  position,
  tone = "muted",
  className,
}: {
  position: number
  /**
   * `"primary"` where the number *is* the point — the trip builder's route,
   * whose whole job is the order you'd drive. Everywhere else the position is
   * context beside a location, and a loud badge would compete with it.
   */
  tone?: "muted" | "primary"
  className?: string
}) {
  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full font-medium tabular-nums",
        tone === "primary"
          ? "size-6 bg-primary text-xs text-primary-foreground"
          : "size-5 bg-muted text-[0.625rem] text-muted-foreground",
        className
      )}
      aria-label={`Stop ${position}`}
    >
      {position}
    </span>
  )
}
