import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { Suspense } from "react"
import { ArrowLeftIcon, PencilIcon } from "lucide-react"

import { TripRunSheet } from "@/components/trip-run-sheet"
import { TripStatusBadge } from "@/components/trip-status-badge"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { buttonVariants } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { newYorkDayLabel } from "@/lib/bubble/dates"
import { getTrip } from "@/lib/bubble/trips-read"
import { stopWork } from "@/lib/bubble/trips-types"
import { formatClock, minutesOfTime, tripFinishMinutes, tripStartTime } from "@/lib/trips/schedule"

export const metadata: Metadata = { title: "Trip" }

/**
 * A trip's run sheet — the driver-facing screen.
 *
 * Stops in route order, each with what to collect and what to leave. A tool
 * being collected from another job site is a **stop**, not a footnote under the
 * request that wanted it, which is the whole reason this screen exists.
 */
export default async function TripPage({ params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await params

  return (
    <div className="flex w-full flex-col gap-6">
      <Suspense fallback={<Skeleton className="h-96 w-full rounded-xl" />}>
        <TripBody tripId={tripId} />
      </Suspense>
    </div>
  )
}

async function TripBody({ tripId }: { tripId: string }) {
  const trip = await getTrip(tripId)
  if (!trip) notFound()

  // The day's span, from the same derivation each stop renders: departure, to
  // the moment the last stop's own half-hour is up.
  //
  // Counted off `stopWork`, not `trip.stops`, because the two can differ: a run
  // carrying a refused tool home grows a yard stop that has no `tripstop` row
  // behind it. The header and the last card's rail are on screen together, so
  // reading the row count here quietly ends the day an hour early.
  const stops = stopWork(trip).length
  const startTime = tripStartTime(trip.tripDate)
  const finish = tripFinishMinutes(startTime, stops)
  const span = `${formatClock(minutesOfTime(startTime))} – ${formatClock(finish)}`

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <Avatar>
            <AvatarFallback>{(trip.driver ?? "?").slice(0, 2).toUpperCase()}</AvatarFallback>
          </Avatar>
          <div>
            <h1 className="text-xl font-medium">{trip.driver ?? "No driver"}</h1>
            <p className="text-sm text-muted-foreground">
              {trip.tripDate ? newYorkDayLabel(trip.tripDate) : "No date"}
              {stops > 0 && <span className="tabular-nums"> · {span}</span>} · {trip.items.length}{" "}
              {trip.items.length === 1 ? "tool" : "tools"}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <TripStatusBadge status={trip.status} />
          {/* Editing is a `Planned`-only affordance, and the same guard exists
              in the action and again in Bubble — `save-trip` is
              delete-then-recreate, which would un-deliver a started trip. */}
          {trip.status === "Planned" && (
            <Link
              href={`/trips/${trip.id}/edit`}
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              <PencilIcon />
              Edit
            </Link>
          )}
          <Link
            href="/trips"
            className={buttonVariants({ variant: "ghost", size: "sm", className: "text-muted-foreground" })}
          >
            <ArrowLeftIcon />
            Trips
          </Link>
        </div>
      </div>

      {trip.notes && <p className="rounded-lg border bg-muted/30 px-3 py-2 text-sm">{trip.notes}</p>}

      <TripRunSheet trip={trip} />
    </>
  )
}
