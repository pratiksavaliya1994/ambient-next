import type { Metadata } from "next"
import Link from "next/link"
import { notFound, redirect } from "next/navigation"
import { Suspense } from "react"
import { ArrowLeftIcon } from "lucide-react"

import { TripBuilder } from "@/components/trip-builder"
import { buttonVariants } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { newYorkDayValue, newYorkToday } from "@/lib/bubble/dates"
import { listFieldPms, listUsers } from "@/lib/bubble/reference"
import { getTrip } from "@/lib/bubble/trips-read"
import { shownMovements } from "@/lib/trips/movement-types"
import { listOutstandingMovements } from "@/lib/trips/movements"
import { tripStartTime } from "@/lib/trips/schedule"

export const metadata: Metadata = { title: "Edit trip" }

/**
 * The same builder, seeded from an existing draft.
 *
 * **`Planned` only.** A started trip has written real facts to `tools` — a
 * `Dropped` row means a tool is physically on a job site — and saving is
 * delete-then-recreate, so editing one would silently un-deliver it. The
 * redirect here is a courtesy; the action and the Bubble workflow both refuse
 * it independently, which is what actually holds, since `/wf/` endpoints are
 * reachable directly.
 */
export default async function EditTripPage({ params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await params

  return (
    <div className="flex w-full flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-medium">Edit trip</h1>
          <p className="text-sm text-muted-foreground">Nothing has moved yet, so anything here can still change.</p>
        </div>
        <Link
          href={`/trips/${tripId}`}
          className={buttonVariants({ variant: "ghost", size: "sm", className: "text-muted-foreground" })}
        >
          <ArrowLeftIcon />
          Back to trip
        </Link>
      </div>

      <Suspense fallback={<Skeleton className="h-96 w-full rounded-xl" />}>
        <EditTripBody tripId={tripId} />
      </Suspense>
    </div>
  )
}

async function EditTripBody({ tripId }: { tripId: string }) {
  const trip = await getTrip(tripId)
  if (!trip) notFound()
  if (trip.status !== "Planned") redirect(`/trips/${tripId}`)

  // This trip's own claims are excluded, or its tools would all read as
  // "already on a trip" — their own — and the route panel would plan nothing.
  const [groups, pms, users] = await Promise.all([listOutstandingMovements(tripId), listFieldPms(), listUsers()])

  const driverOptions = [...new Set([...pms.map((pm) => pm.name), ...users.map((user) => user.name)])].sort((a, b) =>
    a.localeCompare(b)
  )

  return (
    <TripBuilder
      groups={shownMovements(groups)}
      driverOptions={driverOptions}
      today={newYorkToday()}
      draft={{
        tripId: trip.id,
        driver: trip.driver ?? "",
        tripDate: trip.tripDate ? newYorkDayValue(trip.tripDate) : newYorkToday(),
        // A trip planned before start times existed holds NY midnight, which
        // `tripStartTime` reads as "never chosen" and seeds at the default —
        // so editing one sets a real time rather than preserving a 12 AM.
        startTime: tripStartTime(trip.tripDate),
        notes: trip.notes ?? "",
        toolIds: trip.items.map((item) => item.toolId),
        stopOrder: trip.stops.map((stop) => stop.stopKey),
      }}
    />
  )
}
