import type { Metadata } from "next"
import Link from "next/link"
import { Suspense } from "react"
import { ArrowLeftIcon, ListIcon } from "lucide-react"

import { ActiveTrips } from "@/components/active-trips"
import { buttonVariants } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { listRequestsByStatus } from "@/lib/bubble/requests"
import { compareStops } from "@/lib/dispatch/stop-order"
import { toDispatchSummaries, type DispatchRequestSummary, type DriverTrip } from "@/lib/dispatch/summary"

export const metadata: Metadata = { title: "Active trips" }

/**
 * Every request at `In Transit`, grouped by driver — split out of
 * `/dispatch` (`components/dispatch-board.tsx`) onto its own screen so the
 * picker and the road view don't have to share one page. The board links
 * here; this links back.
 *
 * Each request links to its own detail page, `/requests/{id}`, where the
 * "Complete delivery" action lives behind a confirmation dialog (2C). See
 * `docs/phase-2bc-dispatch-offload.md`.
 */
export default function ActiveTripsPage() {
  return (
    <div className="flex w-full flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-medium">Active trips</h1>
          <p className="text-sm text-muted-foreground">Requests already in transit, grouped by driver.</p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/requests"
            className={buttonVariants({ variant: "ghost", size: "sm", className: "text-muted-foreground" })}
          >
            <ListIcon />
            Requests
          </Link>
          <Link
            href="/dispatch"
            className={buttonVariants({ variant: "ghost", size: "sm", className: "text-muted-foreground" })}
          >
            <ArrowLeftIcon />
            Back to dispatch
          </Link>
        </div>
      </div>

      <Suspense fallback={<Skeleton className="h-64 w-full rounded-xl" />}>
        <ActiveTripsBody />
      </Suspense>
    </div>
  )
}

async function ActiveTripsBody() {
  const inTransit = await listRequestsByStatus("In Transit")
  const summaries = await toDispatchSummaries(inTransit)

  // `null` stays `null` rather than becoming an "Unknown driver" string: a
  // driverless bucket can't be sequenced (see `DriverTrip`), and the card has
  // to be able to tell that apart from a driver actually named that.
  const tripsByDriver = new Map<string | null, DispatchRequestSummary[]>()
  for (const request of summaries) {
    const list = tripsByDriver.get(request.driver) ?? []
    list.push(request)
    tripsByDriver.set(request.driver, list)
  }

  // `compareStops` puts sequenced stops in their saved order and everything
  // else by time — which, until someone saves an order, is still an
  // improvement on the `Created Date` descending order these arrive in.
  const trips: DriverTrip[] = [...tripsByDriver.entries()]
    .map(([driver, stops]) => ({ driver, stops: [...stops].sort(compareStops) }))
    .sort((a, b) => (a.driver === null ? 1 : b.driver === null ? -1 : a.driver.localeCompare(b.driver)))

  return <ActiveTrips trips={trips} />
}
