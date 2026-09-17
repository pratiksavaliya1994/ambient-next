import { TripCard } from "@/components/trip-card"
import { Skeleton } from "@/components/ui/skeleton"
import type { TripDetail } from "@/lib/bubble/trips-types"

/** The card grid both `/trips` tabs render into — active trips and closed ones alike. */
export function TripGrid({ trips }: { trips: TripDetail[] }) {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
      {trips.map((trip) => (
        <TripCard key={trip.id} trip={trip} />
      ))}
    </div>
  )
}

export function TripGridSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: 6 }, (_, key) => (
        <Skeleton key={key} className="h-40 w-full rounded-xl" />
      ))}
    </div>
  )
}
