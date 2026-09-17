import type { Metadata } from "next"
import Link from "next/link"
import { Suspense } from "react"
import { PlusIcon } from "lucide-react"

import { TripDateFilter } from "@/components/trip-date-filter"
import { TripGrid, TripGridSkeleton } from "@/components/trip-grid"
import { TripsPagination } from "@/components/trips-pagination"
import { TripsTabs } from "@/components/trips-tabs"
import { buttonVariants } from "@/components/ui/button"
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import { listTripDetails } from "@/lib/bubble/trips-read"
import { isOpenTrip, TRIP_STATUS } from "@/lib/trips/plan-types"

export const metadata: Metadata = { title: "Trips" }

/** Every status that isn't still open — what the "All trips" tab shows. */
const CLOSED_TRIP_STATUSES = TRIP_STATUS.filter((status) => !isOpenTrip(status))

/** Cards per page on the "All trips" tab — a multiple of both grid widths (2 and 3 columns). */
const PAGE_SIZE = 12

/**
 * The trip board — drafts and runs under way, newest first, plus every closed
 * trip behind a second tab.
 *
 * Replaces `/dispatch/active`, which grouped requests by driver name because
 * there was no trip row to group by. There is one now, so a trip has an
 * identity, a detail page and a life of its own.
 *
 * `?tab=` drives which section renders — same URL-as-state idiom
 * `/requests`'s search uses — so only the tab actually on screen fetches
 * anything, and the browser back button moves between them for free.
 */
export default async function TripsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; from?: string; to?: string; page?: string }>
}) {
  const { tab: tabParam, from = "", to = "", page: pageParam } = await searchParams
  const tab = tabParam === "all" ? "all" : "active"
  const page = Math.max(1, Number(pageParam) || 1)

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

      <TripsTabs tab={tab} />

      {tab === "active" ? (
        <Suspense fallback={<TripGridSkeleton />}>
          <ActiveTripsBody />
        </Suspense>
      ) : (
        <div className="flex flex-col gap-4">
          <TripDateFilter key={`${from}|${to}`} from={from} to={to} />
          <Suspense key={`${from}|${to}|${page}`} fallback={<TripGridSkeleton />}>
            <AllTripsBody from={from} to={to} page={page} />
          </Suspense>
        </div>
      )}
    </div>
  )
}

async function ActiveTripsBody() {
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

  return <TripGrid trips={trips} />
}

async function AllTripsBody({ from, to, page }: { from: string; to: string; page: number }) {
  const trips = await listTripDetails(CLOSED_TRIP_STATUSES, { from: from || undefined, to: to || undefined })
  // Newest run first — `tripDate`, not `Created Date`: what this tab is
  // browsing is when a trip happened, not when its row was made.
  trips.sort((a, b) => (b.tripDate ?? "").localeCompare(a.tripDate ?? ""))

  if (trips.length === 0) {
    return (
      <Empty className="border">
        <EmptyHeader>
          <EmptyTitle>No closed trips</EmptyTitle>
          <EmptyDescription>
            {from || to
              ? "Nothing completed or cancelled in that date range."
              : "Nothing has been completed or cancelled yet."}
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }

  const pageCount = Math.max(1, Math.ceil(trips.length / PAGE_SIZE))
  const clampedPage = Math.min(page, pageCount)
  const paged = trips.slice((clampedPage - 1) * PAGE_SIZE, clampedPage * PAGE_SIZE)

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        {trips.length} closed {trips.length === 1 ? "trip" : "trips"}
      </p>
      <TripGrid trips={paged} />
      {pageCount > 1 && <TripsPagination page={clampedPage} pageCount={pageCount} from={from} to={to} />}
    </div>
  )
}
