import { stillLoadedMaterials } from "@/lib/bubble/trip-materials-types"
import { isStopDone, stillLoaded, stopWork, type TripDetail } from "@/lib/bubble/trips-types"

/**
 * Why a running trip can't be finished yet, or `null` when it can — shared by
 * the run sheet (which hides Finish while this says anything) and
 * `completeTripAction` (which refuses on it), so the two can't disagree.
 *
 * **Every stop recorded comes first.** Asking only "is anything still on the
 * truck?" let a trip that had just started close straight away: nothing has
 * been collected yet, every row is still `Planned`, and an empty van reads as a
 * finished run. A stop can always be finished — skip a collect, refuse a
 * drop — so this never strands a driver.
 *
 * The on-the-truck check stays behind it for a row whose stop key resolves to
 * no stop: `stopWork` drops it from every card, so only this sees it.
 */
export function finishBlocker(trip: TripDetail): string | null {
  const open = stopWork(trip).filter((entry) => !isStopDone(entry))
  if (open.length > 0) {
    const next = open[0].stop.location
    return open.length === 1
      ? `Record ${next} before finishing the trip.`
      : `Record every stop before finishing the trip — ${open.length} to go, next is ${next}.`
  }

  const onboard = [
    ...stillLoaded(trip.items).map((item) => item.toolName),
    ...stillLoadedMaterials(trip.materials).map((row) => row.name),
  ]
  if (onboard.length === 0) return null
  const names = onboard.slice(0, 3).join(", ")
  return onboard.length === 1
    ? `${names} is still on the truck. Record its stop before finishing.`
    : `${onboard.length} items are still on the truck (${names}${onboard.length > 3 ? ", …" : ""}). Record their stops before finishing.`
}
