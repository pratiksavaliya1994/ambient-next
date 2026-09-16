import { ClockIcon } from "lucide-react"

import { formatWindow, formatWindowCompact, stopWindow } from "@/lib/trips/schedule"
import { cn } from "@/lib/utils"

/**
 * When the driver is at this stop — as a **badge that carries its own weight** —
 * `6:00 – 6:30 AM` in foreground ink on a bordered chip, with a clock to mark
 * it as a time rather than one more number on a crowded row.
 *
 * The builder's spelling, where a stop is a row being dragged into order and
 * the time has to hold its own against a grip, a number and two arrows. The
 * run sheet uses `StopTimeRail` instead.
 *
 * **Computed here**, from the trip's start time and the stop's position —
 * neither screen has a stored time to pass, and neither should. Dragging a
 * stop up the route re-renders its window on the spot, with nothing written
 * anywhere. See `lib/trips/schedule.ts`.
 *
 * `tone="active"` is for the stop the driver is at now, so the chip reads with
 * the card's primary ring instead of against it.
 */
export function StopTimeBadge({
  startTime,
  index,
  tone = "default",
  className,
}: {
  /** The trip's `"HH:mm"` departure time. */
  startTime: string
  /** The stop's 0-based place in route order. */
  index: number
  tone?: "default" | "active"
  className?: string
}) {
  return (
    <span
      className={cn(
        "inline-flex w-fit shrink-0 items-center gap-1 rounded-md border px-1.5 py-0.5 text-xs leading-tight font-semibold tabular-nums shadow-xs",
        tone === "active" ? "border-primary/40 bg-primary/10 text-primary" : "border-border bg-background text-foreground",
        className
      )}
    >
      <ClockIcon className="size-3 shrink-0 opacity-70" aria-hidden />
      {formatWindow(stopWindow(startTime, index))}
    </span>
  )
}

/**
 * The same time, written down the run sheet's **timeline rail** — under the
 * stop's number, outside the card entirely.
 *
 * The rail is where the eye already goes to read the route in order, so a time
 * there is found without hunting through a card that also holds a location, a
 * kind, a done pill and every tool being moved. Inside the card it was one
 * more line among six.
 *
 * The **whole window on one line**, as a pill — `6AM–6:30AM`. A driver
 * reading "when am I here" wants the end as much as the start, and a range
 * split across two lines stops reading as a range, so the spelling gives up
 * the `:00` and the spaces rather than the close. See `formatWindowCompact`.
 *
 * Small and only medium-weight, with the pill doing the highlighting: at
 * semibold, twelve characters in a rail this narrow ran into each other, and
 * bold text is a poor way to make something findable when a tinted chip in a
 * column of tinted chips does it without shouting.
 */
export function StopTimeRail({
  startTime,
  index,
  tone = "default",
  className,
}: {
  /** The trip's `"HH:mm"` departure time. */
  startTime: string
  /** The stop's 0-based place in route order. */
  index: number
  /** `"active"` for the stop the driver is at now, to match the card's ring. */
  tone?: "default" | "active" | "done"
  className?: string
}) {
  const window = stopWindow(startTime, index)

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10px] leading-none font-medium whitespace-nowrap",
        tone === "active"
          ? "border-primary/40 bg-primary/10 text-primary"
          : tone === "done"
            ? "border-status-ok/40 bg-status-ok/15 text-status-ok-foreground"
            : "border-border bg-background text-muted-foreground",
        className
      )}
      title={formatWindow(window)}
    >
      <span className="sr-only">{formatWindow(window)}</span>
      <span aria-hidden>{formatWindowCompact(window)}</span>
    </span>
  )
}
