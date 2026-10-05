import type { RequestMovements } from "@/lib/trips/movement-types"
import { planTrip } from "@/lib/trips/plan"
import type { MaterialMovement, Movement } from "@/lib/trips/plan-types"

/**
 * What the trip builder is seeded with, and the two pure functions that turn
 * that seed into its first state.
 *
 * Split out of `components/trip-builder.tsx` to keep that file under its cap.
 * Client-safe: the builder runs all of it in the browser.
 */

export type TripDraft = {
  tripId: string
  driver: string
  tripDate: string
  /** `"HH:mm"` — the saved trip's departure time, read back off its `tripDate` instant. */
  startTime: string
  notes: string
  toolIds: string[]
  /** The saved trip's material lines and how much of each it carries. */
  materials: { lineId: string; qty: number }[]
  stopOrder: string[]
  /** Job names of the stops added by hand — read back off their keys (`manualLocationsOf`). */
  manualStops: string[]
  /** Locations that appeared twice among the saved trip's stops — i.e. the side of a cycle it split. */
  splitLocations: string[]
}

/**
 * Reconstructs which side of each circular pickup/drop the saved trip split,
 * purely from its stop locations — there is no Bubble field for this, so a
 * location that was visited twice at save time is the only evidence left.
 *
 * Runs once, against a plan seeded with no preference: `SplitChoice.key` only
 * depends on the movement graph, not on which side got picked, so the default
 * plan's `splitChoices` already names every cycle this trip could have split,
 * and `draft.splitLocations` says which one it actually did. Materials are
 * edges of the same graph, so they go in too.
 */
export function deriveInitialSplitPreference(
  movements: readonly Movement[],
  materials: readonly MaterialMovement[],
  splitLocations: readonly string[]
): Map<string, string> {
  const preference = new Map<string, string>()
  if (movements.length + materials.length === 0 || splitLocations.length === 0) return preference

  const saved = new Set(splitLocations)
  for (const choice of planTrip(movements, {}, materials).splitChoices) {
    if (saved.has(choice.chosen)) continue
    const actual = choice.candidates.find((location) => location !== choice.chosen && saved.has(location))
    if (actual) preference.set(choice.key, actual)
  }
  return preference
}

/**
 * The builder's first material selection, `lineId → qty`.
 *
 * Editing: the draft's own quantities, as saved. Arriving from a request's
 * "Add to a trip": every one of that request's lines, at all of what's left —
 * the same "everything this request still needs" its tools are seeded with —
 * plus, for a delivery, the transfer lines at other sites feeding it (they sit
 * in their pickup's group). Otherwise nothing.
 */
export function initialMaterialSelection(
  groups: readonly RequestMovements[],
  draft: TripDraft | undefined,
  preselectRequestId: string | undefined
): Map<string, number> {
  if (draft) return new Map(draft.materials.map((line) => [line.lineId, line.qty]))
  if (!preselectRequestId) return new Map()
  return new Map(
    groups
      .flatMap((group) => group.materials)
      .filter((line) => line.requestId === preselectRequestId || line.feedsRequestId === preselectRequestId)
      .map((line) => [line.lineId, line.outstanding])
  )
}
