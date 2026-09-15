import { DriverTripCard } from "@/components/driver-trip-card"
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import type { DriverTrip } from "@/lib/dispatch/summary"

/**
 * `/dispatch/active` — every request at `In Transit`, grouped by driver, one
 * card per trip.
 *
 * Split out from the Dispatch board itself (`components/dispatch-board.tsx`)
 * so the picker and the road view are two screens rather than one crowded
 * one; the board still links here, and this links back.
 *
 * Stays a server component: the per-card edit state that reordering needs
 * lives one level down, in `DriverTripCard`, so the grid itself never has to
 * be a client island.
 */
export function ActiveTrips({ trips }: { trips: DriverTrip[] }) {
  if (trips.length === 0) {
    return (
      <Empty className="border border-dashed py-8">
        <EmptyHeader>
          <EmptyTitle>No trips in progress</EmptyTitle>
          <EmptyDescription>Nothing is In Transit right now.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {trips.map((trip) => (
        <DriverTripCard key={trip.driver ?? "__no_driver"} trip={trip} />
      ))}
    </div>
  )
}
