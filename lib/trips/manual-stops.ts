import { isWarehouseDestination } from "@/lib/bubble/enums"
import type { StopWork } from "@/lib/bubble/trips-types"
import type { PlannedItem, PlannedMaterial, PlannedStop, StopKind, TripPlan } from "@/lib/trips/plan-types"

/**
 * Stops the dispatcher adds by hand — a job on the route that no picked tool or
 * material needs yet.
 *
 * Pure and client-safe, like `plan.ts`: the builder runs it on every tick over
 * a fresh `planTrip`, and the server action runs it again over its own re-plan.
 *
 * **A manual stop is marked by its key, not by a field.** `tripstop` has no
 * column for it and none is needed: keys are opaque to Bubble, and the
 * `#manual` suffix survives `save-trip`'s delete-and-recreate the same way
 * `#collect`/`#drop` do. The edit page reads it back off the saved keys
 * (`manualLocationsOf`), so a hand-added stop stays on the route after its last
 * tool is taken off it again.
 *
 * **Cargo for the same job lands in the manual stop.** An unsplit planner stop
 * is keyed by its bare location, so when a picked tool is going to (or coming
 * from) a manual stop's job, that one stop is re-keyed to the manual key and
 * every row pointing at it follows — one visit, in the slot the dispatcher put
 * it. A location the planner already **split** into two visits is left alone:
 * it is already on the route twice, and a third visit would be a stop for
 * nothing.
 */

const MANUAL_SUFFIX = "#manual"

export function manualStopKey(location: string): string {
  return `${location}${MANUAL_SUFFIX}`
}

export function isManualStopKey(stopKey: string): boolean {
  return stopKey.endsWith(MANUAL_SUFFIX)
}

/** The manual stops' locations among a saved trip's stops, in route order. */
export function manualLocationsOf(stops: readonly { stopKey: string; location: string }[]): string[] {
  return [...new Set(stops.filter((stop) => isManualStopKey(stop.stopKey)).map((stop) => stop.location))]
}

function kindOf(location: string): StopKind {
  return isWarehouseDestination(location) ? "Warehouse" : "Job"
}

type PlanRows = Pick<TripPlan, "stops" | "items" | "materials">

/**
 * Lays the manual stops over a fresh plan. Deterministic, so the builder and
 * the server produce the same keys and a dragged order survives the round trip.
 *
 * A manual stop with no planner stop at its location is appended with the next
 * `seq`; the caller's drag order then places it.
 */
export function withManualStops(plan: PlanRows, manualLocations: readonly string[]): PlanRows {
  let { stops, items, materials } = plan

  for (const location of new Set(manualLocations)) {
    const here = stops.filter((stop) => stop.location === location)
    if (here.length > 1) continue

    const key = manualStopKey(location)
    if (here.length === 0) {
      stops = [...stops, { stopKey: key, seq: stops.length + 1, location, kind: kindOf(location) }]
      continue
    }

    const from = here[0].stopKey
    if (from === key) continue
    stops = stops.map((stop) => (stop.stopKey === from ? { ...stop, stopKey: key } : stop))
    items = items.map((item) => rekey(item, from, key))
    materials = materials.map((material) => rekey(material, from, key))
  }

  return { stops, items, materials }
}

function rekey<T extends PlannedItem | PlannedMaterial>(row: T, from: string, to: string): T {
  if (row.fromStopKey !== from && row.toStopKey !== from) return row
  return {
    ...row,
    fromStopKey: row.fromStopKey === from ? to : row.fromStopKey,
    toStopKey: row.toStopKey === from ? to : row.toStopKey,
  }
}

/**
 * Carries a stop's place in the dispatcher's drag order across the key change
 * adding or removing a manual stop causes — without it, a stop that was already
 * on the route jumps to the end the moment it is made manual.
 */
export function renameInOrder(order: readonly string[], from: string, to: string): string[] {
  return order.map((stopKey) => (stopKey === from ? to : stopKey))
}

/**
 * A stop on a saved trip with nothing to collect, drop or show as refused — a
 * manual stop no cargo reached. The driver marks it done by hand
 * (`markStopDoneAction`), since there are no rows to decide it.
 */
export function isEmptyStopWork(work: StopWork): boolean {
  return (
    [work.collect, work.drop, work.refused, work.collectMaterials, work.dropMaterials, work.refusedMaterials].every(
      (list) => list.length === 0
    )
  )
}

/** Whether a planned stop has no tool or material collected or dropped at it. */
export function isEmptyPlannedStop(
  stop: PlannedStop,
  items: readonly PlannedItem[],
  materials: readonly PlannedMaterial[]
): boolean {
  return ![...items, ...materials].some((row) => row.fromStopKey === stop.stopKey || row.toStopKey === stop.stopKey)
}
