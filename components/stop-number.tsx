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
export function StopNumber({ position, className }: { position: number; className?: string }) {
  return (
    <span
      className={cn(
        "flex size-5 shrink-0 items-center justify-center rounded-full bg-muted text-[0.625rem] font-medium text-muted-foreground tabular-nums",
        className
      )}
      aria-label={`Stop ${position}`}
    >
      {position}
    </span>
  )
}
