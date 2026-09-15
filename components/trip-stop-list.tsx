import { TripStopRow } from "@/components/trip-stop-row"
import type { DispatchRequestSummary } from "@/lib/dispatch/summary"

/**
 * A driver's stops as a plain numbered timeline — what the card shows when it
 * isn't in edit mode. The draggable counterpart is
 * `components/trip-stop-sortable-list.tsx`; both render the same
 * `TripStopRow`, so the only visible difference between the two modes is the
 * grip handles.
 *
 * Stays a server component: nothing here is interactive, so the read-only
 * screen doesn't pull dnd-kit into its bundle.
 */
export function TripStopList({ stops }: { stops: DispatchRequestSummary[] }) {
  return (
    <div className="flex flex-col">
      {stops.map((stop, index) => (
        <TripStopRow key={stop.id} stop={stop} position={index + 1} isLast={index === stops.length - 1} />
      ))}
    </div>
  )
}
