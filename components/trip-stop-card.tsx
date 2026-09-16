import { CheckIcon, MapPinIcon, WarehouseIcon } from "lucide-react"

import { StopTimeRail } from "@/components/stop-time"
import { TripStopActions } from "@/components/trip-stop-actions"
import { TripStopItems } from "@/components/trip-stop-items"
import { isStopDone, type StopWork } from "@/lib/bubble/trips-types"
import type { StopKind } from "@/lib/trips/plan-types"
import { cn } from "@/lib/utils"

/**
 * One stop on the run sheet: where to go, what to collect, what to leave.
 *
 * Laid out as a **timeline row** — a numbered marker on a rail down the left,
 * the stop's card to the right — because the one thing a driver needs before
 * anything else is the order. A stack of equal cards said "here are some
 * places"; a rail says "this one, then this one".
 *
 * The card's surface is **`bg-muted`, not `bg-card`**: in the light theme
 * `--card` and `--background` are both pure white, so a `bg-card` stop is only
 * ever a hairline border on the page and every stop blends into the next. A
 * tint plus a shadow lifts it in both themes without a panel behind the run
 * sheet — the page around the stops stays the page.
 *
 * The "done" state is **derived** from the items at the stop, never stored —
 * a `tripstop.status` column would be a second source of truth that starts
 * lying the moment an item is added to a stop already marked done.
 *
 * Actions only render while the trip is under way. On a `Planned` trip this is
 * a preview of the route; on a `Completed` one it is a record.
 */
export function TripStopCard({
  tripId,
  work,
  position,
  startTime,
  last,
  current,
  live,
}: {
  tripId: string
  work: StopWork
  position: number
  /**
   * The trip's `"HH:mm"` departure. The stop's own time is counted forward from
   * it by `position` — nothing on `tripstop` stores a time, deliberately.
   */
  startTime: string
  /** Last stop on the route — the rail stops here rather than running into nothing. */
  last: boolean
  /** The first stop still outstanding on a running trip: where the driver is. */
  current: boolean
  /** The trip is `In Transit`, so this stop can actually be recorded. */
  live: boolean
}) {
  const done = isStopDone(work)
  const Icon = work.stop.kind === "Warehouse" ? WarehouseIcon : MapPinIcon

  return (
    <li className="grid grid-cols-[5.5rem_1fr] gap-x-2 sm:grid-cols-[6rem_1fr] sm:gap-x-3">
      <StopRail position={position} done={done} current={current} last={last} startTime={startTime} />

      <div
        className={cn(
          "min-w-0 rounded-xl border bg-muted/70 shadow-sm",
          !last && "mb-3",
          current ? "border-primary/50 ring-2 ring-primary/20" : done && "border-status-ok/40"
        )}
      >
        {/* No time in here: it reads down the rail instead, where the route
            is already being read in order. See `StopRail`. */}
        <header className="flex items-center gap-2 px-3 py-2.5 sm:px-4">
          <Icon className="size-4 shrink-0 text-muted-foreground" />
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium" title={work.stop.location}>
              {work.stop.location}
            </p>
            <p className="truncate text-[11px] text-muted-foreground">{caption(work.stop.kind, current, live)}</p>
          </div>
          {done && (
            <span className="flex shrink-0 items-center gap-1 rounded-full bg-status-ok/15 px-2 py-0.5 text-[11px] font-medium text-status-ok-foreground">
              <CheckIcon className="size-3" />
              Done
            </span>
          )}
        </header>

        <div className="flex flex-col gap-2 border-t px-3 py-3 sm:px-4">
          <TripStopItems
            collect={work.collect}
            drop={work.drop}
            refused={work.refused}
            kind={work.stop.kind}
          />
          {live && !done && <TripStopActions tripId={tripId} work={work} />}
        </div>
      </div>
    </li>
  )
}

/**
 * The stop's place in the route, its time, and the line that ties it to the
 * next one.
 *
 * The time sits **here rather than in the card** — directly under the number,
 * in the column the eye runs down to read the route in order. In the card it
 * shared a header with a location, a kind and a done pill, and a driver
 * checking "when am I at the next one" had to read a card to find out.
 */
function StopRail({
  position,
  done,
  current,
  last,
  startTime,
}: {
  position: number
  done: boolean
  current: boolean
  last: boolean
  startTime: string
}) {
  return (
    <div className="flex flex-col items-center">
      <span
        className={cn(
          "flex size-7 shrink-0 items-center justify-center rounded-full border-2 text-xs font-semibold tabular-nums",
          current
            ? "border-primary bg-primary text-primary-foreground"
            : done
              ? "border-status-ok/50 bg-status-ok/15 text-status-ok-foreground"
              : "border-border bg-background text-muted-foreground"
        )}
        aria-label={`Stop ${position}`}
      >
        {done ? <CheckIcon className="size-3.5" /> : position}
      </span>
      <StopTimeRail
        startTime={startTime}
        index={position - 1}
        tone={current ? "active" : done ? "done" : "default"}
        className="mt-1.5"
      />
      {!last && <span className={cn("mt-1.5 w-0.5 flex-1 rounded-full", done ? "bg-status-ok/40" : "bg-border")} />}
    </div>
  )
}

/** The one line under a stop's name: what kind of place it is, or that it is the one to drive to now. */
function caption(kind: StopKind, current: boolean, live: boolean): string {
  const place = kind === "Warehouse" ? "Warehouse" : "Job site"
  return live && current ? `${place} · you are here` : place
}
