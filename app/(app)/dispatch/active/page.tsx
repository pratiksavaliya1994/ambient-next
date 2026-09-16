import { redirect } from "next/navigation"

/**
 * The old Active-trips screen, retired by phase 4.
 *
 * It reconstructed a "trip" by grouping `request where status is In Transit` by
 * driver *name*, because there was no trip row to group by. There is one now,
 * so `/trips` shows real trips with real identities — and, more importantly,
 * stops in route order rather than requests with their collect-from-elsewhere
 * legs nested underneath.
 */
export default function ActiveTripsRedirect() {
  redirect("/trips")
}
