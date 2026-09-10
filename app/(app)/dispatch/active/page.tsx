import type { Metadata } from "next"
import Link from "next/link"
import { Suspense } from "react"
import { ArrowLeftIcon, ListIcon } from "lucide-react"

import { ActiveTrips } from "@/components/active-trips"
import { buttonVariants } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { listRequestsByStatus } from "@/lib/bubble/requests"
import { toDispatchSummaries, type DispatchRequestSummary } from "@/lib/dispatch/summary"

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

  const tripsByDriver = new Map<string, DispatchRequestSummary[]>()
  for (const request of summaries) {
    const key = request.driver ?? "Unknown driver"
    const list = tripsByDriver.get(key) ?? []
    list.push(request)
    tripsByDriver.set(key, list)
  }

  return <ActiveTrips tripsByDriver={[...tripsByDriver.entries()].sort((a, b) => a[0].localeCompare(b[0]))} />
}
