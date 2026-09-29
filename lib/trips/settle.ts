import "server-only"

import { listTripMaterials } from "@/lib/bubble/tripmaterial-read"
import { readTripPlanKeys } from "@/lib/bubble/trips-read"
import type { PlannedItem, PlannedMaterial, PlannedStop, TripMaterialState } from "@/lib/trips/plan-types"

/**
 * Waiting for a just-saved plan to actually be there.
 *
 * `create-trip` and `save-trip` create their `tripstop` and `triptool` rows
 * through *Schedule API Workflow on a list*, which is **asynchronous**: Bubble
 * returns as soon as the runs are queued, and the workflow's `stops`/`items`
 * counts are the counts of what was *sent*, not of what has been written. So
 * the action returns, the browser navigates to the run sheet, and the page
 * reads a plan that is still arriving — a stop whose tools haven't landed
 * renders as "Nothing happens here", and a tool whose stops haven't landed
 * renders nowhere at all. On a save it is worse than on a create, because
 * `save-trip` deletes the old rows first: the previous plan is already gone.
 *
 * A reload a moment later looks right, which is exactly the tell.
 *
 * So the action waits here before it returns. Key sets rather than counts:
 * counting cannot tell a new row that has landed from an old one Bubble's
 * search index hasn't dropped yet, and during a save both are in flight at
 * once.
 *
 * The ladder gives up after about five seconds. Not settling is **not** a
 * failure — the write was accepted and the rows will appear; it only means the
 * screen the dispatcher is about to see may be short, which is what the
 * caller's warning says.
 */

/** Exported so the other async fan-outs (`waitForMaterialLines`) wait on the same ladder. */
export const RETRY_DELAYS_MS = [250, 500, 900, 1400, 2000] as const

export const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

function sameKeys(live: ReadonlySet<string>, expected: ReadonlySet<string>): boolean {
  return live.size === expected.size && [...expected].every((key) => live.has(key))
}

/** `true` once Bubble holds exactly this plan; `false` if it still didn't after the last try. */
export async function waitForTripPlan(
  tripId: string,
  stops: readonly PlannedStop[],
  items: readonly PlannedItem[],
  materials: readonly PlannedMaterial[] = []
): Promise<boolean> {
  const expectedStops = new Set(stops.map((stop) => stop.stopKey))
  const expectedTools = new Set(items.map((item) => item.toolId))
  const expectedLines = new Set(materials.map((material) => material.lineId))

  for (let attempt = 0; ; attempt++) {
    const live = await readTripPlanKeys(tripId)
    if (
      sameKeys(live.stopKeys, expectedStops) &&
      sameKeys(live.toolIds, expectedTools) &&
      sameKeys(live.lineIds, expectedLines)
    ) {
      return true
    }
    if (attempt === RETRY_DELAYS_MS.length) return false
    await sleep(RETRY_DELAYS_MS[attempt])
  }
}

/** What the dispatcher is told when the fan-out is still running. One sentence, in both actions. */
export const PLAN_STILL_LANDING =
  "Saved, but Bubble is still writing the stops. The run sheet may look short for a moment — reload it."

/**
 * Waits until every one of these lines' rows on this trip reads `state`.
 *
 * `complete-trip-stop` hands job drops to `drop-material-at-site` and yard
 * unloads to `return-material-stock`, both through *Schedule API Workflow on
 * a list*. So the `Dropped` / `Returned` flip, and the stock or site write
 * that comes before it, lands **after** the call returns. `true` once all of
 * them read `state`; `false` if some still didn't after the last try. Like
 * `waitForTripPlan`, not settling is a warning, not a failure.
 */
export async function waitForMaterialRows(
  tripId: string,
  lineIds: readonly string[],
  state: TripMaterialState
): Promise<boolean> {
  if (lineIds.length === 0) return true
  const wanted = new Set(lineIds)

  for (let attempt = 0; ; attempt++) {
    const rows = (await listTripMaterials([tripId])).filter((row) => wanted.has(row.lineId))
    if (rows.length > 0 && rows.every((row) => row.state === state)) return true
    if (attempt === RETRY_DELAYS_MS.length) return false
    await sleep(RETRY_DELAYS_MS[attempt])
  }
}

/** What the driver is told when those flips are still landing. */
export const MATERIALS_STILL_LANDING =
  "Stop recorded, but Bubble is still finishing the material lines. Reload the trip in a moment to check."
