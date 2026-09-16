import type { Metadata } from "next"
import Link from "next/link"
import { Suspense } from "react"
import { PlusIcon } from "lucide-react"

import { TripCard } from "@/components/trip-card"
import { buttonVariants } from "@/components/ui/button"
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import { Skeleton } from "@/components/ui/skeleton"
import { listTripDetails } from "@/lib/bubble/trips-read"

export const metadata: Metadata = { title: "Trips" }

/**
 * The trip board — drafts and runs under way, newest first.
 *
 * Replaces `/dispatch/active`, which grouped requests by driver name because
 * there was no trip row to group by. There is one now, so a trip has an
 * identity, a detail page and a life of its own.
 */
export default function TripsPage() {
  return (
    <div className="flex w-full flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-medium">Trips</h1>
          <p className="text-sm text-muted-foreground">
            Planned routes and runs under way. A trip is a driver and an ordered list of stops.
          </p>
        </div>
        <Link href="/trips/new" className={buttonVariants({ size: "sm" })}>
          <PlusIcon />
          New trip
        </Link>
      </div>

      <Suspense fallback={<Skeleton className="h-64 w-full rounded-xl" />}>
        <TripsBody />
      </Suspense>
    </div>
  )
}

async function TripsBody() {
  const trips = await listTripDetails(["Planned", "In Transit"])

  if (trips.length === 0) {
    return (
      <Empty className="border border-dashed py-12">
        <EmptyHeader>
          <EmptyTitle>No trips yet</EmptyTitle>
          <EmptyDescription>
            Build one from the tools waiting to move. Nothing leaves the warehouse until you start it.
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Link href="/trips/new" className={buttonVariants({ size: "sm" })}>
            <PlusIcon />
            New trip
          </Link>
        </EmptyContent>
      </Empty>
    )
  }

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
      {trips.map((trip) => (
        <TripCard key={trip.id} trip={trip} />
      ))}
    </div>
  )
}
